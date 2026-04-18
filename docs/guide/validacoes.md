# Validações pré-envio

A lib valida a DPS **localmente** antes de mandar pro SEFIN. Três validações independentes, todas ligadas por default, cada uma com opt-out:

| Validação   | Custo   | Tipo            | Flag para desligar          |
|-------------|---------|-----------------|-----------------------------|
| CPF/CNPJ DV | ~1µs    | Sync            | `skipCpfCnpjValidation`     |
| XSD RTC     | 50-200ms* | Async (WASM)  | `skipValidation`            |
| CEP (ViaCEP) | 50-500ms/lookup | Async (HTTP) | `skipCepValidation`    |

\* A primeira chamada carrega o runtime WASM (~1MB); subsequentes são ~5-20ms.

## Ordem de execução em `emitir()`

```
CPF/CNPJ (cheapest) → XSD (local) → CEP (external) → sign → POST
```

Mais barata primeiro para falhar rápido antes de gastar tempo.

## CPF/CNPJ check-digit

Verifica formato (11/14 dígitos sem máscara) + dígitos verificadores (algoritmo modulo-11 oficial da Receita).

### Expostos para uso standalone

```typescript
import { validateCpf, validateCnpj, InvalidCpfError, InvalidCnpjError } from 'open-nfse';

try {
  validateCnpj('00574753000100');     // OK
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

`collectIdentifiersFromDps` extrai todos os identificadores CNPJ/CPF da DPS (prest, toma, interm, fornec em dedRed, IBSCBS.dest, etc.) e valida cada um. NIF e cNaoNIF são ignorados — não têm DV brasileiro.

## XSD RTC v1.01

`validateDpsXml()` roda o XML assinado contra o schema RTC v1.01 bundled usando libxml2 (via WASM). Pega erros estruturais que o SEFIN rejeitaria com round-trip:

- Elemento obrigatório ausente (ex: `cNBS`)
- Pattern inválido (ex: `nDPS` começando com 0, `dhEmi` com milissegundos)
- Valor fora do enum (ex: `tribISSQN` não definido)
- Ordem de elementos errada

### Uso standalone

```typescript
import { validateDpsXml, XsdValidationError } from 'open-nfse';

try {
  await validateDpsXml(xml);
} catch (err) {
  if (err instanceof XsdValidationError) {
    for (const v of err.violations) {
      console.error(`linha ${v.line}: ${v.message}`);
    }
  }
}

// ou sem throw — coletar violações:
const r = await validateDpsXml(xml, { throwOnInvalid: false });
if (!r.valid) {
  for (const v of r.violations) console.log(v.message, v.line);
}
```

### WASM lazy-load

A primeira chamada ao validador carrega o runtime libxml2 (~1MB). Chamadas subsequentes reusam. Em emissão em lote, o custo é amortizado instantaneamente.

::: tip Bundle dos XSDs
Os 10 XSDs da RTC v1.01 estão inlineados em `src/nfse/_rtc-schemas.generated.ts` (5800 linhas, regenerado via `scripts/generate-schemas.mjs`). Quando uma nova NT landar, rode o script e commit — sem runtime file I/O.
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
import type { CepValidator } from 'open-nfse';

const brasilApi: CepValidator = {
  async validate(cep) {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
    if (r.status === 404) throw new InvalidCepError(cep, 'not_found');
    if (!r.ok) throw new InvalidCepError(cep, 'api_unavailable');
    const data = await r.json();
    return { cep, logradouro: data.street, uf: data.state, /* ... */ };
  },
};

const cliente = new NfseClient({..., cepValidator: brasilApi});
```

### CEPs coletados da DPS

`collectCepsFromDps` extrai CEPs de:

- `prest.end` (prestador)
- `toma.end`, `interm.end`
- `serv.obra.end`, `serv.atvEvento.end`
- `IBSCBS.dest.end`, `IBSCBS.imovel.end`
- `valores.vDedRed.documentos.docDedRed[].fornec.end`

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
