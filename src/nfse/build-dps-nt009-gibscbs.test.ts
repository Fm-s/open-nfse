import { describe, expect, it } from 'vitest';
import { type BuildDpsParamsNt009, buildDps } from './build-dps.js';
import { buildDpsXml } from './build-xml.js';
import type { DpsNt009 } from './domain.js';
import { OpcaoSimplesNacional, RegimeEspecialTributacao, TipoAjusteBCLocImoveis } from './enums.js';

// buildDps → DTO → buildDpsXml (nt009): cada opcional da classificação IBS/CBS
// gera, sozinho, o grupo `gIBSCBS` com exatamente aquele filho — um termo a menos
// na condição de criação do grupo o descartaria em silêncio (XSD continua válido).

function params(ibsCbs: BuildDpsParamsNt009['ibsCbs']): BuildDpsParamsNt009 {
  return {
    layout: 'nt009',
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
    dhEmi: new Date('2026-12-01T14:30:00Z'),
    dCompet: new Date('2026-12-01T12:00:00Z'),
    servico: { cTribNac: '250101', cNBS: '123456789', descricao: 'Locação de imóvel' },
    valores: { vServ: 1000, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
    ...(ibsCbs ? { ibsCbs } : {}),
  };
}

function nt009(p: BuildDpsParamsNt009): DpsNt009 {
  const dps = buildDps(p);
  if (dps.layout !== 'nt009') throw new Error('esperava nt009');
  return dps;
}

const CLASSIF = { CST: '000', cClassTrib: '000001' } as const;

describe('buildDps nt009 — gIBSCBS com um único opcional', () => {
  it.each([
    ['cCredPres', { cCredPres: '01' }, '<gIBSCBS><cCredPres>01</cCredPres></gIBSCBS>'],
    [
      'tributacaoRegular',
      { tributacaoRegular: { CSTReg: '000', cClassTribReg: '000001' } },
      '<gIBSCBS><gTribRegular><CSTReg>000</CSTReg><cClassTribReg>000001</cClassTribReg></gTribRegular></gIBSCBS>',
    ],
    [
      'diferimento',
      { diferimento: { pDifUF: 10, pDifMun: 20, pDifCBS: 30 } },
      '<gIBSCBS><gDif><pDifUF>10</pDifUF><pDifMun>20</pDifMun><pDifCBS>30</pDifCBS></gDif></gIBSCBS>',
    ],
  ])('só %s → gIBSCBS com exatamente esse filho', (_nome, opcional, esperado) => {
    const dps = nt009(params({ classificacao: { ...CLASSIF, ...opcional } }));
    const xml = buildDpsXml(dps);
    expect(xml).toContain(`<trib><CST>000</CST><cClassTrib>000001</cClassTrib>${esperado}</trib>`);
  });

  it('sem opcionais → sem gIBSCBS', () => {
    const xml = buildDpsXml(nt009(params({ classificacao: CLASSIF })));
    expect(xml).toContain('<trib><CST>000</CST><cClassTrib>000001</cClassTrib></trib>');
  });
});

describe('buildDps nt009 — ajustes da BC na locação de imóveis', () => {
  it('descricao do ajuste vira xTpAjusteBCLocImoveis', () => {
    const dps = nt009(
      params({
        classificacao: CLASSIF,
        imovel: {
          codMunicipio: '2111300',
          unidades: [
            {
              identificacao: { cCIB: 'ABC12345' },
              ajustesBC: [
                { tipo: TipoAjusteBCLocImoveis.Outras, descricao: 'Fundo de reserva', valor: 40 },
              ],
            },
          ],
        },
      }),
    );
    expect(buildDpsXml(dps)).toContain(
      '<gAjusteBCLocImoveis><tpAjusteBCLocImoveis>99</tpAjusteBCLocImoveis><xTpAjusteBCLocImoveis>Fundo de reserva</xTpAjusteBCLocImoveis><vAjusteBCLocImoveis>40</vAjusteBCLocImoveis></gAjusteBCLocImoveis>',
    );
  });
});
