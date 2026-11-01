import { describe, expect, it } from 'vitest';
import { TipoAmbiente } from '../ambiente.js';
import { InvalidLayoutError } from '../errors/validation.js';
import { dpsNt009Completa } from '../nfse/__fixtures__/dps-nt009.js';
import { buildDps } from '../nfse/build-dps.js';
import type {
  BeneficioMunicipal,
  DpsNt004,
  DpsNt009,
  InfoValoresNt004,
  InfoValoresNt009,
  NFSe,
  ValoresNFSeNt004,
  ValoresNFSeNt009,
} from '../nfse/domain.js';
import {
  CST,
  FinalidadeNFSe,
  IndicadorDestinatario,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAjusteBCNt009,
  TipoDedRedNt004,
  TipoReembolsoRepasseNt004,
  TipoRetISSQN,
  TipoRetPisCofins,
  TipoTribISSQN,
} from '../nfse/enums.js';
import { synthNfse } from './synth.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';

function dpsNt004(valores: Partial<InfoValoresNt004> = {}): DpsNt004 {
  const base = buildDps({
    layout: 'nt004',
    nDPS: '1',
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.NaoOptante,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Teste' },
    valores: {
      vServ: 1000,
      aliqIss: 2,
      pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 },
    },
  });
  return { ...base, infDPS: { ...base.infDPS, valores: { ...base.infDPS.valores, ...valores } } };
}

/**
 * A fixture compartilhada é uma locação 99.03 (tribISSQN=4, sem ISSQN — E0532).
 * As fórmulas de BC/ISSQN precisam de uma operação tributável: mesma DPS com
 * tribISSQN=1, pAliq 2, ISS não retido e sem desconto incondicionado.
 */
function dpsNt009Tributavel(): DpsNt009 {
  const base = dpsNt009Completa();
  const { vDescCondIncond: _drop, ...valores } = base.infDPS.valores;
  return {
    ...base,
    infDPS: {
      ...base.infDPS,
      valores: {
        ...valores,
        trib: {
          ...valores.trib,
          tribMun: {
            tribISSQN: TipoTribISSQN.OperacaoTributavel,
            tpRetISSQN: TipoRetISSQN.NaoRetido,
            pAliq: 2,
          },
        },
      },
    },
  };
}

function dpsNt009(valores: Partial<InfoValoresNt009> = {}): DpsNt009 {
  const base = dpsNt009Tributavel();
  return { ...base, infDPS: { ...base.infDPS, valores: { ...base.infDPS.valores, ...valores } } };
}

function dpsNt009SemAjuste(): DpsNt009 {
  const base = dpsNt009Tributavel();
  const { vAjusteBC: _drop, ...valores } = base.infDPS.valores;
  return { ...base, infDPS: { ...base.infDPS, valores } };
}

function valoresNt004(nfse: NFSe): ValoresNFSeNt004 {
  if (nfse.layout !== 'nt004') throw new Error('esperava nt004');
  return nfse.infNFSe.valores;
}

function valoresNt009(nfse: NFSe): ValoresNFSeNt009 {
  if (nfse.layout !== 'nt009') throw new Error('esperava nt009');
  return nfse.infNFSe.valores;
}

describe('synthNfse — layout', () => {
  it.each([undefined, 'nt010', 'NT009'])('lança InvalidLayoutError para layout %s', (layout) => {
    const dps = { ...dpsNt009Completa(), layout } as never;
    expect(() => synthNfse(dps, CHAVE, TipoAmbiente.Homologacao)).toThrow(InvalidLayoutError);
  });
});

