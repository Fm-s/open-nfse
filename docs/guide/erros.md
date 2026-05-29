# Erros tipados

Hierarquia de 3 níveis: `Error → OpenNfseError → grupo → concreto`. Toda exceção da lib herda de `OpenNfseError`, permitindo ao caller escolher a granularidade do catch.

## Hierarquia

```
Error
 └─ OpenNfseError                   (abstract base)
      ├─ HttpError                  (grupo)
      │    ├─ NetworkError
      │    ├─ TimeoutError
      │    ├─ HttpStatusError       (genérico — método getRetryAfterMs())
      │    ├─ UnauthorizedError     (HTTP 401)
      │    ├─ ForbiddenError        (HTTP 403)
      │    ├─ NotFoundError         (HTTP 404)
      │    ├─ TooManyRequestsError  (HTTP 429)
      │    └─ ServerError           (HTTP 5xx)
      ├─ CertificateError           (grupo)
      │    ├─ ExpiredCertificateError
      │    ├─ InvalidCertificateError
      │    └─ InvalidCertificatePasswordError
      ├─ ValidationError            (grupo)
      │    ├─ InvalidChaveAcessoError
      │    ├─ InvalidDpsIdError
      │    ├─ InvalidXmlError
      │    ├─ XsdValidationError          (com violations[])
      │    ├─ InvalidCepError             (com reason + cep)
      │    ├─ InvalidCpfError             (com reason + cpf)
      │    ├─ InvalidCnpjError            (com reason + cnpj)
      │    ├─ InvalidDpsIdParamError
      │    ├─ InvalidEventoPedidoIdParamError
      │    ├─ DpsAlreadySignedError
      │    ├─ MissingRetryStoreError
      │    ├─ MissingDpsCounterError
      │    └─ RuleViolationError          (com rule código E...)
      ├─ ReceitaRejectionError      (concreto — com mensagens[], idDps, codigo, descricao)
      └─ ClientClosedError          (concreto — pós cliente.close())
```

## Reagindo por categoria

```typescript
try {
  await cliente.emitir(params);
} catch (err) {
  if (err instanceof ReceitaRejectionError) {
    // rejeição fiscal — dispatch por err.codigo; nDPS foi consumido
    logger.warn(`[${err.codigo}] ${err.descricao}`);
  } else if (err instanceof ServerError || err instanceof NetworkError || err instanceof TimeoutError) {
    // transiente — retry
  } else if (err instanceof ExpiredCertificateError) {
    alerts.send('Certificado A1 expirou', { expiresOn });
  } else if (err instanceof XsdValidationError) {
    logger.error('DPS malformada', { violations: err.violations });
  } else if (err instanceof OpenNfseError) {
    throw new MyAppError('Falha open-nfse', { cause: err });
  } else {
    throw err;
  }
}
```

## Classes-chave — propriedades

```typescript
class ReceitaRejectionError extends OpenNfseError {
  readonly mensagens: readonly MensagemProcessamento[];
  readonly idDps: string | undefined;
  readonly tipoAmbiente: TipoAmbiente | undefined;
  readonly versaoAplicativo: string | undefined;
  readonly dataHoraProcessamento: Date | undefined;
  // shortcuts para mensagens[0]:
  readonly codigo: string;
  readonly descricao: string;
  readonly complemento: string | undefined;
}

class XsdValidationError extends ValidationError {
  readonly violations: readonly XsdViolation[]; // { message: string; line?: number }
}

class HttpStatusError extends HttpError {
  readonly status: number;
  readonly body: string | undefined;
  readonly headers: Record<string, string>;
  /**
   * Parse RFC 7231 `Retry-After`. Retorna o delay em ms ou `undefined`
   * (header ausente/malformado/com sinal). Aceita delta-seconds (incl.
   * decimais, arredondados pra cima via `Math.ceil`) e HTTP-date.
   * Datas no passado → 0ms.
   */
  getRetryAfterMs(): number | undefined;
}

class TooManyRequestsError extends HttpStatusError {
  // status sempre 429. Classificada como transiente — emissões e eventos
  // viram `retry_pending` automaticamente, com `notBefore` calculado pela
  // `RetryPolicy` configurada (default respeita Retry-After).
}

class InvalidCepError extends ValidationError {
  readonly cep: string;
  readonly reason: 'format' | 'not_found' | 'api_unavailable';
}

// InvalidCpfError e InvalidCnpjError seguem o mesmo shape (campo + reason).
// reason em CPF/CNPJ: 'format' | 'check_digit' | 'known_invalid'.
```

