# Emitir NFS-e

Pipeline `emitir()`: **`buildDps` → validar CPF/CNPJ → XSD → CEP → assinar (XMLDSig) → gzip+base64 → `POST /nfse`**. Retorna `NfseEmitResult` com a chave de acesso, XML autorizado e objeto `NFSe` parseado.

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

## `cliente.emitir(dps)` — envio síncrono

```typescript
try {
  const r = await cliente.emitir(dps);

  r.chaveAcesso;              // 50 dígitos
  r.idDps;                    // 45 chars, "DPS..."
  r.xmlNfse;                  // XML oficial assinado pela Sefin
  r.nfse;                     // NFSe completa, tipada
  r.alertas;                  // readonly MensagemProcessamento[]
  r.tipoAmbiente;
  r.versaoAplicativo;
  r.dataHoraProcessamento;    // Date
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    console.error(`[${err.codigo}] ${err.descricao}`);
    for (const m of err.mensagens.slice(1)) {
      console.error(`  + [${m.codigo}] ${m.descricao}`);
    }
  }
}
```

### Erros de validação local

Com defaults (validações ligadas), essas falhas **não saem do seu processo** — a lib te avisa antes do round-trip:

- `InvalidCnpjError` / `InvalidCpfError` — DV incorreto
- `InvalidCepError` — formato ou CEP inexistente
- `XsdValidationError` — estrutura não bate com o schema RTC v1.01
- `InvalidDpsIdParamError` — cMun/CNPJ/série/nDPS fora do formato

### Opções

```typescript
await cliente.emitir(dps, {
  dryRun: false,                  // default false — se true, só monta+assina sem enviar
  skipValidation: false,          // pula XSD
  skipCepValidation: false,       // pula ViaCEP
  skipCpfCnpjValidation: false,   // pula DV
  cepValidator: myCustomCep,      // override (BrasilAPI, banco local, mock)
});
```

## Dry-run — preview sem enviar

```typescript
const dry = await cliente.emitir(dps, { dryRun: true });

dry.dryRun;             // true — discriminated union
dry.xmlDpsAssinado;     // XML assinado, inspecionável
dry.xmlDpsGZipB64;      // payload gzip+base64, pronto para POST manual
```

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
