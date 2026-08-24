import { describe, expect, it } from 'vitest';
import { InvalidEventoPedidoIdParamError, buildEventoPedidoId } from './event-id.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';

describe('buildEventoPedidoId', () => {
  // Per Anexo II SEFIN_ADN (desde v1.00-20251226): o nPedRegEvento foi removido
  // da composição — 59 chars em vez de 62. Pattern atual (bundle 20260727):
  // `PRE[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{33}`.
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

  // TSIdPedRegEvt (bundle 20260727): chave com CNPJ alfanumérico nas posições 10–23.
  it('accepts a chave with alphanumeric CNPJ (tpInsc=2)', () => {
    // cMun 2111300 + ambGer 2 + tpInsc 2 + CNPJ 12ABC345DE0100 + 27 dígitos.
    const chaveAlnum = `21113002212ABC345DE0100${'0'.repeat(27)}`;
    const id = buildEventoPedidoId({ chaveAcesso: chaveAlnum, tipoEvento: '101101' });
    expect(id).toBe(`PRE${chaveAlnum}101101`);
  });

  it.each([
    ['', 'empty'],
    ['abc', 'non-numeric'],
    ['1'.repeat(49), '49 digits'],
    ['1'.repeat(51), '51 digits'],
    [`211130023${'0'.repeat(41)}`, 'tpInsc inválido (3)'],
    [`21113002212abc345de0100${'0'.repeat(27)}`, 'letras minúsculas'],
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
