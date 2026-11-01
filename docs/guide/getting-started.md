# Começando

Este guia cobre instalação, escolha do leiaute, configuração de certificado A1 e a primeira chamada em **Produção Restrita** (homologação).

::: tip Trilha recomendada
1. **Configuração mínima** (abaixo) — escolha o `layout`; consulta e DANFSe já funcionam, sem banco de dados.
2. **Primeira emissão** com stores in-memory — nada para instalar além da lib.
3. **Produção** — troque os stores in-memory por 3 tabelas no seu banco + um cron de `replayPendingEvents`. O SQL pronto está em [Integração em serviços](./integracao#minimo).
:::

## Requisitos

- **Node.js 20+**
- **Certificado digital A1** (ICP-Brasil, arquivo `.pfx` ou `.p12`) emitido pelo CNPJ que emitirá notas
- **CNPJ habilitado** no Emissor Nacional com Inscrição Municipal ativa no município aderente ao Padrão Nacional

## Instalação

Esta documentação descreve a **0.12**, ainda em release candidate sob o dist-tag `next`:

::: code-group
```bash [npm]
npm install --save-exact open-nfse@next
```
```bash [pnpm]
pnpm add --save-exact open-nfse@next
```
```bash [yarn]
yarn add --exact open-nfse@next
```
:::

::: warning Release candidate
`npm install open-nfse` (sem tag) instala a 0.11.x estável, que só conhece o leiaute vigente e não tem a opção `layout`. Na 0.12, os tipos `*Nt009` e os inputs `ajusteBC`/`ibsCbs` podem mudar entre RCs (uma `0.12.0-rc.N` por novo bundle de Produção Restrita) até a `0.12.0` final — por isso a versão exata. Vindo da 0.11: [Migração 0.11 → 0.12](./migracao-0.12).
:::

## Escolha do leiaute

A NT 009/2026 troca o leiaute da DPS e da NFS-e em **01/12/2026**. A lib suporta os dois, e o cliente trabalha com um deles:

| `layout`  | Quando | Bundle XSD |
|-----------|--------|------------|
| `'nt004'` | Leiaute vigente em produção — vale até **30/11/2026** | `20260727` |
| `'nt009'` | NT 009/2026 release 1 — produção a partir de **01/12/2026**; já disponível em Produção Restrita | `esquemas_prod_restrita_20261020` |

- `layout` é **obrigatório** em `new NfseClient`, `new NfseClientFake`, `buildDps` e nos validadores de XSD (`validateDpsXml(xml, { layout })`). Não há default nem troca automática por data.
- O leiaute de um cliente não muda: na virada, crie um novo cliente com `layout: 'nt009'` — e **drene o `RetryStore` com o cliente `nt004` antes** ([roteiro](./migracao-0.12#virada-retrystore)).
- A leitura independe do leiaute do cliente: `fetchByChave` devolve NFS-e dos dois formatos, e `parseNfseXml` lê os dois (inclusive o `xmlDocumento` cru que `fetchByNsu` devolve).

Detalhes em [Leiautes](./layouts).

## Configuração mínima

```typescript
import { readFileSync } from 'node:fs';
import { NfseClient, Ambiente } from 'open-nfse';

const cliente = new NfseClient({
  layout: 'nt004',                         // obrigatório: 'nt004' | 'nt009' — cliente: NfseClient<'nt004'>
  ambiente: Ambiente.ProducaoRestrita,     // ou Ambiente.Producao
  certificado: {
    pfx: readFileSync('./certificado.pfx'),
    password: process.env.CERT_PASSWORD!,
  },
});
```

::: tip Certificado no lugar certo
Nunca commite o `.pfx` nem a senha. Use variáveis de ambiente, KMS ou Vault, e inclua `*.pfx` / `*.p12` / `*.pem` no `.gitignore` do seu projeto.
:::

Esse shape já basta para **consulta** e **DANFSe**. Para emitir, vale também configurar um `DpsCounter` (gera `nDPS` atomicamente) e um `RetryStore` (persiste falhas transientes):

```typescript
import {
  NfseClient, Ambiente,
  createInMemoryDpsCounter, createInMemoryRetryStore,
} from 'open-nfse';

const cliente = new NfseClient({
  layout: 'nt004',
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
  dpsCounter: createInMemoryDpsCounter(),  // em prod: wrap Postgres UPDATE ... RETURNING
  retryStore: createInMemoryRetryStore(),  // em prod: wrap sua tabela de pendentes
});
```

Em produção, troque as impls in-memory por impls que conversam com seu banco. Veja [Integração em serviços](./integracao) para o schema SQL.

::: warning `ambiente` não define o `tpAmb`
O `tpAmb` da DPS tem default `'2'` (Homologação), seja qual for o `ambiente`. Com `Ambiente.Producao`, passe `tpAmb: TipoAmbienteDps.Producao` em cada emissão, senão a Receita rejeita com E0006 (detalhes em [Emitir](./emitir#setup)).
:::

## Primeira chamada — consulta

```typescript
const resultado = await cliente.fetchByChave(
  '21113002200574753000100000000000146726037032711025',
);

console.log(resultado.nfse.layout);                   // 'nt004' — detectado pelo parser
console.log(resultado.nfse.infNFSe.emit.xNome);       // "VOGA LTDA"
console.log(resultado.nfse.infNFSe.valores.vLiq);     // 51.6
```

Consulta não exige `dpsCounter` nem `retryStore` — a configuração mínima já basta. O resultado é a união `NFSe`, qualquer que seja o `layout` do cliente: campos comuns aos dois leiautes saem direto; para os exclusivos, estreite por `resultado.nfse.layout === 'nt009'` (veja [Leiautes](./layouts#leitura-os-dois-leiautes-sem-perda)).

## Primeira emissão

`emitir(params)` retorna um resultado **discriminated**: `ok` se autorizada, `retry_pending` se a rede falhou (a lib salva no store e um cron replay fecha depois). Rejeições permanentes lançam: `ReceitaRejectionError` (Receita) ou um `ValidationError` local (`RuleViolationError`, `XsdValidationError`, `InvalidCnpjError`, …), este antes de consumir o `nDPS`.

```typescript
import {
  OpcaoSimplesNacional, RegimeApuracaoSimplesNacional, RegimeEspecialTributacao,
  ReceitaRejectionError, UnreadableAuthorizedNfseError,
} from 'open-nfse';

try {
  const r = await cliente.emitir({
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Consultoria' },
    // ME/EPP exige pTotTribSN (% aprox. do Simples); MEI usa o default;
    // Não Optante usa vTotTrib/pTotTrib. Veja o guia Emitir.
    valores: { vServ: 1500.0, aliqIss: 2.5, pTotTribSN: 6.0 },
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
  if (err instanceof UnreadableAuthorizedNfseError) {
    // Autorizada, mas a resposta não virou DTO: guarde a chave (e err.xmlNfse) e NÃO reemita.
    console.error('Autorizada, resposta ilegível:', err.chaveAcesso);
  } else if (err instanceof ReceitaRejectionError) {
    console.error(`Rejeitada: [${err.codigo}] ${err.descricao}`);
  } else {
    throw err;
  }
}
```

### A mesma nota no `nt009`

Com `layout: 'nt009'`, `emitir` aceita também os inputs de alto nível `ibsCbs` (grupo IBS/CBS) e `ajusteBC` (ajuste da base de cálculo do ISSQN) — e só os aceita nesse leiaute:

```typescript
const cliente009 = new NfseClient({
  layout: 'nt009',                         // cliente: NfseClient<'nt009'>
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx, password },
  dpsCounter: createInMemoryDpsCounter(),
  retryStore: createInMemoryRetryStore(),
});

const r = await cliente009.emitir({
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    regime: {
      opSimpNac: OpcaoSimplesNacional.MeEpp,
      regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    },
  },
  serie: '1',
  // Com ibsCbs, servico.cNBS é obrigatório (E0322).
  servico: { cTribNac: '010101', cNBS: '115021000', descricao: 'Consultoria' },
  valores: { vServ: 1500.0, aliqIss: 2.5, pTotTribSN: 6.0 },
  tomador: {
    documento: { CNPJ: '11222333000181' },
    nome: 'Acme Ltda',
    endereco: {
      codMunicipio: '3550308', cep: '01310100',
      logradouro: 'Avenida Paulista', numero: '1578', bairro: 'Bela Vista',
    },
  },
  // 01.01 → cClassTrib 000001 e cIndOp 100301 (domicílio do adquirente = tomador), Anexo VIII.
  ibsCbs: { classificacao: { CST: '000', cClassTrib: '000001' }, cIndOp: '100301' },
});
// r.status === 'ok' → r.nfse.nfse é NfseNt009
```

O Anexo I do `nt009` exige o grupo IBS/CBS para competência a partir de 01/10/2026 (E0855), mas pela orientação do CGNFS-e de 07/08/2026 a omissão do grupo não rejeita a nota até 31/12/2026 (reafirmada em 29/10/2026, sem citar prazo final) — a lib também não checa a E0855 localmente. As regras de rejeição **fechadas** do Anexo I (as que dependem só dos inputs) lançam `RuleViolationError` com o código antes de consumir o `nDPS`. Exemplos com `ajusteBC`, locação (99.03) e bens móveis em [Leiautes](./layouts#inputs-de-alto-nivel-do-nt009).

### O que garante o fluxo

Quatro coisas importantes sobre esse fluxo (nos dois leiautes):

1. **Validações offline rodam antes do counter** — DPS com CPF/CNPJ inválido, XSD quebrado ou CEP inexistente não queima `nDPS`.
2. **Transiente nunca duplica** — o pendente no store tem o XML já assinado; o replay re-posta o mesmo `infDPS.Id` (não cria nota nova) e, se a DPS já tinha virado NFS-e, o re-POST volta rejeitado (E0014; ou E1235, schema, depois da virada de leiaute) e a lib reconcilia via `GET /dps/{id}` antes de remover a entrada — só um 404 confirma que a nota não existe.
3. **Rejeição permanente da Receita consome o `nDPS`** — o número foi gasto, mas a nota não virou NFS-e. Registre para auditoria e siga.
4. **Nota autorizada nunca vira falha** — se a resposta autorizada não puder ser lida (XML corrompido, NFS-e de outro leiaute), a lib lança `UnreadableAuthorizedNfseError` com `chaveAcesso`: a nota existe, não reemita. Esse erro nunca é transiente nem vai para o `RetryStore`.

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
import { parsePfx } from 'open-nfse';
import type { CertificateProvider } from 'open-nfse';

const provider: CertificateProvider = {
  async load() {
    const pfx = await kms.getSecretBinary('nfse-cert-pfx');
    const password = await kms.getSecretString('nfse-cert-password');
    return parsePfx(pfx, password);
  },
};

const cliente = new NfseClient({ layout: 'nt004', ambiente: Ambiente.Producao, certificado: provider });
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

const cliente = new NfseClient({ layout: 'nt004', ambiente, certificado, logger });
```

Principais eventos (o primeiro argumento é o nome do evento):

- `debug` `http.request` / `http.response` — `method`, `url`, `status`, `latencyMs`.
- `warn` `nfse.parse.unexpected_field` / `nfse.parse.rule_violation` — o parser achou um campo de outro leiaute (ignorado) ou um valor que o Anexo I rejeita (mantido).
- `error` `nfse.emit.authorized_unreadable` — nota autorizada cuja resposta não pôde ser lida.
- `nfse.replay.*` — reconciliação e divergência de leiaute no `replayPendingEvents` (veja [Emitir NFS-e](./emitir)).
- `warn` `danfse.online.deprecated` / `danfse.online.fallback` — uso das estratégias online do DANFSe.

## Próximos passos

- [Consultar NFS-e](./consultar) — fetch por chave + distribuição por NSU
- [Emitir NFS-e](./emitir) — `emitir(params)` com counter + retry store
- [Substituir e cancelar](./substituir-cancelar) — cancelar (101101) e substituir (DPS com `<subst>`)
- [Parâmetros municipais](./parametros) — alíquotas, benefícios, convênio etc.
- [Leiautes](./layouts) — `nt004` × `nt009`, virada de 01/12/2026
- [DANFSe (PDF)](./danfse) — renderer local (NT 008/2026)
- [Testando com o fake](./testing) — `NfseClientFake`
