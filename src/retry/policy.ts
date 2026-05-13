import { HttpStatusError, ServerError, TooManyRequestsError } from '../errors/http.js';
import type { Logger } from '../logging.js';

/**
 * Contexto opcional sobre a entrada que está sendo retentada. Permite
 * policies que precisam de informação histórica — exponential backoff
 * baseado em número de tentativas, deadline absoluto a partir da
 * primeira falha, jitter dependente do tempo decorrido, etc.
 *
 * Sempre presente quando a lib chama `computeNotBefore` internamente.
 * Pode ser omitido se o consumidor chamar a policy diretamente.
 */
export interface RetryContext {
  /**
   * Tentativas realizadas até agora, incluindo a que acabou de falhar.
   * `1` após a primeira persistência, `2` após o primeiro replay, etc.
   */
  readonly attempt: number;
  /** Quando o item entrou no `RetryStore` pela primeira vez. */
  readonly firstAttemptAt: Date;
}

/**
 * Decide *when* a transient error becomes eligible for replay. Transience
 * itself is decided by `defaultIsTransient` (or a custom override) —
 * `RetryPolicy` owns timing only. A policy is never consulted for
 * permanent errors.
 *
 * The default implementation reads `Retry-After` per RFC 7231 and falls
 * back to a constant for 429 / 503 (which semantically mean "back off").
 * Consumers can implement their own to add jitter, exponential backoff,
 * or environment-specific defaults — see `RetryContext` for the data
 * available on each call.
 *
 * **Contract:** `computeNotBefore` MUST NOT throw. The lib wraps every
 * configured policy defensively (logging a warning and falling back to
 * `undefined`) so that a broken custom policy can't mask the original
 * fiscal error, but the wrapper should not be relied upon — assume it
 * isn't there and make the policy itself bulletproof.
 */
export interface RetryPolicy {
  /**
   * Returns the earliest moment the entry should be replayed.
   * `undefined` means "eligible on the next replay tick" — no specific
   * wait beyond whatever cadence the caller already drives.
   */
  computeNotBefore(err: Error, now: Date, context?: RetryContext): Date | undefined;
}

export interface DefaultRetryPolicyOptions {
  /**
   * Fallback when a 429 / 503 response has no parseable `Retry-After`
   * header. Default: 60_000 ms.
   */
  readonly defaultRetryAfterMs?: number;
  /**
   * Hard cap on the honored delay. Misconfigured servers occasionally
   * return absurd `Retry-After` values (days, weeks) — capping prevents
   * a stuck entry from blocking the replay forever. Default: 3_600_000 ms (1h).
   */
  readonly maxRetryAfterMs?: number;
}

const DEFAULT_RETRY_AFTER_MS = 60_000;
const DEFAULT_MAX_RETRY_AFTER_MS = 3_600_000;

export function createDefaultRetryPolicy(options?: DefaultRetryPolicyOptions): RetryPolicy {
  const defaultMs = options?.defaultRetryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  const maxMs = options?.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;

  return {
    computeNotBefore(err: Error, now: Date, _context?: RetryContext): Date | undefined {
      // _context é ignorado pela default — a default não faz backoff baseado
      // em tentativas, só respeita Retry-After. Policies customizadas usam.
      if (err instanceof HttpStatusError) {
        const headerMs = err.getRetryAfterMs();
        if (headerMs !== undefined) {
          const clamped = Math.min(Math.max(0, headerMs), maxMs);
          return new Date(now.getTime() + clamped);
        }
        if (isBackoffStatus(err)) {
          return new Date(now.getTime() + Math.min(defaultMs, maxMs));
        }
      }
      return undefined;
    },
  };
}

function isBackoffStatus(err: HttpStatusError): boolean {
  return err instanceof TooManyRequestsError || (err instanceof ServerError && err.status === 503);
}

/**
 * Wraps a `RetryPolicy` so that exceptions thrown by `computeNotBefore`
 * are caught, logged, and converted to a `undefined` notBefore. Internal
 * to the lib — every `NfseClient` wraps the configured (or default)
 * policy with this in its constructor, so a buggy custom policy can't
 * mask the original fiscal error.
 *
 * @internal
 */
export function makeSafePolicy(inner: RetryPolicy, logger: Logger): RetryPolicy {
  return {
    computeNotBefore(err, now, context) {
      try {
        return inner.computeNotBefore(err, now, context);
      } catch (policyErr) {
        // Defesa também contra logger que joga (logger é injetado pelo
        // consumidor — se for buggy, NÃO queremos que o throw escape
        // daqui e mascare o erro original. O ponto de makeSafePolicy é
        // ser à prova de bala.).
        try {
          logger.warn('retryPolicy.computeNotBefore threw — caindo para notBefore=undefined', {
            policyError: policyErr instanceof Error ? policyErr.message : String(policyErr),
            policyErrorName: policyErr instanceof Error ? policyErr.name : 'unknown',
            originalError: err.message,
            originalErrorName: err.name,
          });
        } catch {
          /* logger threw — silently swallow; not much else we can do */
        }
        return undefined;
      }
    },
  };
}
