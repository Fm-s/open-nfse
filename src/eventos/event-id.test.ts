import { describe, expect, it } from 'vitest';
import { InvalidEventoPedidoIdParamError, buildEventoPedidoId } from './event-id.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';

describe('buildEventoPedidoId', () => {
  // Per Anexo II SEFIN_ADN v1.00-20251226 (publicado 2025-12-27): o
  // nPedRegEvento foi removido da composição. Pattern `PRE[0-9]{56}` em vez
  // do antigo `PRE[0-9]{59}`. Era 62 chars; agora 59.
  it('builds PRE + chave(50) + tipoEvento(6) = 59 chars', () => {
    const id = buildEventoPedidoId({
      chaveAcesso: CHAVE,
      tipoEvento: '101101',
    });
    expect(id).toHaveLength(59);
    expect(id).toMatch(/^PRE\d{56}$/);
    expect(id).toBe(`PRE${CHAVE}101101`);
  });

  it('uses chave + tipoEvento for the suffix', () => {
    const id = buildEventoPedidoId({
      chaveAcesso: CHAVE,
      tipoEvento: '105102',
    });
    expect(id.endsWith('105102')).toBe(true);
    expect(id.startsWith('PRE')).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['abc', 'non-numeric'],
    ['1'.repeat(49), '49 digits'],
    ['1'.repeat(51), '51 digits'],
  ])('rejects chaveAcesso "%s" (%s)', (chave) => {
    expect(() => buildEventoPedidoId({ chaveAcesso: chave, tipoEvento: '101101' })).toThrow(
      InvalidEventoPedidoIdParamError,
    );
  });

  it('rejects tipoEvento that is not 6 digits', () => {
    expect(() => buildEventoPedidoId({ chaveAcesso: CHAVE, tipoEvento: '10110' })).toThrow(
      InvalidEventoPedidoIdParamError,
    );
  });

  it('exposes field + value on InvalidEventoPedidoIdParamError', () => {
    try {
      buildEventoPedidoId({ chaveAcesso: 'BAD', tipoEvento: '101101' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidEventoPedidoIdParamError);
      const e = err as InvalidEventoPedidoIdParamError;
      expect(e.field).toBe('chaveAcesso');
      expect(e.value).toBe('BAD');
    }
  });
});
