import { describe, expect, it } from 'vitest';
import { InvalidEventoPedidoIdParamError, buildEventoPedidoId } from './event-id.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';

describe('buildEventoPedidoId', () => {
  it('builds PRE + chave(50) + tipoEvento(6) + nPedReg(3) = 62 chars', () => {
    const id = buildEventoPedidoId({
      chaveAcesso: CHAVE,
      tipoEvento: '101101',
      nPedRegEvento: '1',
    });
    expect(id).toHaveLength(62);
    expect(id).toMatch(/^PRE\d{59}$/);
    expect(id).toBe(`PRE${CHAVE}101101001`);
  });

  it('left-pads nPedRegEvento to 3 digits', () => {
    const id = buildEventoPedidoId({
      chaveAcesso: CHAVE,
      tipoEvento: '105102',
      nPedRegEvento: '7',
    });
    expect(id.endsWith('007')).toBe(true);
  });

  it('accepts nPedReg at full 3 digits', () => {
    const id = buildEventoPedidoId({
      chaveAcesso: CHAVE,
      tipoEvento: '101101',
      nPedRegEvento: '999',
    });
    expect(id.endsWith('999')).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['abc', 'non-numeric'],
    ['1'.repeat(49), '49 digits'],
    ['1'.repeat(51), '51 digits'],
  ])('rejects chaveAcesso "%s" (%s)', (chave) => {
    expect(() =>
      buildEventoPedidoId({ chaveAcesso: chave, tipoEvento: '101101', nPedRegEvento: '1' }),
    ).toThrow(InvalidEventoPedidoIdParamError);
  });

  it('rejects tipoEvento that is not 6 digits', () => {
    expect(() =>
      buildEventoPedidoId({ chaveAcesso: CHAVE, tipoEvento: '10110', nPedRegEvento: '1' }),
    ).toThrow(InvalidEventoPedidoIdParamError);
  });

  it('rejects nPedRegEvento longer than 3 digits', () => {
    expect(() =>
      buildEventoPedidoId({ chaveAcesso: CHAVE, tipoEvento: '101101', nPedRegEvento: '1234' }),
    ).toThrow(InvalidEventoPedidoIdParamError);
  });

  it('exposes field + value on InvalidEventoPedidoIdParamError', () => {
    try {
      buildEventoPedidoId({ chaveAcesso: 'BAD', tipoEvento: '101101', nPedRegEvento: '1' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidEventoPedidoIdParamError);
      const e = err as InvalidEventoPedidoIdParamError;
      expect(e.field).toBe('chaveAcesso');
      expect(e.value).toBe('BAD');
    }
  });
});
