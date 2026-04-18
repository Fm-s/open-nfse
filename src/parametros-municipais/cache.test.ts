import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TTL_MS, createInMemoryParametrosCache } from './cache.js';

describe('createInMemoryParametrosCache', () => {
  it('roundtrips get+set', async () => {
    const cache = createInMemoryParametrosCache();
    await cache.set('k', { a: 1 }, 60_000);
    expect(await cache.get('k')).toEqual({ a: 1 });
  });

  it('returns undefined on miss', async () => {
    const cache = createInMemoryParametrosCache();
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('evicts and returns undefined after TTL expires', async () => {
    vi.useFakeTimers();
    const cache = createInMemoryParametrosCache();
    await cache.set('k', 42, 1_000);
    expect(await cache.get('k')).toBe(42);
    vi.advanceTimersByTime(1_500);
    expect(await cache.get('k')).toBeUndefined();
    vi.useRealTimers();
  });

  it('DEFAULT_TTL_MS exposes sane defaults', () => {
    expect(DEFAULT_TTL_MS.aliquota).toBeGreaterThan(60_000);
    expect(DEFAULT_TTL_MS.historicoAliquotas).toBeGreaterThanOrEqual(DEFAULT_TTL_MS.aliquota);
    expect(DEFAULT_TTL_MS.convenio).toBeGreaterThanOrEqual(DEFAULT_TTL_MS.aliquota);
  });
});
