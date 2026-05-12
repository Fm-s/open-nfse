import { HttpStatusError, ServerError, TooManyRequestsError } from '../errors/http.js';

/**
 * Decide *when* a transient error becomes eligible for replay. Transience
 * itself is decided by `defaultIsTransient` (or a custom override) —
 * `RetryPolicy` owns timing only. A policy is never consulted for
 * permanent errors.
 *
 * The default implementation reads `Retry-After` per RFC 7231 and falls
 * back to a constant for 429 / 503 (which semantically mean "back off").
 * Consumers can implement their own to add jitter, exponential backoff,
 * or environment-specific defaults.
 */
export interface RetryPolicy {
  /**
   * Returns the earliest moment the entry should be replayed.
   * `undefined` means "eligible on the next replay tick" — no specific
   * wait beyond whatever cadence the caller already drives.
   */
  computeNotBefore(err: Error, now: Date): Date | undefined;
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
    computeNotBefore(err: Error, now: Date): Date | undefined {
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
