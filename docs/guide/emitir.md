# Emitir NFS-e

`emitir(params)` é o fluxo primário. Recebe params de alto nível (sem `nDPS`), roda as validações offline primeiro e **só então** consulta o `DpsCounter` — DPS quebrada nunca queima número de série.

```
params → valida CPF/CNPJ → XSD → CEP
   ↓ (se tudo passou)
counter.next() → nDPS real → sign → POST /nfse
   ↓
{ status: 'ok', nfse }                 ← autorizada
{ status: 'retry_pending', pending }   ← transiente, salvo no RetryStore
throw ReceitaRejectionError            ← regra fiscal violada (nDPS consumido)
```

Garantias:
- **Counter só incrementa depois** das validações offline.
- **Falha de rede nunca duplica** — pendente persiste com XML assinado; `replayPendingEvents` re-POSTa e SEFIN dedupa via `infDPS.Id`.
- **Rejeição fiscal é permanente** — não entra no retry pipeline.

## Pré-requisitos no client

```ts
const cliente = new NfseClient({
  ambiente: Ambiente.ProducaoRestrita,
  certificado,
  dpsCounter: pgCounter,      // obrigatório (ou passe nDPS explícito em params)
  retryStore: pgStore,        // obrigatório se quiser persistir retry_pending
});
```

Escape hatch: `cliente.emitirDpsPronta(dps)` bypassa counter + retry store, throwing em tudo — para pre-built DPS, replay determinístico ou pré-assinatura externa.

## `cliente.emitir(params)` — envio seguro

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

if (r.status === 'ok') {
  console.log(r.nfse.chaveAcesso, r.nfse.xmlNfse);
} else if (r.status === 'retry_pending') {
  console.warn('Transient, pendente:', r.pending.id);
}
// Rejeições permanentes lançam — capture `ReceitaRejectionError` separado.
```

### Options (spread em `params`)

`EmitirParams extends EmitOptions` — as flags viajam junto:

```typescript
await cliente.emitir({
  ...params,
  dryRun: false,                  // preview sem enviar (counter não é consumido)
  skipValidation: false,          // pula XSD
  skipCepValidation: false,       // pula ViaCEP
  skipCpfCnpjValidation: false,   // pula DV CPF/CNPJ
  cepValidator: myCustomCep,      // override (BrasilAPI, mock)
  nDPS: '999',                    // override — counter não é chamado
});
```

### Validação local

Com defaults (validações ligadas), falhas aparecem **antes** do round-trip:

- `InvalidCnpjError` / `InvalidCpfError` — DV incorreto
- `InvalidCepError` — formato ou CEP inexistente (ViaCEP)
- `XsdValidationError` — estrutura não bate com RTC v1.01
- `InvalidDpsIdParamError` — cMun/CNPJ/série/nDPS fora do formato

Ordem de execução: CPF/CNPJ (sync) → XSD (WASM) → CEP (HTTP). Detalhes em [Validações](./validacoes).

## Dry-run — preview sem enviar

```typescript
const dry = await cliente.emitir({ ...params, dryRun: true });
dry.xmlDpsAssinado;   // XML assinado, inspecionável
dry.xmlDpsGZipB64;    // payload gzip+base64 pronto para POST manual
```

Counter **não é consumido** — usa placeholder `'1'` ou `params.nDPS` se explícito.

## `buildDps` — constrói DPS sem boilerplate

Quando usar `emitirDpsPronta` ou `emitirEmLote`, monte a DPS com ~10 campos semânticos em vez dos 50+ manuais:

```typescript
import { buildDps, OpcaoSimplesNacional, RegimeEspecialTributacao } from 'open-nfse';

const dps = buildDps({
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    regime: { opSimpNac: OpcaoSimplesNacional.MeEpp, regEspTrib: RegimeEspecialTributacao.Nenhum },
  },
  serie: '1', nDPS: '1',
  servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Consultoria' },
  valores: { vServ: 1500.00, aliqIss: 2.5 },
  tomador: {                                       // opcional
    documento: { CNPJ: '11222333000181' },
    nome: 'Acme Ltda',
    email: 'financeiro@acme.test',
    endereco: { codMunicipio: '3550308', cep: '01310100', logradouro: 'Avenida Paulista',
                numero: '1578', bairro: 'Bela Vista' },
  },
});
```

Defaults: `versao='1.01'`, `tpAmb='2'`, `tpEmit='1'`, `dhEmi=now`, `dCompet=now`, `tribISSQN='1'`, `tpRetISSQN='1'`, `indTotTrib='0'`, `locPrest=emitente.codMunicipio`, `Id` derivado via `buildDpsId`.

Cobre ~85% dos casos. Para **tomador exterior, obra, atividade-evento, dedução/redução, IBS/CBS**, construa `InfDPS` manualmente — todos os tipos RTC estão exportados.

## Emissão em lote — `emitirEmLote`

SEFIN não tem endpoint batch; paraleliza no cliente. Recebe `DPS[]` pré-montado (cada um com seu `nDPS`):

```typescript
const r = await cliente.emitirEmLote(dpsList, { concurrency: 4, stopOnError: false });

for (const item of r.items) {
  if (item.status === 'success') console.log('✓', item.result.chaveAcesso);
  if (item.status === 'failure') console.log('✗', item.error.message);
  if (item.status === 'skipped') console.log('·', 'stopOnError ativo');
}
```

Falha em um item **não derruba** o lote (exceto `stopOnError: true`). Para CEPs repetidos em lote, passe um `cepValidator` com cache compartilhado: `createViaCepValidator()` já dedupa lookups internamente.

## Exemplo runnable

[`examples/emit-nfse/`](https://github.com/fm-s/open-nfse/tree/main/examples/emit-nfse) — `npm start` (emissão única) e `npm run bulk` (lote), ambos com dry-run por default.
