import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpStatusError,
  NetworkError,
  ServerError,
  TimeoutError,
  TooManyRequestsError,
} from '../errors/http.js';
import { type Logger, noopLogger } from '../logging.js';
import { type RetryPolicy, createDefaultRetryPolicy, makeSafePolicy } from './policy.js';

const NOW = new Date('2026-05-12T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createDefaultRetryPolicy', () => {
  it('honors Retry-After delta-seconds on TooManyRequestsError', () => {
    const policy = createDefaultRetryPolicy();
    const err = new TooManyRequestsError(undefined, { headers: { 'retry-after': '30' } });
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 30_000));
  });

  it('falls back to defaultRetryAfterMs (60s) on TooManyRequestsError without header', () => {
    const policy = createDefaultRetryPolicy();
    const err = new TooManyRequestsError(undefined);
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it('honors Retry-After on ServerError(503)', () => {
    const policy = createDefaultRetryPolicy();
    const err = new ServerError(503, undefined, { headers: { 'retry-after': '15' } });
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 15_000));
  });

  it('falls back to default on ServerError(503) without header', () => {
    const policy = createDefaultRetryPolicy();
    const err = new ServerError(503, undefined);
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it('returns undefined on ServerError(500) without header', () => {
    const policy = createDefaultRetryPolicy();
    const err = new ServerError(500, undefined);
    expect(policy.computeNotBefore(err, NOW)).toBeUndefined();
  });

  it('honors Retry-After on ServerError(500) when present', () => {
    const policy = createDefaultRetryPolicy();
    const err = new ServerError(500, undefined, { headers: { 'retry-after': '10' } });
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 10_000));
  });

  it('returns undefined for NetworkError', () => {
    const policy = createDefaultRetryPolicy();
    expect(policy.computeNotBefore(new NetworkError('socket closed'), NOW)).toBeUndefined();
  });

  it('returns undefined for TimeoutError', () => {
    const policy = createDefaultRetryPolicy();
    expect(policy.computeNotBefore(new TimeoutError(60_000), NOW)).toBeUndefined();
  });

  it('returns undefined for an arbitrary Error', () => {
    const policy = createDefaultRetryPolicy();
    expect(policy.computeNotBefore(new Error('whoops'), NOW)).toBeUndefined();
  });

  it('caps absurd Retry-After at maxRetryAfterMs (default 1h)', () => {
    const policy = createDefaultRetryPolicy();
    const err = new TooManyRequestsError(undefined, { headers: { 'retry-after': '86400' } });
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 3_600_000));
  });

  it('honors custom defaultRetryAfterMs', () => {
    const policy = createDefaultRetryPolicy({ defaultRetryAfterMs: 5_000 });
    const err = new TooManyRequestsError(undefined);
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 5_000));
  });

  it('honors custom maxRetryAfterMs', () => {
    const policy = createDefaultRetryPolicy({ maxRetryAfterMs: 10_000 });
    const err = new TooManyRequestsError(undefined, { headers: { 'retry-after': '120' } });
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 10_000));
  });

  it('returns undefined for HttpStatusError with non-429/503 status and no header', () => {
    const policy = createDefaultRetryPolicy();
    const err = new HttpStatusError(418, undefined);
    expect(policy.computeNotBefore(err, NOW)).toBeUndefined();
  });

  it('ignores RetryContext (default policy only respects Retry-After)', () => {
    const policy = createDefaultRetryPolicy();
    const err = new TooManyRequestsError(undefined, { headers: { 'retry-after': '30' } });
    // Same outcome with or without context — default doesn't backoff by attempt.
    expect(policy.computeNotBefore(err, NOW)).toEqual(new Date(NOW.getTime() + 30_000));
    expect(policy.computeNotBefore(err, NOW, { attempt: 5, firstAttemptAt: NOW })).toEqual(
      new Date(NOW.getTime() + 30_000),
    );
  });
});

describe('makeSafePolicy', () => {
  it('passes through normal returns unchanged', () => {
    const inner: RetryPolicy = {
      computeNotBefore: vi.fn(() => new Date(NOW.getTime() + 5_000)),
    };
    const safe = makeSafePolicy(inner, noopLogger);
    expect(safe.computeNotBefore(new Error('x'), NOW)).toEqual(new Date(NOW.getTime() + 5_000));
    expect(inner.computeNotBefore).toHaveBeenCalledTimes(1);
  });

  it('passes through undefined returns', () => {
    const inner: RetryPolicy = { computeNotBefore: () => undefined };
    const safe = makeSafePolicy(inner, noopLogger);
    expect(safe.computeNotBefore(new Error('x'), NOW)).toBeUndefined();
  });

  it('forwards the RetryContext argument', () => {
    const inner: RetryPolicy = {
      computeNotBefore: vi.fn(() => undefined),
    };
    const safe = makeSafePolicy(inner, noopLogger);
    const ctx = { attempt: 3, firstAttemptAt: NOW };
    safe.computeNotBefore(new Error('x'), NOW, ctx);
    expect(inner.computeNotBefore).toHaveBeenCalledWith(expect.any(Error), NOW, ctx);
  });

  it('catches thrown errors and returns undefined; logs a warning', () => {
    const warn = vi.fn();
    const logger = { ...noopLogger, warn };
    const inner: RetryPolicy = {
      computeNotBefore: () => {
        throw new Error('bug em policy custom');
      },
    };
    const safe = makeSafePolicy(inner, logger);
    expect(safe.computeNotBefore(new Error('original 429'), NOW)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const [message, context] = warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toMatch(/retryPolicy.*threw/);
    expect(context).toMatchObject({
      policyError: 'bug em policy custom',
      originalError: 'original 429',
    });
  });

  it('handles non-Error throws from the inner policy', () => {
    const warn = vi.fn();
    const logger = { ...noopLogger, warn };
    const inner: RetryPolicy = {
      computeNotBefore: () => {
        // biome-ignore lint/suspicious/noExplicitAny: simulating user code that throws a non-Error
        throw 'a string, not an Error' as any;
      },
    };
    const safe = makeSafePolicy(inner, logger);
    expect(safe.computeNotBefore(new Error('original'), NOW)).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    const [, context] = warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(context.policyError).toBe('a string, not an Error');
  });

  it('never throws even when the LOGGER itself throws on warn', () => {
    // Defense-in-depth: the whole point of makeSafePolicy is to never let
    // anything escape. If the consumer provides a buggy logger that throws,
    // we still must return undefined and let the caller continue.
    const explodingLogger: Logger = {
      debug: () => {},
      info: () => {},
      warn: () => {
        throw new Error('logger is also broken');
      },
      error: () => {},
    };
    const inner: RetryPolicy = {
      computeNotBefore: () => {
        throw new Error('policy bug');
      },
    };
    const safe = makeSafePolicy(inner, explodingLogger);
    expect(() => safe.computeNotBefore(new Error('original'), NOW)).not.toThrow();
    expect(safe.computeNotBefore(new Error('original'), NOW)).toBeUndefined();
  });
});
