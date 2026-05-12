import { describe, expect, it, vi } from 'vitest';
import {
  ForbiddenError,
  HttpError,
  HttpStatusError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  TooManyRequestsError,
  UnauthorizedError,
} from './http.js';

describe('HttpStatusError', () => {
  it('exposes status and body', () => {
    const err = new HttpStatusError(500, 'internal');
    expect(err.status).toBe(500);
    expect(err.body).toBe('internal');
  });

  it('accepts an undefined body', () => {
    expect(new HttpStatusError(502, undefined).body).toBeUndefined();
  });

  it('is an HttpError', () => {
    expect(new HttpStatusError(500, undefined)).toBeInstanceOf(HttpError);
  });
});

describe('TimeoutError', () => {
  it('exposes the timeout in ms and mentions it in the message', () => {
    const err = new TimeoutError(5000);
    expect(err.timeoutMs).toBe(5000);
    expect(err.message).toContain('5000');
  });
});

describe('NetworkError', () => {
  it('wraps the underlying cause', () => {
    const cause = new Error('ECONNREFUSED');
    const err = new NetworkError('conexão recusada', { cause });
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('conexão recusada');
  });
});

describe('UnauthorizedError', () => {
  it('pins status to 401 and is catchable as HttpStatusError and HttpError', () => {
    const err = new UnauthorizedError('whatever');
    expect(err.status).toBe(401);
    expect(err).toBeInstanceOf(HttpStatusError);
    expect(err).toBeInstanceOf(HttpError);
  });

  it('has a guidance message mentioning the certificate', () => {
    expect(new UnauthorizedError(undefined).message).toMatch(/certificado/i);
  });
});

describe('ForbiddenError', () => {
  it('pins status to 403 and mentions habilitação', () => {
    const err = new ForbiddenError(undefined);
    expect(err.status).toBe(403);
    expect(err.message).toMatch(/habilitado/i);
  });
});

describe('NotFoundError', () => {
  it('pins status to 404', () => {
    expect(new NotFoundError(undefined).status).toBe(404);
  });
});

describe('ServerError', () => {
  it('preserves the 5xx status passed in', () => {
    const err = new ServerError(503, 'overloaded');
    expect(err.status).toBe(503);
    expect(err.body).toBe('overloaded');
    expect(err.message).toContain('503');
  });
});

describe('HttpStatusError.getRetryAfterMs', () => {
  it('parses delta-seconds', () => {
    const err = new HttpStatusError(429, undefined, { headers: { 'retry-after': '120' } });
    expect(err.getRetryAfterMs()).toBe(120_000);
  });

  it('parses HTTP-date in the future', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));
    const err = new HttpStatusError(503, undefined, {
      headers: { 'retry-after': 'Tue, 12 May 2026 10:02:00 GMT' },
    });
    expect(err.getRetryAfterMs()).toBe(120_000);
    vi.useRealTimers();
  });

  it('returns 0 for HTTP-date in the past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));
    const err = new HttpStatusError(503, undefined, {
      headers: { 'retry-after': 'Tue, 12 May 2020 10:00:00 GMT' },
    });
    expect(err.getRetryAfterMs()).toBe(0);
    vi.useRealTimers();
  });

  it('returns undefined for malformed value', () => {
    const err = new HttpStatusError(429, undefined, { headers: { 'retry-after': 'banana' } });
    expect(err.getRetryAfterMs()).toBeUndefined();
  });

  it('returns undefined for negative delta-seconds', () => {
    const err = new HttpStatusError(429, undefined, { headers: { 'retry-after': '-5' } });
    expect(err.getRetryAfterMs()).toBeUndefined();
  });

  it('returns undefined when header is absent', () => {
    const err = new HttpStatusError(429, undefined);
    expect(err.getRetryAfterMs()).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    const err = new HttpStatusError(429, undefined, { headers: { 'retry-after': '' } });
    expect(err.getRetryAfterMs()).toBeUndefined();
  });
});

describe('TooManyRequestsError', () => {
  it('has status 429', () => {
    const err = new TooManyRequestsError(undefined);
    expect(err.status).toBe(429);
  });

  it('is an instance of HttpStatusError', () => {
    const err = new TooManyRequestsError(undefined);
    expect(err).toBeInstanceOf(HttpStatusError);
  });

  it('preserves headers passed in', () => {
    const err = new TooManyRequestsError('body', { headers: { 'retry-after': '60' } });
    expect(err.headers['retry-after']).toBe('60');
    expect(err.getRetryAfterMs()).toBe(60_000);
  });
});
