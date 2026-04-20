# Começando

Este guia cobre instalação, configuração de certificado A1 e a primeira chamada em **Produção Restrita** (homologação).

## Requisitos

- **Node.js 20+**
- **Certificado digital A1** (ICP-Brasil, arquivo `.pfx` ou `.p12`) emitido pelo CNPJ que emitirá notas
- **CNPJ habilitado** no Emissor Nacional com Inscrição Municipal ativa no município aderente ao Padrão Nacional

## Instalação

::: code-group
```bash [npm]
npm install open-nfse
```
```bash [pnpm]
pnpm add open-nfse
```
```bash [yarn]
yarn add open-nfse
```
:::

## Configuração mínima

```typescript
import { readFileSync } from 'node:fs';
import { NfseClient, Ambiente } from 'open-nfse';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,     // ou Ambiente.Producao
  certificado: {
    pfx: readFileSync('./certificado.pfx'),
    password: process.env.CERT_PASSWORD!,
  },
});
```

::: tip Certificado no lugar certo
Nunca commite o `.pfx` nem a senha. Use variáveis de ambiente, KMS ou Vault. O `.gitignore` padrão já bloqueia `*.pfx` / `*.p12` / `*.pem`.
:::

Esse shape já basta para **consulta** e **DANFSe**. Para emitir, vale também configurar um `DpsCounter` (gera `nDPS` atomicamente) e um `RetryStore` (persiste falhas transientes):

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';

const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
  dpsCounter: createInMemoryDpsCounter(),  // em prod: wrap Postgres UPDATE ... RETURNING
  retryStore: createInMemoryRetryStore(),  // em prod: wrap sua tabela de pendentes
});
```

Em produção, troque as impls in-memory por impls que conversam com seu banco. Veja [Integração em serviços](./integracao) para o schema SQL.

## Primeira chamada — consulta

```typescript
const resultado = await cliente.fetchByChave(
  '21113002200574753000100000000000146726037032711025',
);

console.log(resultado.nfse.infNFSe.emit.xNome);       // "VOGA LTDA"
console.log(resultado.nfse.infNFSe.valores.vLiq);     // 51.60
```

Consulta não exige `dpsCounter` nem `retryStore` — a configuração mínima já basta.

## Primeira emissão

`emitir(params)` retorna um resultado **discriminated**: `ok` se autorizada, `retry_pending` se a rede falhou (a lib salva no store e um cron replay fecha depois), e lança `ReceitaRejectionError` em rejeições permanentes.

```typescript
import {
  OpcaoSimplesNacional, RegimeEspecialTributacao,
  ReceitaRejectionError,
} from 'open-nfse';

try {
  const r = await cliente.emitir({
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Consultoria' },
    valores: { vServ: 1500.0, aliqIss: 2.5 },
    tomador: { documento: { CNPJ: '11222333000181' }, nome: 'Acme Ltda' },
  });

  if (r.status === 'ok') {
    console.log('Chave autorizada:', r.nfse.chaveAcesso);
    console.log('Número municipal:', r.nfse.nfse.infNFSe.nNFSe);
  } else {
    // r.status === 'retry_pending' — já persistido no retryStore pela lib
    console.warn('Transiente, pendente:', r.pending.id);
  }
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    console.error(`Rejeitada: [${err.codigo}] ${err.descricao}`);
  } else {
    throw err;
  }
}
```

Três coisas importantes sobre esse fluxo:

1. **Validações offline rodam antes do counter** — DPS com CPF/CNPJ inválido, XSD quebrado ou CEP inexistente não queima `nDPS`.
2. **Transiente nunca duplica** — o pendente no store tem o XML já assinado; replay posta de novo e SEFIN deduplica via `infDPS.Id`.
3. **Rejeição permanente consome o `nDPS`** — o número foi gasto, mas a nota não virou NFS-e. Registre para auditoria e siga.

Produção em mais detalhe: [Emitir NFS-e](./emitir). Schema SQL do store: [Integração em serviços](./integracao).

## Fechando o cliente

```typescript
await cliente.close();
```

::: tip `close()` é single-shot
O `NfseClient` é de vida única. Após `close()`, qualquer chamada subsequente lança `ClientClosedError`. Se o processo é longo-lived (servidor, worker) e você não precisa liberar o dispatcher, simplesmente não chame `close()`. Para reconectar (rotação de certificado), instancie um novo `NfseClient`.
:::

## Provider de certificado pluggable

Para KMS, Vault, ou qualquer outra origem, implemente `CertificateProvider`:

```typescript
import type { CertificateProvider } from 'open-nfse';

const provider: CertificateProvider = {
  async load() {
    const pfx = await kms.getSecretBinary('nfse-cert-pfx');
    const password = await kms.getSecretString('nfse-cert-password');
    return parsePfx(pfx, password);
  },
};

const cliente = new NfseClient({ ambiente: Ambiente.Producao, certificado: provider });
```

Ou use `providerFromFile` para o caso comum:

```typescript
import { providerFromFile } from 'open-nfse';

const provider = providerFromFile('/secure/cert.pfx', process.env.CERT_PASSWORD!);
```

## Logger estruturado

```typescript
import type { Logger } from 'open-nfse';

const logger: Logger = {
  debug: (msg, ctx) => console.log(`[DEBUG ${msg}]`, ctx),
  info: (msg, ctx) => console.log(`[INFO ${msg}]`, ctx),
  warn: (msg, ctx) => console.warn(`[WARN ${msg}]`, ctx),
  error: (msg, ctx) => console.error(`[ERROR ${msg}]`, ctx),
};

const cliente = new NfseClient({ ambiente, certificado, logger });
```

Eventos emitidos: `http.request`, `http.response` com `method`, `url`, `status`, `latencyMs`.

## Próximos passos

- [Consultar NFS-e](./consultar) — fetch por chave + distribuição por NSU
- [Emitir NFS-e](./emitir) — `emitir(params)` com counter + retry store
- [Substituir e cancelar](./substituir-cancelar) — eventos com máquina de 4 estados
- [Parâmetros municipais](./parametros) — alíquotas, benefícios, convênio etc.
- [DANFSe (PDF)](./danfse) — online com fallback local
- [Testando com o fake](./testing) — `NfseClientFake`
