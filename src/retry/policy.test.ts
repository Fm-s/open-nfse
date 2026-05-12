import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HttpStatusError,
  NetworkError,
  ServerError,
  TimeoutError,
  TooManyRequestsError,
} from '../errors/http.js';
import { createDefaultRetryPolicy } from './policy.js';

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
});
