# Validações pré-envio

A lib valida a DPS **localmente** antes de mandar pro SEFIN. Três validações independentes, todas ligadas por default, cada uma com opt-out:

| Validação   | Custo   | Tipo            | Flag para desligar          |
|-------------|---------|-----------------|-----------------------------|
| CPF/CNPJ DV | ~1µs    | Sync            | `skipCpfCnpjValidation`     |
| XSD do layout | 50-200ms* | Async (WASM)  | `skipValidation`            |
| CEP (ViaCEP) | 50-500ms/lookup | Async (HTTP) | `skipCepValidation`    |

\* A primeira chamada carrega o runtime WASM (~1MB); subsequentes são ~5-20ms.

Além delas, dois guards rodam **sempre**, sem opt-out: o de **layout** (`InvalidLayoutError` / `LayoutMismatchError`) e as **regras de rejeição fechadas do Anexo I** checadas no `buildDps` (`RuleViolationError`) — ver [Regras do Anexo I](#regras-do-anexo-i).

## Ordem de execução em `emitir()`

```
layout + buildDps (regras do Anexo I, DV dos inputs) → CPF/CNPJ (DPS inteira)
  → XSD do layout → CEP → [dryRun: assina com o nDPS placeholder e para aqui] → nDPS (DpsCounter) → sign → POST
```

Mais barata primeiro para falhar rápido antes de gastar tempo. Tudo que falha antes do `DpsCounter` **não consome `nDPS`**.

Em `emitirDpsPronta` / `emitirEmLote` / `substituir` a DPS já vem pronta: layout da DPS × layout do cliente (`emitirEmLote` checa o lote inteiro antes do primeiro envio; `substituir` roda antes os pré-checks da substituição — ver [Substituir e cancelar](./substituir-cancelar)) → CPF/CNPJ → serialização (campo do outro layout → `LayoutMismatchError`) → XSD → CEP → sign → POST.

## Regras do Anexo I

O `buildDps` (e, portanto, `emitir`) checa as regras de rejeição **fechadas** do Anexo I do layout — as que dependem só dos inputs — e lança `RuleViolationError` com o código em `err.rule`. As que dependem de cadastro, parametrização municipal ou da calculadora do IBS/CBS ficam com a SEFIN.

```typescript
import { RuleViolationError } from 'open-nfse';

try {
  await cliente.emitir(params);
} catch (err) {
  if (err instanceof RuleViolationError) {
    console.error(err.rule, err.message); // ex.: 'E0595', 'aliqIss=7% excede o teto de 5% do ISSQN — per E0595'
  }
}
```

O conjunto de regras depende do layout (Anexo I `20260209` no `nt004`, `20261020` no `nt009`):

- **Nos dois layouts:** regime do Simples (E0162, E0166), `aliqIss` acima de 5% (E0595), `aliqIss` com MEI ou com `tribISSQN` 2/3/4 (E0600, E0602), retenção com `tribISSQN` 2/3/4 (E0580), `vReceb` (E0424), total de tributos por regime (E0710, E0712, E0713), `cTribMun` `'000'` (E0315) e 20.01.01 em águas marítimas (E1402).
- **Muda por layout:** E0532 (`tribISSQN: '4'` obrigatório) vale só para o 99.01.01 no `nt004` e para todo 99.XX.XX no `nt009`.
- **Só no `nt009`:** E0313 (MEI sem `cTribMun`), as regras do `ajusteBC` e do `ibsCbs` e, numa DPS montada à mão, E0031/E0034 (`cMotivoEmisTI`, `chNFSeRej`). Lista completa em [Leiautes](./layouts#inputs-de-alto-nivel-do-nt009).

Nem todo `err.rule` é um código E: os guards de formato usam o nome do tipo do XSD ou do campo — `'aliqIss'` (valor que parece fração, ex. `0.025` em vez de `2.5`), `'TSVerAplic'`, `'TSDec'` (decimal negativo/não finito), e nos eventos `'TSMotivo'`, `'e101101/xMotivo'`, `'TSChaveNFSe'`, `'infDPS/subst'` (além de E0078 e E0042 em `substituir` — ver [Substituir e cancelar](./substituir-cancelar)).

## CPF/CNPJ check-digit

Verifica formato + dígitos verificadores (algoritmo modulo-11 oficial da Receita). CPF: 11 dígitos sem máscara. CNPJ: **alfanumérico** (IN RFB nº 2.229/2024, em produção na NFS-e desde 10/08/2026) — 12 posições `[A-Z0-9]` + 2 DV sempre numéricos, DV calculado sobre o valor ASCII − 48 de cada caractere; CNPJs 100% numéricos seguem válidos.

### Expostos para uso standalone

```typescript
import { validateCpf, validateCnpj, InvalidCpfError, InvalidCnpjError } from 'open-nfse';

try {
  validateCnpj('00574753000100');     // OK
  validateCnpj('12ABC345DE0108');     // OK — alfanumérico (IN RFB nº 2.229/2024)
  validateCnpj('00000000000001');     // throws InvalidCnpjError(reason: 'check_digit')
  validateCnpj('11111111111111');     // throws InvalidCnpjError(reason: 'known_invalid')
  validateCnpj('abc');                 // throws InvalidCnpjError(reason: 'format')
} catch (err) {
  if (err instanceof InvalidCnpjError) {
    console.log(err.cnpj, err.reason);
  }
}
```

### O que é validado em `emitir`

O `buildDps` já confere os documentos dos inputs (emitente, tomador e, no `nt009`, os fornecedores do `ajusteBC` e o destinatário do `ibsCbs`). Depois, `collectIdentifiersFromDps` extrai todos os identificadores CNPJ/CPF da DPS montada e valida cada um — o mesmo passo roda em `emitirDpsPronta`, `emitirEmLote` e `substituir`. Os caminhos variam por layout:

- **Nos dois:** `prest`, `toma`, `interm`, `IBSCBS.dest`.
- **`nt004`:** `fornec` dos documentos de `valores.vDedRed` e de `IBSCBS.valores.gReeRepRes`.
- **`nt009`:** `fornec` dos documentos de `valores.vAjusteBC`.

NIF e cNaoNIF são ignorados — não têm DV brasileiro. `skipCpfCnpjValidation` desliga as duas etapas.

## XSD do layout

`validateDpsXml()` valida o XML da DPS contra o bundle XSD do `layout` informado, usando libxml2 (via WASM). Os dois layouts serializam `versao="1.01"`, mas os bundles são diferentes:

| `layout` | Bundle                                   | Diretório no repo     |
|----------|------------------------------------------|-----------------------|
| `nt004`  | RTC v1.01 `20260727` (produção)           | `schemas/1.01/`       |
| `nt009`  | NT 009 release 1, `esquemas_prod_restrita_20261020` | `schemas/1.01-nt009/` |

Pega erros estruturais que o SEFIN rejeitaria com round-trip:

- Elemento obrigatório ausente (ex: `xDescServ`; no `nt009`, `infDPS/finNFSe`)
- Pattern inválido (ex: `nDPS` começando com 0, `dhEmi` com milissegundos)
- Valor fora do enum (ex: `tribISSQN` não definido)
- Ordem de elementos errada

`layout` é obrigatório — sem ele (ou com valor desconhecido) a chamada lança `InvalidLayoutError`. Valide sempre contra o layout da própria DPS: um XML `nt004` validado com `layout: 'nt009'` falha (falta `infDPS/finNFSe`, obrigatório no `nt009`). Em `emitir`, a lib usa o layout da DPS.

### Uso standalone

```typescript
import { validateDpsXml, XsdValidationError } from 'open-nfse';

try {
  await validateDpsXml(xml, { layout: 'nt004' });
} catch (err) {
  if (err instanceof XsdValidationError) {
    for (const v of err.violations) {
      console.error(`linha ${v.line}: ${v.message}`);
    }
  }
}

// ou sem throw — coletar violações:
const r = await validateDpsXml(xml, { layout: 'nt004', throwOnInvalid: false });
if (!r.valid) {
  for (const v of r.violations) console.log(v.message, v.line);
}
```

`validatePedRegEventoXml(xml, { layout })` (pedido de registro de evento — cancelamento etc.) e `validateEventoXml(xml, { layout })` (o `<evento>` devolvido pela Sefin) seguem o mesmo contrato.

### WASM lazy-load

A primeira chamada ao validador carrega o runtime libxml2 (~1MB). Chamadas subsequentes reusam. Em emissão em lote, o custo é amortizado instantaneamente.

::: tip Bundle dos XSDs
Os XSDs dos dois bundles (10 por layout) estão inlineados em `src/nfse/_rtc-schemas.generated.ts` (`RTC_SCHEMAS`, por layout), regenerado via `scripts/generate-schemas.mjs` a partir de `schemas/1.01/` e `schemas/1.01-nt009/`. Quando sai um bundle novo, rode o script e commit — sem runtime file I/O.
:::

## CEP (ViaCEP)

Valida **formato** (8 dígitos, strip de pontuação) e **existência** (consulta ViaCEP).

### Uso standalone

```typescript
import { createViaCepValidator, InvalidCepError } from 'open-nfse';

const cepValidator = createViaCepValidator();

try {
  const info = await cepValidator.validate('01310-100');
  console.log(info.cep);          // '01310100' (normalizado)
  console.log(info.logradouro);   // 'Avenida Paulista'
  console.log(info.uf);           // 'SP'
  console.log(info.localidade);   // 'São Paulo'
  console.log(info.ibge);         // '3550308'
} catch (err) {
  if (err instanceof InvalidCepError) {
    // err.reason: 'format' | 'not_found' | 'api_unavailable'
  }
}
```

### Cache

Por default cada `createViaCepValidator()` tem um Map em memória. Passe um cache externo para compartilhar entre chamadas (ex: reduzir ViaCEP hits em lote):

```typescript
const sharedCache = new Map();

const validator1 = createViaCepValidator({ cache: sharedCache });
const validator2 = createViaCepValidator({ cache: sharedCache });
// validator1.validate('01310100') → cache hit em validator2
```

### Provider customizado

A interface `CepValidator` é pluggable — troque ViaCEP por BrasilAPI, banco de endereços dos Correios, ou um mock em testes:

```typescript
import { InvalidCepError, NfseClient, type CepValidator } from 'open-nfse';

const brasilApi: CepValidator = {
  async validate(cep) {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
    if (r.status === 404) throw new InvalidCepError(cep, 'not_found');
    if (!r.ok) throw new InvalidCepError(cep, 'api_unavailable');
    const data = await r.json();
    return { cep, logradouro: data.street, uf: data.state, /* ... */ };
  },
};

const cliente = new NfseClient({ layout: 'nt004', ..., cepValidator: brasilApi});
```

### CEPs coletados da DPS

`collectCepsFromDps` extrai CEPs de:

- `prest.end` (prestador)
- `toma.end`, `interm.end`
- `serv.obra.end`, `serv.atvEvento.end`
- `IBSCBS.dest.end`
- **`nt004`:** `IBSCBS.imovel.end` e `valores.vDedRed.documentos.docDedRed[].fornec.end`
- **`nt009`:** `IBSCBS.imovel.gUnidImob[].end` e `valores.vAjusteBC.documentos.docAjusteBC[].fornec.end`

Exterior (`endExt`) é **ignorado** — não tem CEP brasileiro.

## Desligando seletivamente

```typescript
await cliente.emitir({
  ...params,
  skipValidation: true,          // sem XSD
  skipCepValidation: true,       // sem lookup externo
  skipCpfCnpjValidation: true,   // sem DV algorítmico
});
```

O guard de layout e as regras do Anexo I continuam ligados — as regras só barram o que o Anexo I sempre rejeita.

### Quando desligar?

- **Testes** onde você já sabe que o XML é válido e quer economizar tempo.
- **Debugging** quando quer ver o erro bruto do SEFIN em vez da falha local.
- **Emissão em alta frequência** onde o lookup ViaCEP vira gargalo — use cache compartilhado ou skip.

Em produção normal, deixe tudo ligado. O custo é negligível e os erros capturados localmente são muito mais fáceis de debugar do que uma rejeição E**** genérica da Receita.

## Collectors expostos

Úteis para dashboards internos ou pre-checks antes de chamar `emitir`:

```typescript
import { collectCepsFromDps, collectIdentifiersFromDps } from 'open-nfse';

const ceps = collectCepsFromDps(dps);
// [{ path: 'infDPS.prest.end.localidade.endNac.CEP', cep: '01310100' }, ...]

const ids = collectIdentifiersFromDps(dps);
// [{ path: 'infDPS.prest.CNPJ', type: 'CNPJ', value: '00574753000100' }, ...]
```

Os dois aceitam DPS de qualquer layout (`DPS`) e lançam `InvalidLayoutError` para uma DPS sem `layout` (chamador JS).
