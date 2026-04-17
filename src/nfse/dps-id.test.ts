import { describe, expect, it } from 'vitest';
import { InvalidDpsIdParamError, buildDpsId } from './dps-id.js';

describe('buildDpsId', () => {
  it('builds a 45-char ID following "DPS" + cMun(7) + tpInsc(1) + insc(14) + serie(5) + nDPS(15)', () => {
    const id = buildDpsId({
      cLocEmi: '2111300',
      tipoInsc: 'CNPJ',
      inscricaoFederal: '22005747530001',
      serie: '1',
      nDPS: '146726',
    });

    expect(id).toHaveLength(45);
    expect(id).toBe('DPS211130012200574753000100001000000000146726');
    expect(id.slice(0, 3)).toBe('DPS');
    expect(id.slice(3, 10)).toBe('2111300');
    expect(id.slice(10, 11)).toBe('1');
    expect(id.slice(11, 25)).toBe('22005747530001');
    expect(id.slice(25, 30)).toBe('00001');
    expect(id.slice(30, 45)).toBe('000000000146726');
  });

  it('left-pads CPF with "000" to reach 14 digits and uses tpInsc=2', () => {
    const id = buildDpsId({
      cLocEmi: '3550308',
      tipoInsc: 'CPF',
      inscricaoFederal: '12345678901',
      serie: '99',
      nDPS: '1',
    });

    expect(id).toBe('DPS355030820001234567890100099000000000000001');
    expect(id.slice(10, 11)).toBe('2');
    expect(id.slice(11, 25)).toBe('00012345678901');
    expect(id.slice(25, 30)).toBe('00099');
    expect(id.slice(30, 45)).toBe('000000000000001');
  });

  it('left-pads serie and nDPS with zeros when shorter than max length', () => {
    const id = buildDpsId({
      cLocEmi: '2111300',
      tipoInsc: 'CNPJ',
      inscricaoFederal: '22005747530001',
      serie: '7',
      nDPS: '42',
    });

    expect(id.slice(25, 30)).toBe('00007');
    expect(id.slice(30, 45)).toBe('000000000000042');
  });

  it('accepts serie at 5 digits and nDPS at 15 digits without extra padding', () => {
    const id = buildDpsId({
      cLocEmi: '2111300',
      tipoInsc: 'CNPJ',
      inscricaoFederal: '22005747530001',
      serie: '99999',
      nDPS: '123456789012345',
    });

    expect(id.slice(25, 30)).toBe('99999');
    expect(id.slice(30, 45)).toBe('123456789012345');
  });

  it('preserves leading zeros in CNPJ', () => {
    const id = buildDpsId({
      cLocEmi: '2111300',
      tipoInsc: 'CNPJ',
      inscricaoFederal: '00001234567890',
      serie: '1',
      nDPS: '1',
    });

    expect(id.slice(11, 25)).toBe('00001234567890');
  });

  it.each([
    ['', 'empty'],
    ['abc', 'non-numeric'],
    ['211130', '6 digits'],
    ['21113000', '8 digits'],
  ])('rejects cLocEmi "%s" (%s)', (cLocEmi) => {
    expect(() =>
      buildDpsId({
        cLocEmi,
        tipoInsc: 'CNPJ',
        inscricaoFederal: '22005747530001',
        serie: '1',
        nDPS: '1',
      }),
    ).toThrow(InvalidDpsIdParamError);
  });

  it('rejects CNPJ with fewer than 14 digits', () => {
    expect(() =>
      buildDpsId({
        cLocEmi: '2111300',
        tipoInsc: 'CNPJ',
        inscricaoFederal: '1234567890123',
        serie: '1',
        nDPS: '1',
      }),
    ).toThrow(InvalidDpsIdParamError);
  });

  it('rejects CPF with fewer than 11 digits', () => {
    expect(() =>
      buildDpsId({
        cLocEmi: '2111300',
        tipoInsc: 'CPF',
        inscricaoFederal: '1234567890',
        serie: '1',
        nDPS: '1',
      }),
    ).toThrow(InvalidDpsIdParamError);
  });

  it('rejects non-numeric inscricaoFederal', () => {
    expect(() =>
      buildDpsId({
        cLocEmi: '2111300',
        tipoInsc: 'CNPJ',
        inscricaoFederal: 'abcdefghijklmn',
        serie: '1',
        nDPS: '1',
      }),
    ).toThrow(InvalidDpsIdParamError);
  });

  it('rejects serie longer than 5 digits', () => {
    expect(() =>
      buildDpsId({
        cLocEmi: '2111300',
        tipoInsc: 'CNPJ',
        inscricaoFederal: '22005747530001',
        serie: '123456',
        nDPS: '1',
      }),
    ).toThrow(InvalidDpsIdParamError);
  });

  it('rejects nDPS longer than 15 digits', () => {
    expect(() =>
      buildDpsId({
        cLocEmi: '2111300',
        tipoInsc: 'CNPJ',
        inscricaoFederal: '22005747530001',
        serie: '1',
        nDPS: '1234567890123456',
      }),
    ).toThrow(InvalidDpsIdParamError);
  });

  it('rejects empty serie or nDPS', () => {
    expect(() =>
      buildDpsId({
        cLocEmi: '2111300',
        tipoInsc: 'CNPJ',
        inscricaoFederal: '22005747530001',
        serie: '',
        nDPS: '1',
      }),
    ).toThrow(InvalidDpsIdParamError);

    expect(() =>
      buildDpsId({
        cLocEmi: '2111300',
        tipoInsc: 'CNPJ',
        inscricaoFederal: '22005747530001',
        serie: '1',
        nDPS: '',
      }),
    ).toThrow(InvalidDpsIdParamError);
  });

  it('exposes field and value on InvalidDpsIdParamError', () => {
    try {
      buildDpsId({
        cLocEmi: 'XYZ',
        tipoInsc: 'CNPJ',
        inscricaoFederal: '22005747530001',
        serie: '1',
        nDPS: '1',
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidDpsIdParamError);
      const typedErr = err as InvalidDpsIdParamError;
      expect(typedErr.field).toBe('cLocEmi');
      expect(typedErr.value).toBe('XYZ');
    }
  });

  it('matches the TSIdDPS regex pattern "DPS[0-9]{42}"', () => {
    const id = buildDpsId({
      cLocEmi: '2111300',
      tipoInsc: 'CNPJ',
      inscricaoFederal: '22005747530001',
      serie: '1',
      nDPS: '146726',
    });

    expect(id).toMatch(/^DPS\d{42}$/);
  });
});