// Fórmulas do Anexo I (LEIAUTE DPS_NFS-e) — r38 (vCalcDR nt004 / vCalcAjusteBCISSQN
// nt009), r41 (vBC), r43 (vISSQN), r44 (vTotalRet), r45 (vLiq).
describe('synthNfse — valores (nt004)', () => {
  it('ISSQN não retido não é subtraído de vLiq e não entra em vTotalRet', () => {
    const v = valoresNt004(synthNfse(dpsNt004(), CHAVE, TipoAmbiente.Homologacao));
    expect(v).toEqual({ vBC: 1000, pAliqAplic: 2, vISSQN: 20, vLiq: 1000 });
  });

  it('ISSQN retido entra em vTotalRet e é subtraído de vLiq', () => {
    const base = dpsNt004();
    const dps: DpsNt004 = {
      ...base,
      infDPS: {
        ...base.infDPS,
        valores: {
          ...base.infDPS.valores,
          trib: {
            ...base.infDPS.valores.trib,
            tribMun: {
              ...base.infDPS.valores.trib.tribMun,
              tpRetISSQN: TipoRetISSQN.RetidoPeloTomador,
            },
          },
        },
      },
    };
    const v = valoresNt004(synthNfse(dps, CHAVE, TipoAmbiente.Homologacao));
    expect(v).toMatchObject({ vISSQN: 20, vTotalRet: 20, vLiq: 980 });
  });

  it('CP/IRRF/CSLL sempre retidos; PIS/COFINS só quando tpRetPisCofins indica retenção', () => {
    const base = dpsNt004({ vDescCondIncond: { vDescIncond: 100, vDescCond: 50 } });
    const dps: DpsNt004 = {
      ...base,
      infDPS: {
        ...base.infDPS,
        valores: {
          ...base.infDPS.valores,
          trib: {
            ...base.infDPS.valores.trib,
            tribFed: {
              vRetCP: 11,
              vRetIRRF: 15,
              vRetCSLL: 10,
              // 5 = PIS retido, COFINS/CSLL não retidos.
              piscofins: {
                CST: CST.TributavelAliquotaBasica,
                vPis: 6.5,
                vCofins: 30,
                tpRetPisCofins: TipoRetPisCofins.PisRetidoCofinsCsllNaoRetido,
              },
            },
          },
        },
      },
    };
    const v = valoresNt004(synthNfse(dps, CHAVE, TipoAmbiente.Homologacao));
    // vBC = 1000 − 100 (descIncond) = 900; vISSQN = 18 (não retido).
    // vTotalRet = 11 + 15 + 10 = 36; vLiq = 1000 − 50 − 100 − 36 − 6.5 (PIS) = 807.5.
    expect(v).toEqual({ vBC: 900, pAliqAplic: 2, vISSQN: 18, vTotalRet: 36, vLiq: 807.5 });
  });

  it('pDR vira vCalcDR (sobre vServ − descIncond) e reduz vBC/vISSQN', () => {
    const dps = dpsNt004({ vDescCondIncond: { vDescIncond: 100 }, vDedRed: { pDR: 10 } });
    const v = valoresNt004(synthNfse(dps, CHAVE, TipoAmbiente.Homologacao));
    expect(v).toEqual({ vCalcDR: 90, vBC: 810, pAliqAplic: 2, vISSQN: 16.2, vLiq: 900 });
    expect('vCalcAjusteBCISSQN' in v).toBe(false);
  });

  it('vDR informado reduz vBC sem gerar vCalcDR; documentos somam em vCalcDR', () => {
    const vDr = valoresNt004(
      synthNfse(dpsNt004({ vDedRed: { vDR: 200 } }), CHAVE, TipoAmbiente.Homologacao),
    );
    expect(vDr).toEqual({ vBC: 800, pAliqAplic: 2, vISSQN: 16, vLiq: 1000 });

    const doc = {
      referencia: { nDoc: '1' },
      tpDedRed: TipoDedRedNt004.Materiais,
      dtEmiDoc: new Date('2026-01-01'),
      vDedutivelRedutivel: 500,
    };
    const vDocs = valoresNt004(
      synthNfse(
        dpsNt004({
          vDedRed: {
            documentos: {
              docDedRed: [
                { ...doc, vDeducaoReducao: 100.25 },
                { ...doc, vDeducaoReducao: 49.75 },
              ],
            },
          },
        }),
        CHAVE,
        TipoAmbiente.Homologacao,
      ),
    );
    expect(vDocs).toEqual({ vCalcDR: 150, vBC: 850, pAliqAplic: 2, vISSQN: 17, vLiq: 1000 });
  });

  it('vCalcReeRepRes (Σ gReeRepRes.vlrReeRepRes) também abate a BC do ISSQN (r41)', () => {
    const base = dpsNt004({ vDescCondIncond: { vDescIncond: 100 } });
    const doc = {
      documento: { docOutro: { nDoc: 'REC-1', xDoc: 'Recibo' } },
      dtEmiDoc: new Date('2026-01-01'),
      dtCompDoc: new Date('2026-01-01'),
      tpReeRepRes: TipoReembolsoRepasseNt004.RepasseIntermediacaoImoveis,
    };
    const dps: DpsNt004 = {
      ...base,
      infDPS: {
        ...base.infDPS,
        IBSCBS: {
          finNFSe: FinalidadeNFSe.Regular,
          cIndOp: '100301',
          indDest: IndicadorDestinatario.TomadorEhDestinatario,
          valores: {
            gReeRepRes: {
              documentos: [
                { ...doc, vlrReeRepRes: 100 },
                { ...doc, vlrReeRepRes: 50 },
              ],
            },
            trib: { gIBSCBS: { CST: '000', cClassTrib: '000001' } },
          },
        },
      },
    };
    const v = valoresNt004(synthNfse(dps, CHAVE, TipoAmbiente.Homologacao));
    // vBC = 1000 − 100 (descIncond) − 150 (vCalcReeRepRes) = 750; vISSQN = 15.
    expect(v).toEqual({ vBC: 750, pAliqAplic: 2, vISSQN: 15, vLiq: 900 });
  });

  it('nt004 não sintetiza infNFSe.IBSCBS', () => {
    const nfse = synthNfse(dpsNt004(), CHAVE, TipoAmbiente.Homologacao);
    expect(nfse.infNFSe.IBSCBS).toBeUndefined();
  });
});

