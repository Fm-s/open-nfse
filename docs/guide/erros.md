# Erros tipados

Toda exceção da lib herda de `OpenNfseError`, permitindo ao caller escolher a granularidade do catch. Abaixo dela há três grupos (`HttpError`, `CertificateError`, `ValidationError`, todos abstratos) e, no ramo HTTP, um quarto nível: `HttpStatusError` é a base das respostas com status de erro (`NotFoundError`, `TooManyRequestsError`…). `instanceof HttpStatusError` pega qualquer resposta com status de erro e dá acesso a `status`, `body`, `headers` e `getRetryAfterMs()`.

## Hierarquia

```
Error
 └─ OpenNfseError                        (abstract base)
      ├─ HttpError                       (grupo, abstract)
      │    ├─ NetworkError
      │    ├─ TimeoutError               (com timeoutMs)
      │    └─ HttpStatusError            (status, body, headers — getRetryAfterMs())
      │         ├─ UnauthorizedError     (HTTP 401)
      │         ├─ ForbiddenError        (HTTP 403)
      │         ├─ NotFoundError         (HTTP 404)
      │         ├─ TooManyRequestsError  (HTTP 429)
      │         └─ ServerError           (HTTP 5xx)
      ├─ CertificateError                (grupo, abstract)
      │    ├─ ExpiredCertificateError    (com expiredOn)
      │    ├─ InvalidCertificateError
      │    └─ InvalidCertificatePasswordError
      ├─ ValidationError                 (grupo, abstract)
      │    ├─ InvalidLayoutError         (layout fora de 'nt004' | 'nt009'; com received)
      │    ├─ LayoutMismatchError        (DPS de outro layout; com expected, received, field?)
      │    ├─ InvalidChaveAcessoError
      │    ├─ InvalidDpsIdError
      │    ├─ InvalidXmlError
      │    ├─ XsdValidationError         (com violations[])
      │    ├─ InvalidCepError            (com reason + cep)
      │    ├─ InvalidCpfError            (com reason + cpf)
      │    ├─ InvalidCnpjError           (com reason + cnpj)
      │    ├─ InvalidDpsIdParamError
      │    ├─ InvalidEventoPedidoIdParamError
      │    ├─ DpsAlreadySignedError
      │    ├─ MissingRetryStoreError
      │    ├─ MissingDpsCounterError
      │    └─ RuleViolationError         (com rule: código do Anexo I ou tipo do XSD)
      ├─ ReceitaRejectionError           (concreto — com mensagens[], idDps, codigo, descricao)
      ├─ UnreadableAuthorizedNfseError   (concreto — NFS-e AUTORIZADA, resposta ilegível; chaveAcesso, idDps, xmlNfse)
      └─ ClientClosedError               (concreto — pós cliente.close())
```

Todas são exportadas de `'open-nfse'`. `HttpStatusError` também é lançada direto, para status sem subclasse própria.

## Reagindo por categoria

