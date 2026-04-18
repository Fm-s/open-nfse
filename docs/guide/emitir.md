# Emitir NFS-e

`emitir(params)` é o fluxo primário. Recebe params de alto nível (sem `nDPS`), roda as validações offline primeiro e **só então** consulta o `DpsCounter` — uma DPS quebrada nunca queima um número de série.

```
params (sem nDPS) → validar CPF/CNPJ → XSD → CEP
   ↓ só aqui, se tudo passou:
counter.next() → nDPS real → sign → POST /nfse
   ↓
{ status: 'ok', nfse }                 ← autorizada
{ status: 'retry_pending', pending }   ← falha transiente, salvo no RetryStore
throw ReceitaRejectionError            ← regra fiscal violada (nDPS consumido)
```

Garantias:
- **Counter só incrementa depois** das validações offline — DPS quebrada não queima número.
- **Falha de rede nunca duplica** — o pendente persiste com o XML assinado; `replayPendingEvents` re-POSTa e SEFIN dedupa via `infDPS.Id`.
- **Rejeição fiscal é permanente** — não entra no retry pipeline, caller loga e segue.

Pré-requisitos no client:

```ts
const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado,
  dpsCounter: pgCounter,      // obrigatório pra emitir(params)
  retryStore: pgStore,        // obrigatório se quiser retry_pending persistir
});
```

Escape hatch para casos manuais (pre-built DPS, replay custom): **`cliente.emitirDpsPronta(dps)`** bypassa counter + retry store, throwing em tudo — útil para replay determinístico, pré-assinatura externa ou testes.

## `buildDps` — constrói DPS sem boilerplate

Em vez de montar 50+ campos manualmente, passe ~10 campos semânticos:

```typescript
import {
  buildDps,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from 'open-nfse';

const dps = buildDps({
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',                    // IBGE 7 dígitos
    regime: {
      opSimpNac: OpcaoSimplesNacional.MeEpp,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    },
  },
  serie: '1',
  nDPS: '1',
  servico: {
    cTribNac: '010101',                         // ajuste ao seu serviço
    cNBS: '123456789',                          // required per XSD
    descricao: 'Consultoria em tecnologia',
  },
  valores: { vServ: 1500.00, aliqIss: 2.5 },   // aliqIss em %
});
```

Defaults aplicados:

| Campo              | Default                                  |
|--------------------|------------------------------------------|
| `versao`           | `'1.01'`                                 |
| `tpAmb`            | `'2'` (homologação)                      |
| `tpEmit`           | `'1'` (prestador)                        |
| `dhEmi`            | `new Date()`                             |
| `dCompet`          | `new Date()`                             |
| `verAplic`         | `'open-nfse/0.2'`                        |
| `Id`               | derivado via `buildDpsId`                |
| `locPrest`         | `emitente.codMunicipio`                  |
| `tribISSQN`        | `'1'` (operação tributável)              |
| `tpRetISSQN`       | `'1'` (sem retenção)                     |
| `indTotTrib`       | `'0'` (não informado)                    |

### Com tomador

```typescript
const dps = buildDps({
  emitente: {...},
  serie: '1',
  nDPS: '1',
  servico: {...},
  valores: {...},
  tomador: {
    documento: { CNPJ: '11222333000181' },    // ou { CPF: '01075595363' }
    nome: 'Acme Ltda',
    email: 'financeiro@acme.test',
    endereco: {
      codMunicipio: '3550308',
      cep: '01310100',
      logradouro: 'Avenida Paulista',
      numero: '1578',
      bairro: 'Bela Vista',
      complemento: 'conj 12',                  // opcional
    },
  },
});
```

### Cenários avançados

`buildDps` cobre ~85% dos casos. Para **tomador exterior, obra, atividade-evento, dedução/redução, IBS/CBS**, construa `InfDPS` manualmente — todos os tipos RTC estão exportados:

```typescript
import type { InfDPS, DPS } from 'open-nfse';

const infDPS: InfDPS = {
  Id: buildDpsId({...}),
  // ... todos os campos explicitamente
  serv: {
    locPrest: { cLocPrestacao: '2111300' },
    cServ: {...},
    obra: {                                     // atividade em obra
      identificacao: { cObra: '...' },
      inscImobFisc: '...',
    },
  },
  // ...
};
const dps: DPS = { versao: '1.01', infDPS };
```

