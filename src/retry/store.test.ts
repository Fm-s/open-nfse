import { describe, expect, it } from 'vitest';
import { MissingRetryStoreError, createInMemoryRetryStore, pendingEventId } from './store.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';

function sampleEntry(id: string) {
  return {
    id,
    kind: 'cancelamento_por_substituicao' as const,
    chaveNfse: CHAVE,
    tipoEvento: '105102',
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

  it('round-trips an entry with notBefore', async () => {
    const store = createInMemoryRetryStore();
    const notBefore = new Date('2026-05-12T11:00:00Z');
    await store.save({ ...sampleEntry('with-not-before'), notBefore });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.notBefore).toEqual(notBefore);
  });
});

describe('pendingEventId', () => {
  it('is deterministic for the same inputs', () => {
    const a = pendingEventId(CHAVE, '105102', 'cancelamento_por_substituicao');
    const b = pendingEventId(CHAVE, '105102', 'cancelamento_por_substituicao');
    expect(a).toBe(b);
  });

  it('differs when any part changes', () => {
    const base = pendingEventId(CHAVE, '105102', 'cancelamento_por_substituicao');
    expect(pendingEventId(CHAVE, '101101', 'cancelamento_por_substituicao')).not.toBe(base);
    expect(
      pendingEventId(
        '99999999999999999999999999999999999999999999999999',
        '105102',
        'cancelamento_por_substituicao',
      ),
    ).not.toBe(base);
  });

  it('differs by kind for the same NFS-e + tipoEvento (no silent collision)', () => {
    const manual = pendingEventId(CHAVE, '101101', 'cancelamento_simples');
    const rollback = pendingEventId(CHAVE, '101101', 'rollback_cancelamento');
    expect(manual).not.toBe(rollback);
  });
});

describe('MissingRetryStoreError', () => {
  it('is constructable', () => {
    const err = new MissingRetryStoreError();
    expect(err.message).toMatch(/RetryStore/);
  });
});