```typescript
try {
  const r = await cliente.emitir(params);
  // Transiente (rede, timeout, 5xx, 429) NÃO lança: volta { status: 'retry_pending' }.
} catch (err) {
  if (err instanceof UnreadableAuthorizedNfseError) {
    // NÃO é falha: a nota foi autorizada. Persista a chave e o XML; não reemita.
    await db.insert('nfse_autorizadas', { chave_acesso: err.chaveAcesso, xml_nfse: err.xmlNfse });
    alerts.send('NFS-e autorizada sem DTO', { chave: err.chaveAcesso, causa: err.cause });
  } else if (err instanceof ReceitaRejectionError) {
    // rejeição fiscal — dispatch por err.codigo; nDPS foi consumido
    logger.warn(`[${err.codigo}] ${err.descricao}`);
  } else if (err instanceof RuleViolationError) {
    // pré-check local (ex.: E0595; no nt009, regras de ajusteBC/ibsCbs) — nada enviado, nDPS NÃO consumido
    logger.error('regra violada', { rule: err.rule, msg: err.message });
  } else if (err instanceof XsdValidationError) {
    logger.error('DPS malformada', { violations: err.violations });
  } else if (err instanceof LayoutMismatchError || err instanceof InvalidLayoutError) {
    // bug de integração: DPS/params de outro layout que o do cliente
    throw err;
  } else if (err instanceof ExpiredCertificateError) {
    alerts.send('Certificado A1 expirou', { expiredOn: err.expiredOn });
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

class UnreadableAuthorizedNfseError extends OpenNfseError {
  readonly chaveAcesso: string;            // a NFS-e existe
  readonly idDps: string;
  readonly xmlNfse: string | undefined;    // ausente só se nem o XML pôde ser baixado (reconciliação do replay)
  readonly alertas: readonly MensagemProcessamento[];
  readonly tipoAmbiente: TipoAmbiente | undefined;
  readonly versaoAplicativo: string | undefined;
  readonly dataHoraProcessamento: Date | undefined;
  // cause: o erro do parser (InvalidXmlError…), LayoutMismatchError (NFS-e de
  // outro layout que a DPS enviada) ou a falha do GET na reconciliação.
}

class XsdValidationError extends ValidationError {
  readonly violations: readonly XsdViolation[]; // { message: string; line?: number }
}

class RuleViolationError extends ValidationError {
  // Código da regra: do Anexo I ('E0042', 'E0078', 'E0595'…) quando a regra é
  // de lá, senão o tipo/campo do XSD ('TSMotivo', 'TSChaveNFSe', 'TSVerAplic',
  // 'infDPS/subst'…).
  readonly rule: string | undefined;
}

class InvalidLayoutError extends ValidationError {
  readonly received: unknown;              // o valor recebido no lugar de 'nt004' | 'nt009'
}

class LayoutMismatchError extends ValidationError {
  readonly expected: Layout;
  readonly received: Layout;
  // Preenchido quando a DPS carrega um campo exclusivo do outro layout
  // (ex.: 'infDPS.valores.vDedRed') ou buildDps({ layout: 'nt004' }) recebe
  // um input do nt009 ('ajusteBC', 'ibsCbs'); nesse caso expected === received.
  readonly field?: string;
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
- **`UnreadableAuthorizedNfseError` — a nota existe.** O SEFIN respondeu 201 (NFS-e autorizada, `nDPS` consumido), mas a lib não conseguiu montar o DTO: XML que o parser rejeita ou NFS-e de layout diferente do da DPS enviada. Lançado por `emitir`, `emitirDpsPronta` e `substituir`; em `emitirEmLote` vira o item `success_unreadable` (conta em `successCount`, não aborta o lote); no replay vira `success_emission_unreadable`. Nunca é transiente e nunca vai para o `RetryStore` (o parsing roda fora do caminho de retry — nem um `isTransient` custom o captura). Persista `chaveAcesso`/`xmlNfse` e **não reemita**: uma nova emissão com outro `nDPS` gera uma segunda NFS-e para o mesmo serviço.
- **`substituir`** — um único write (a DPS com `<subst>`); retorna `{ status: 'ok' | 'retry_pending' }` (transiente persistido) ou lança em rejeição permanente. Sem rollback. Os pré-checks locais (`infDPS/subst`, `E0078`, `TSMotivo`, `TSChaveNFSe`, `E0042` → `RuleViolationError`; `infDPS.Id` inválido → `InvalidDpsIdError`) estão em [Substituir e cancelar](./substituir-cancelar#pre-checks-locais).
- **`InvalidLayoutError`** — `layout` ausente ou fora de `'nt004' | 'nt009'` em `new NfseClient`, `new NfseClientFake`, `buildDps` ou `validate*Xml(xml, { layout })` (não há default), ou DPS cujo `layout` não é um desses (chamador JS, DTO persistido sem o campo).
- **`LayoutMismatchError`** — DPS (ou `params` com `layout`) de um layout entregue a um cliente de outro, em `emitir`/`emitirDpsPronta`/`emitirEmLote`/`substituir`; ou DTO que carrega um campo exclusivo do outro layout (`field` preenchido; checado também em `buildDps`/`buildDpsXml`). Lançado antes de consumir o `DpsCounter`, assinar ou fazer I/O — `emitirEmLote` checa o lote inteiro antes do primeiro item.
- **Leitura não lança por layout** — `fetchByChave`, `fetchByNsu` e `parseNfseXml` leem os dois layouts; campo inesperado para o layout detectado é ignorado com `warn` `nfse.parse.unexpected_field`.
- **`MissingDpsCounterError`** — `emitir(params)` sem `params.nDPS` e sem `dpsCounter` configurado.
- **`MissingRetryStoreError`** — transiente em `emitir`/`cancelar`/`substituir` sem `retryStore`. Na emissão o `nDPS` já foi consumido e o resultado no SEFIN é desconhecido — confira com `fetchDpsStatus` antes de reemitir.
- **`ClientClosedError`** — qualquer método após `cliente.close()`. Single-shot por design; para reconectar, instancie um novo cliente.
- **`gerarDanfse('auto')` (deprecated — NT 008) só cai para local em `NetworkError`/`TimeoutError`/`ServerError`** — permission/404/invalid-chave propagam. O default é `'local'`, que não chama o ADN.

### Classificação padrão transiente vs permanente

`defaultIsTransient` (de `src/retry/transient.ts`) decide o que vai para `retry_pending` vs lançar. Resumo:

- **Sempre transiente**: `NetworkError`, `TimeoutError`, `ServerError` (5xx), `TooManyRequestsError` (429).
- **Transiente por código** (em `ReceitaRejectionError`): `E1217` ("Serviço paralisado para manutenção", Anexo IV) e `E1206` ("Certificado de Transmissão — Erro de acesso a LCR", Anexo I) — dois códigos da camada de recepção que são intermitentes.
- **Permanente**: qualquer outro `ReceitaRejectionError` e tudo o mais — inclusive todo `ValidationError` (pré-checks locais, layout) e `CertificateError`.
- **Nunca transiente, nem com classificador custom**: `UnreadableAuthorizedNfseError` — o parsing da NFS-e roda fora do caminho de retry, então ela nunca vira `retry_pending` nem vai para o `RetryStore`.

Sobrescreva passando `isTransient: (err) => boolean` em `CancelarParams` ou `SubstituirParams` (não disponível em `EmitirParams`). O classificador custom vale só para a primeira tentativa: no `replayPendingEvents` a lib usa sempre o `defaultIsTransient`.

### 429 e RetryPolicy {#429-e-retrypolicy}

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

const cliente = new NfseClient({ layout: 'nt004', /* ... */, retryPolicy: exponentialPolicy });
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