## `cliente.emitir(params)` — envio seguro

Passe params de alto nível (sem `nDPS` — o counter resolve):

```typescript
const r = await cliente.emitir({
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    regime: { opSimpNac: OpcaoSimplesNacional.MeEpp, regEspTrib: RegimeEspecialTributacao.Nenhum },
  },
  serie: '1',
  servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Consultoria' },
  valores: { vServ: 1500.0, aliqIss: 2.5 },
  tomador: { documento: { CNPJ: '11222333000181' }, nome: 'Acme Ltda' },
});

// r é discriminated — narrow por status:
if (r.status === 'ok') {
  console.log(r.nfse.chaveAcesso);
  console.log(r.nfse.xmlNfse);
}
if (r.status === 'retry_pending') {
  // falha de rede — já salvo no retryStore
  console.warn('Transient, pendente:', r.pending.id);
}
// Rejeições permanentes lançam — capture separado:
try { await cliente.emitir(params); }
catch (err) {
  if (err instanceof ReceitaRejectionError) {
    console.error(`[${err.codigo}] ${err.descricao}`);
  }
}
```

### Override manual de `nDPS`

Útil em testes determinísticos ou replay externo:

```ts
await cliente.emitir({ ...params, nDPS: '999' });  // counter não é chamado
```

### Erros de validação local

Com defaults (validações ligadas), essas falhas **não saem do seu processo** — a lib te avisa antes do round-trip:

- `InvalidCnpjError` / `InvalidCpfError` — DV incorreto
- `InvalidCepError` — formato ou CEP inexistente
- `XsdValidationError` — estrutura não bate com o schema RTC v1.01
- `InvalidDpsIdParamError` — cMun/CNPJ/série/nDPS fora do formato

### Opções

`EmitirParams` estende `EmitOptions` — options viajam junto com os params:

```typescript
await cliente.emitir({
  ...params,
  dryRun: false,                  // default false — se true, só monta+assina sem enviar
  skipValidation: false,          // pula XSD
  skipCepValidation: false,       // pula ViaCEP
  skipCpfCnpjValidation: false,   // pula DV
  cepValidator: myCustomCep,      // override (BrasilAPI, banco local, mock)
});
```

## Dry-run — preview sem enviar

```typescript
const dry = await cliente.emitir({ ...params, dryRun: true });

dry.dryRun;             // true — discriminated union
dry.xmlDpsAssinado;     // XML assinado, inspecionável
dry.xmlDpsGZipB64;      // payload gzip+base64, pronto para POST manual
```

::: tip Dry-run não consome counter
Em `dryRun: true`, o `DpsCounter` **não é chamado**. O `nDPS` vai como placeholder `'1'` (ou o valor que você passar em `params.nDPS`). Preview seguro, sem queimar número da série.
:::

Útil para:
- Gerar XML em pipelines CI sem consumir quota da Receita
- Inspecionar/logar o payload antes do primeiro envio real
- Testes de integração offline

## Emissão em lote — `emitirEmLote`

SEFIN não tem endpoint batch. `emitirEmLote` paraleliza no cliente:

```typescript
const r = await cliente.emitirEmLote(dpsList, {
  concurrency: 4,            // default 4
  stopOnError: false,        // default false — coleta tudo
});

console.log(`${r.successCount} ok / ${r.failureCount} falhas / ${r.skippedCount} skips`);

for (const item of r.items) {
  if (item.status === 'success') console.log('✓', item.result.chaveAcesso);
  if (item.status === 'failure') console.log('✗', item.error.message);
  if (item.status === 'skipped') console.log('·', 'stopOnError ativo');
}
```

Uma falha em um item **não derruba** o lote (a menos que `stopOnError: true`). O worker pool respeita o `concurrency` para não estourar rate-limit da Receita.

::: tip Cache de CEP em lote
Quando emitir em lote com CEPs repetidos, passe um `cepValidator` com cache compartilhado para deduplicar lookups:

```typescript
const cepValidator = createViaCepValidator();   // cache interno compartilhado
await cliente.emitirEmLote(dpsList, { cepValidator });
```
:::

## Exemplo runnable

[`examples/emit-nfse/`](https://github.com/fm-s/open-nfse/tree/main/examples/emit-nfse) — scripts `npm start` (emissão única) e `npm run bulk` (lote), ambos com dry-run por default.
