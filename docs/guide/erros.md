# Erros tipados

A lib usa uma **hierarquia de 3 níveis** para que o caller escolha a granularidade do catch. Toda exceção lançada pela lib herda de `OpenNfseError` (exceto bugs inesperados).

## Hierarquia completa

```
Error
 └─ OpenNfseError                   (abstract base)
      ├─ HttpError                  (grupo)
      │    ├─ NetworkError
      │    ├─ TimeoutError
      │    ├─ HttpStatusError       (genérico)
      │    ├─ UnauthorizedError     (HTTP 401)
      │    ├─ ForbiddenError        (HTTP 403)
      │    ├─ NotFoundError         (HTTP 404)
      │    └─ ServerError           (HTTP 5xx)
      ├─ CertificateError           (grupo)
      │    ├─ ExpiredCertificateError
      │    ├─ InvalidCertificateError
      │    └─ InvalidCertificatePasswordError
      ├─ ValidationError            (grupo)
      │    ├─ InvalidChaveAcessoError
      │    ├─ InvalidXmlError
      │    ├─ XsdValidationError          (com violations[])
      │    ├─ InvalidCepError             (com reason + cep)
      │    ├─ InvalidCpfError             (com reason + cpf)
      │    ├─ InvalidCnpjError            (com reason + cnpj)
      │    ├─ InvalidDpsIdParamError
      │    ├─ InvalidEventoPedidoIdParamError
      │    ├─ DpsAlreadySignedError
      │    ├─ MissingRetryStoreError
      │    └─ MissingDpsCounterError
      ├─ ReceitaRejectionError      (concreto)
      │    └─ com mensagens[], idDps, codigo, descricao
      └─ ClientClosedError           (concreto)
           └─ lançado ao chamar métodos após cliente.close()
```

## Reagindo por categoria

```typescript
import {
  OpenNfseError,
  HttpError,
  CertificateError,
  ValidationError,
  ReceitaRejectionError,
  ServerError,
  NetworkError,
  TimeoutError,
  ExpiredCertificateError,
  XsdValidationError,
} from 'open-nfse';

try {
  await cliente.emitir(params);
} catch (err) {
  // 1. Rejeições fiscais — dispatch por código
  if (err instanceof ReceitaRejectionError) {
    switch (err.codigo) {
      case 'E2220': /* nenhum documento localizado */ break;
      case 'E8001': /* prazo de cancelamento expirado */ break;
      default:       logger.warn(`[${err.codigo}] ${err.descricao}`);
    }
    return;
  }

  // 2. Problemas transitórios — tentar de novo
  if (err instanceof ServerError || err instanceof NetworkError || err instanceof TimeoutError) {
    retryQueue.enqueue(dps);
    return;
  }

  // 3. Certificado — alertar ops
  if (err instanceof CertificateError) {
    if (err instanceof ExpiredCertificateError) {
      alerts.send('Certificado A1 expirou', { expiresOn: cert.expiresOn });
    }
    throw err;
  }

  // 4. Validação local — log + deixa o caller ver no debug
  if (err instanceof XsdValidationError) {
    logger.error('DPS malformada', { violations: err.violations });
    return;
  }

  // 5. Fallback — tudo que é da lib
  if (err instanceof OpenNfseError) {
    logger.error('falha open-nfse', { err });
    throw err;
  }

  // 6. Bug desconhecido — deixa propagar
  throw err;
}
```

## Propriedades das classes principais

### `ReceitaRejectionError`

```typescript
class ReceitaRejectionError extends OpenNfseError {
  readonly mensagens: readonly MensagemProcessamento[];     // lista completa
  readonly idDps: string | undefined;                        // quando SEFIN conseguiu extrair
  readonly tipoAmbiente: TipoAmbiente | undefined;
  readonly versaoAplicativo: string | undefined;
  readonly dataHoraProcessamento: Date | undefined;

  // shortcuts para mensagens[0]
  readonly codigo: string;
  readonly descricao: string;
  readonly complemento: string | undefined;
}
```

Múltiplas mensagens em `mensagens[]`; `codigo`/`descricao`/`complemento` apontam para a primeira. O campo `message` do Error resume: `Rejeição da Receita [E001]: descrição (+N erros)`.

### `XsdValidationError`