describe('synthNfse — valores (nt009)', () => {
  it('ajusteBC (percentual + documentos) vira vCalcAjusteBCISSQN e reduz vBC/vISSQN', () => {
    // Fixture: vServ 1000, pAjusteBCISSQN 10, docs 100.5 + 50, pAliq 2, ISS não retido.
    const v = valoresNt009(synthNfse(dpsNt009Tributavel(), CHAVE, TipoAmbiente.Homologacao));
    // vCalcAjusteBCISSQN = 10% × 1000 + 150.5 = 250.5; vBC = 749.5; vISSQN = 14.99.
    expect(v).toEqual({
      vCalcAjusteBCISSQN: 250.5,
      vBC: 749.5,
      pAliqAplic: 2,
      vISSQN: 14.99,
      vLiq: 1000,
    });
    expect('vCalcDR' in v).toBe(false);
  });

  it('vAjusteBCISSQN informado reduz vBC sem gerar vCalcAjusteBCISSQN', () => {
    const v = valoresNt009(
      synthNfse(
        dpsNt009({ vAjusteBC: { ajusteIssqn: { vAjusteBCISSQN: 400 } } }),
        CHAVE,
        TipoAmbiente.Homologacao,
      ),
    );
    expect(v).toEqual({ vBC: 600, pAliqAplic: 2, vISSQN: 12, vLiq: 1000 });
  });

  it('documento tpAjusteBC 105 (glosa de saúde) não ajusta a BC do ISSQN (AJUSTE_BC_REPERCUSSÃO r18)', () => {
    const doc = dpsNt009Tributavel().infDPS.valores.vAjusteBC?.documentos?.docAjusteBC[0];
    if (!doc) throw new Error('fixture sem docAjusteBC');
    const v = valoresNt009(
      synthNfse(
        dpsNt009({
          vDescCondIncond: { vDescIncond: 100 },
          vAjusteBC: {
            documentos: {
              docAjusteBC: [
                { ...doc, tpAjusteBC: TipoAjusteBCNt009.GlosaServicosSaude, vAjusteAplic: 300 },
              ],
            },
          },
        }),
        CHAVE,
        TipoAmbiente.Homologacao,
      ),
    );
    // vBC = 1000 − 100 (descIncond); a glosa só ajusta a BC do IBS/CBS.
    expect(v).toEqual({ vBC: 900, pAliqAplic: 2, vISSQN: 18, vLiq: 900 });
  });

  it('benefício municipal informado (vRedBCBM / pRedBCBM) reduz a BC', () => {
    const base = dpsNt009SemAjuste();
    const comBM = (BM: BeneficioMunicipal): DpsNt009 => ({
      ...base,
      infDPS: {
        ...base.infDPS,
        valores: {
          ...base.infDPS.valores,
          trib: {
            ...base.infDPS.valores.trib,
            tribMun: { ...base.infDPS.valores.trib.tribMun, BM },
          },
        },
      },
    });
    const vRed = valoresNt009(
      synthNfse(comBM({ nBM: '21113000100001', vRedBCBM: 100 }), CHAVE, TipoAmbiente.Homologacao),
    );
    expect(vRed).toMatchObject({ vBC: 900, vISSQN: 18 });
    expect('vCalcBM' in vRed).toBe(false);
    const pRed = valoresNt009(
      synthNfse(comBM({ nBM: '21113000100001', pRedBCBM: 10 }), CHAVE, TipoAmbiente.Homologacao),
    );
    expect(pRed).toMatchObject({ vCalcBM: 100, vBC: 900, vISSQN: 18 });
  });

  it('DPS com IBSCBS → infNFSe.IBSCBS.totCIBS.vTotNF = vLiq (r68, 2026)', () => {
    const nfse = synthNfse(dpsNt009Completa(), CHAVE, TipoAmbiente.Homologacao);
    if (nfse.layout !== 'nt009') throw new Error('esperava nt009');
    expect(nfse.infNFSe.IBSCBS).toEqual({ totCIBS: { vTotNF: nfse.infNFSe.valores.vLiq } });
  });

  it('DPS sem IBSCBS → NFS-e sem IBSCBS', () => {
    const base = dpsNt009Completa();
    const { IBSCBS: _drop, ...infDPS } = base.infDPS;
    const nfse = synthNfse({ ...base, infDPS }, CHAVE, TipoAmbiente.Homologacao);
    expect(nfse.infNFSe.IBSCBS).toBeUndefined();
  });

  it('operação não tributável não gera vBC', () => {
    const base = dpsNt009SemAjuste();
    const dps: DpsNt009 = {
      ...base,
      infDPS: {
        ...base.infDPS,
        valores: {
          ...base.infDPS.valores,
          trib: {
            ...base.infDPS.valores.trib,
            tribMun: {
              tribISSQN: TipoTribISSQN.ExportacaoServico,
              tpRetISSQN: TipoRetISSQN.NaoRetido,
            },
          },
        },
      },
    };
    expect(valoresNt009(synthNfse(dps, CHAVE, TipoAmbiente.Homologacao))).toEqual({
      vLiq: 1000,
    });
  });
});