## Comportamento específico

- **`fetchByNsu` nunca lança `NotFoundError`** — 404 carrega body e vira `status: 'NENHUM_DOCUMENTO_LOCALIZADO'`. Lança apenas erros de transporte/certificado.
- **`emitir(params)` não lança em transiente** — retorna `{ status: 'retry_pending', pending, error }`. Lança em permanente (rejeição) ou validação local.
- **`emitirDpsPronta(dps)` lança em tudo** — escape hatch, sem `retryStore`.
- **`substituir` só lança no step 1** — falhas pós-emit são observáveis via `result.status` (`retry_pending` / `rolled_back` / `rollback_pending` / `rollback_failed`).
- **`MissingDpsCounterError`** — `emitir(params)` sem `params.nDPS` e sem `dpsCounter` configurado.
- **`MissingRetryStoreError`** — transiente em `emitir`/`cancelar`/`substituir` sem `retryStore`.
- **`ClientClosedError`** — qualquer método após `cliente.close()`. Single-shot por design; para reconectar, instancie um novo cliente.
- **`gerarDanfse('auto')` só cai para local em `NetworkError`/`TimeoutError`/`ServerError`** — permission/404/invalid-chave propagam.

### Classificação padrão transiente vs permanente

`defaultIsTransient` (de `src/retry/transient.ts`) decide o que vai para `retry_pending` vs lançar. Resumo:

- **Sempre transiente**: `NetworkError`, `TimeoutError`, `ServerError` (5xx), `TooManyRequestsError` (429).
- **Transiente por código** (em `ReceitaRejectionError`): `E1217` (manutenção SEFIN), `E1206` (erro de acesso a LCR) — dois códigos da camada de recepção que são intermitentes.
- **Permanente**: qualquer outro `ReceitaRejectionError` (426 dos 428 códigos do Anexo I) e tudo o mais.

Sobrescreva passando `isTransient: (err) => boolean` em `CancelarParams` ou `SubstituirParams` (não disponível em `EmitirParams`).

### 429 e RetryPolicy

429 vira `retry_pending` no `RetryStore` com um `notBefore` calculado pela `RetryPolicy` configurada. A default (`createDefaultRetryPolicy()`):

- Respeita o cabeçalho `Retry-After` quando presente — delta-seconds ou HTTP-date.
- Fallback de 60s para 429/503 sem header.
- Cap de 1h para valores absurdos (servidor mandando dias/semanas).
- Decimais (`12.5`) arredondados para cima via `Math.ceil` (servidor disse "pelo menos X segundos").

Para backoff exponencial, jitter, ou política específica, implemente `RetryPolicy` e passe em `NfseClientConfig.retryPolicy`:

```typescript
import type { RetryPolicy, RetryContext } from 'open-nfse';

const exponentialPolicy: RetryPolicy = {
  computeNotBefore(err, now, ctx?: RetryContext) {
    if (!ctx) return undefined;
    const baseMs = 1_000;
    const jitter = Math.random() * 500;
    const delay = Math.min(baseMs * 2 ** (ctx.attempt - 1) + jitter, 3_600_000);
    return new Date(now.getTime() + delay);
  },
};

const cliente = new NfseClient({ /* ... */, retryPolicy: exponentialPolicy });
```

A lib embrulha a sua policy num wrapper defensivo: se `computeNotBefore` lançar, captura, loga `warn`, e cai para `notBefore: undefined` — a entrada permanece no store, elegível na próxima passada. Não confie no wrapper como rede de segurança; faça a sua policy à prova de bala.

Signatures e parâmetros exatos: veja o [API cheat sheet](../api-cheatsheet) ou [API completa (TypeDoc)](../api/).

## Relançando com contexto

```typescript
try {
  await cliente.emitir(params);
} catch (err) {
  if (err instanceof OpenNfseError) {
    throw new MyAppError(`emissão da nota ${order.id} falhou`, { cause: err });
  }
  throw err;
}
```

`err.cause` preserva a chain original — Node exibe o stack trace completo.