```typescript
class XsdValidationError extends ValidationError {
  readonly violations: readonly XsdViolation[];
  // XsdViolation: { message: string; line?: number }
}
```

Usada quando `validateDpsXml` falha (com throw default). `violations` tem a lista completa de erros do libxml2 — ordenada, com linha quando disponível.

### `HttpStatusError`

```typescript
class HttpStatusError extends HttpError {
  readonly status: number;
  readonly body: string | undefined;
  readonly headers: Record<string, string>;
}
```

A classe base para status genéricos. Subclasses específicas (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ServerError`) herdam todas as propriedades.

### `InvalidCepError`, `InvalidCpfError`, `InvalidCnpjError`

Cada uma expõe o valor ofensor + razão discriminada:

```typescript
class InvalidCepError extends ValidationError {
  readonly cep: string;
  readonly reason: 'format' | 'not_found' | 'api_unavailable';
}

class InvalidCpfError extends ValidationError {
  readonly cpf: string;
  readonly reason: 'format' | 'check_digit' | 'known_invalid';
}

class InvalidCnpjError extends ValidationError {
  readonly cnpj: string;
  readonly reason: 'format' | 'check_digit' | 'known_invalid';
}
```

### `ClientClosedError`

Lançado quando qualquer método é chamado em um `NfseClient` após `cliente.close()`. O cliente é single-shot por design — se precisar reconectar (rotação de certificado, por exemplo), instancie um novo `NfseClient`. Herda direto de `OpenNfseError` (sem grupo intermediário).

```typescript
import { NfseClient, ClientClosedError } from 'open-nfse';

const cliente = new NfseClient({ ... });
await cliente.close();

try {
  await cliente.fetchByChave(chave);
} catch (err) {
  if (err instanceof ClientClosedError) {
    // cliente já foi fechado — crie um novo
  }
}
```

## Erros específicos por endpoint

### `fetchByChave`

| Erro                        | Causa                                             |
|-----------------------------|---------------------------------------------------|
| `InvalidChaveAcessoError`   | Chave não tem 50 dígitos                          |
| `NotFoundError`             | HTTP 404 — chave não existe                       |
| `UnauthorizedError`         | HTTP 401 — cert inválido                          |
| `ForbiddenError`            | HTTP 403 — CNPJ não autorizado                    |

### `fetchByNsu`

**Não lança** `NotFoundError` — 404 carrega body e vira `status: 'NENHUM_DOCUMENTO_LOCALIZADO'`. Lança apenas erros de transporte / certificado.

### `emitir(params)` — fluxo seguro

- Pré-validações offline: `InvalidCnpjError` / `InvalidCpfError` / `XsdValidationError` / `InvalidCepError`
- `MissingDpsCounterError` — se `params.nDPS` ausente e o cliente não tem `dpsCounter` configurado
- `MissingRetryStoreError` — se uma falha transiente acontece mas o cliente não tem `retryStore`
- Rejeição da Receita (permanente): `ReceitaRejectionError` (HTTP 400 com body) — o `nDPS` **foi consumido**
- Transientes (rede / timeout / 5xx): **não lançam** — retornam `{ status: 'retry_pending', pending, error }`

### `emitirDpsPronta(dps)` — escape hatch

- Pré-validações: as mesmas que `emitir(params)`
- Rejeição da Receita: `ReceitaRejectionError`
- Transientes: **lançam direto** (sem retry store, sem `retry_pending`)

### `cancelar` / `substituir`

- `ReceitaRejectionError` com códigos específicos (`E8001` prazo, etc.)
- `MissingRetryStoreError` se transitar por `retry_pending`/`rollback_pending` sem RetryStore configurado
- Para `substituir`, falhas **após** o step-1 são observáveis via `result.status` (não throw)

## Relançando com contexto

Pattern comum para adicionar contexto sem perder a causa raiz:

```typescript
class MyAppError extends Error {
  constructor(message: string, public readonly original: Error) {
    super(message, { cause: original });
  }
}

try {
  await cliente.emitir(params);
} catch (err) {
  if (err instanceof OpenNfseError) {
    throw new MyAppError(`emissão da nota ${order.id} falhou`, err);
  }
  throw err;
}
```

O `cause` original fica acessível em `err.cause` — o Node exibe a chain inteira no stack trace.
