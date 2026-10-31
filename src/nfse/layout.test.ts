import { describe, expect, it } from 'vitest';
import { InvalidLayoutError, LayoutMismatchError, ValidationError } from '../errors/validation.js';
import { dpsNt009Completa } from './__fixtures__/dps-nt009.js';
import { buildDps } from './build-dps.js';
import { buildDpsXml } from './build-xml.js';
import { collectCepsFromDps, collectIdentifiersFromDps } from './collect-from-dps.js';
import { OpcaoSimplesNacional, RegimeEspecialTributacao } from './enums.js';
import { assertLayout, assertNoForeignLayoutFields, assertSameLayout, LAYOUTS } from './layout.js';

describe('assertLayout', () => {
  it('aceita os ids conhecidos', () => {
    expect(assertLayout('nt004')).toBe('nt004');
    expect(assertLayout('nt009')).toBe('nt009');
    expect(LAYOUTS).toEqual(['nt004', 'nt009']);
  });

  it.each(['NT009', 'nt010', undefined, 9])('rejeita %s', (v) => {
    expect(() => assertLayout(v)).toThrow(InvalidLayoutError);
  });

  it('expõe o valor recebido e lista os válidos na mensagem', () => {
    try {
      assertLayout('nt010');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidLayoutError);
      expect((e as InvalidLayoutError).received).toBe('nt010');
      expect((e as Error).message).toContain('nt004');
      expect((e as Error).message).toContain('nt009');
    }
  });
});

describe('assertSameLayout', () => {
  it('aceita DPS do mesmo layout', () => {
    expect(() => assertSameLayout('nt009', dpsNt009Completa())).not.toThrow();
  });

  it('lança LayoutMismatchError com expected/received para DPS de outro layout', () => {
    try {
      assertSameLayout('nt004', dpsNt009Completa());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LayoutMismatchError);
      expect(e).toBeInstanceOf(ValidationError);
      expect(e).toMatchObject({ expected: 'nt004', received: 'nt009' });
      expect((e as LayoutMismatchError).field).toBeUndefined();
    }
  });

  it('DPS com layout desconhecido → InvalidLayoutError', () => {
    const dps = { ...dpsNt009Completa(), layout: 'nt010' } as never;
    expect(() => assertSameLayout('nt009', dps)).toThrow(InvalidLayoutError);
  });
});

describe('assertNoForeignLayoutFields', () => {
  const nt009 = dpsNt009Completa();
  const nt004 = dpsNt004Minima();

  it.each([
    [
      'infDPS.valores.vDedRed',
      { ...nt009, infDPS: { ...nt009.infDPS, valores: { ...nt009.infDPS.valores, vDedRed: {} } } },
    ],
    [
      'infDPS.IBSCBS.finNFSe',
      { ...nt009, infDPS: { ...nt009.infDPS, IBSCBS: { ...nt009.infDPS.IBSCBS, finNFSe: '0' } } },
    ],
    [
      'infDPS.IBSCBS.valores.gReeRepRes',
      {
        ...nt009,
        infDPS: {
          ...nt009.infDPS,
          IBSCBS: {
            ...nt009.infDPS.IBSCBS,
            valores: { ...nt009.infDPS.IBSCBS?.valores, gReeRepRes: { documentos: [] } },
          },
        },
      },
    ],
  ])('DPS nt009 com %s (do nt004) → LayoutMismatchError', (field, dps) => {
    expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
      expect.objectContaining({ name: 'LayoutMismatchError', field, expected: 'nt009' }),
    );
  });

  it.each([
    ['infDPS.finNFSe', { ...nt004, infDPS: { ...nt004.infDPS, finNFSe: '0' } }],
    [
      'infDPS.valores.vAjusteBC',
      {
        ...nt004,
        infDPS: { ...nt004.infDPS, valores: { ...nt004.infDPS.valores, vAjusteBC: {} } },
      },
    ],
    [
      'infDPS.IBSCBS.bensMoveis',
      { ...nt004, infDPS: { ...nt004.infDPS, IBSCBS: { bensMoveis: [] } } },
    ],
  ])('DPS nt004 com %s (do nt009) → LayoutMismatchError', (field, dps) => {
    expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
      expect.objectContaining({ field, expected: 'nt004', received: 'nt004' }),
    );
  });

  it('aceita DPS limpas dos dois layouts', () => {
    expect(() => assertNoForeignLayoutFields(nt009)).not.toThrow();
    expect(() => assertNoForeignLayoutFields(nt004)).not.toThrow();
  });

  it('layout desconhecido → InvalidLayoutError', () => {
    expect(() => assertNoForeignLayoutFields({ ...nt004, layout: 'nt010' } as never)).toThrow(
      InvalidLayoutError,
    );
  });
});

describe('layout desconhecido nos walkers da DPS', () => {
  const dps = { ...dpsNt004Minima(), layout: 'nt010' } as never;

  it('buildDpsXml lança InvalidLayoutError (não cai silenciosamente no nt004)', () => {
    expect(() => buildDpsXml(dps)).toThrow(InvalidLayoutError);
  });

  it('collectCepsFromDps / collectIdentifiersFromDps lançam InvalidLayoutError', () => {
    expect(() => collectCepsFromDps(dps)).toThrow(InvalidLayoutError);
    expect(() => collectIdentifiersFromDps(dps)).toThrow(InvalidLayoutError);
  });
});

function dpsNt004Minima() {
  return buildDps({
    layout: 'nt004',
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.NaoOptante,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    nDPS: '1',
    servico: { cTribNac: '250101', descricao: 'Teste' },
    valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
  });
}
