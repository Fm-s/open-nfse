import { describe, expect, it } from 'vitest';
import { MissingRetryStoreError, createInMemoryRetryStore, pendingEventId } from './retry-store.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';

function sampleEntry(id: string) {
  return {
    id,
    kind: 'cancelamento_por_substituicao' as const,
    chaveNfse: CHAVE,
    tipoEvento: '105102',
    nPedRegEvento: '001',
    cMotivo: '99',
    xmlAssinado: '<xml/>',
    firstAttemptAt: new Date('2026-04-17T12:00:00Z'),
    lastAttemptAt: new Date('2026-04-17T12:00:00Z'),
    lastError: { message: 'timeout', errorName: 'TimeoutError', transient: true },
  };
}

describe('createInMemoryRetryStore', () => {
  it('save + list + delete roundtrip', async () => {
    const store = createInMemoryRetryStore();
    await store.save(sampleEntry('a'));
    await store.save(sampleEntry('b'));
    expect(await store.list()).toHaveLength(2);

    await store.delete('a');
    const remaining = await store.list();
    expect(remaining.map((e) => e.id)).toEqual(['b']);
  });

  it('save with same id overwrites (idempotent)', async () => {
    const store = createInMemoryRetryStore();
    await store.save(sampleEntry('x'));
    await store.save({ ...sampleEntry('x'), xmlAssinado: '<new/>' });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.xmlAssinado).toBe('<new/>');
  });

  it('delete non-existent id does not throw', async () => {
    const store = createInMemoryRetryStore();
    await expect(store.delete('nope')).resolves.toBeUndefined();
  });
});

describe('pendingEventId', () => {
  it('is deterministic for the same inputs', () => {
    const a = pendingEventId(CHAVE, '105102', '001');
    const b = pendingEventId(CHAVE, '105102', '001');
    expect(a).toBe(b);
  });

  it('differs when any part changes', () => {
    const base = pendingEventId(CHAVE, '105102', '001');
    expect(pendingEventId(CHAVE, '101101', '001')).not.toBe(base);
    expect(pendingEventId(CHAVE, '105102', '002')).not.toBe(base);
  });
});

describe('MissingRetryStoreError', () => {
  it('is constructable', () => {
    const err = new MissingRetryStoreError();
    expect(err.message).toMatch(/RetryStore/);
  });
});
