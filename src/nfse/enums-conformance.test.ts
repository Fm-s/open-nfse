import { describe, expect, it } from 'vitest';
import {
  IndicadorDestinatario,
  MecanismoApoioComExPrestador,
  MecanismoApoioComExTomador,
  RegimeEspecialTributacao,
  SituacaoNfse,
} from './enums.js';

// Trava a conformidade dos enums adicionados/ajustados no alinhamento ao RTC
// v1.01 (auditoria 2026-05). Os valores são os <xs:enumeration> oficiais de
// schemas/1.01/tiposSimples_v1.01.xsd; mudar um valor de fio deve quebrar aqui.
describe('conformidade de enums com tiposSimples_v1.01.xsd', () => {
  it('RegimeEspecialTributacao cobre TSRegEspTrib (0-6, 9) incluindo Outros', () => {
    expect(Object.values(RegimeEspecialTributacao).sort()).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '9',
    ]);
    expect(RegimeEspecialTributacao.Outros).toBe('9');
  });

  it('SituacaoNfse cobre TStat (100/102/103/107)', () => {
    expect(Object.values(SituacaoNfse).sort()).toEqual(['100', '102', '103', '107']);
  });

  it('IndicadorDestinatario cobre TSRTCIndDest (0/1)', () => {
    expect(Object.values(IndicadorDestinatario).sort()).toEqual(['0', '1']);
  });

  it('MecanismoApoioComExPrestador cobre TSMecAFComExPrest (00-08)', () => {
    const expected = Array.from({ length: 9 }, (_, i) => String(i).padStart(2, '0'));
    expect(Object.values(MecanismoApoioComExPrestador).sort()).toEqual(expected);
  });

  it('MecanismoApoioComExTomador cobre TSMecAFComExToma (00-26)', () => {
    const expected = Array.from({ length: 27 }, (_, i) => String(i).padStart(2, '0'));
    expect(Object.values(MecanismoApoioComExTomador).sort()).toEqual(expected);
  });
});
