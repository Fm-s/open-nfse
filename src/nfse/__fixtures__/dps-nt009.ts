// Fixtures DTO compartilhadas do layout nt009 (fora do dist — ver tsconfig.build.json).
// Locação de imóvel (99.03.01) que respeita as regras de rejeição fechadas do
// Anexo I 20261020 (as que dependem só da DPS) — build-dps.test.ts confere que
// buildDps, com seus guards, produz exatamente esta DPS. Única exceção, de
// propósito: `bensMoveis` (só 99.04.01, E0963/E0967) não cabe numa DPS com
// `gLocacao` (só 99.03, E0936/E0937), e a fixture cobre os dois grupos.
// Regras abertas (cadastros, tabelas IBGE/NBS/CIB, calculadora IBS/CBS) não
// são garantidas.
import type { DpsNt009, InfDPSNt009 } from '../domain.js';
import {
  FinalidadeNFSe,
  IndicadorDestinatario,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAjusteBCLocImoveisNt009,
  TipoAjusteBCNt009,
  TipoAmbienteDps,
  TipoChaveDFe,
  TipoEmitenteDps,
  TipoRetISSQN,
  TipoTribISSQN,
} from '../enums.js';

const CHAVE_NFSE = '21113002200574753000100000000000146726037032711025';

function infDPSNt009Completa(): InfDPSNt009 {
  return {
    Id: 'DPS211130020057475300010000001000000000000001', // tipoInsc 2 = CNPJ (como buildDpsId)
    tpAmb: TipoAmbienteDps.Homologacao,
    dhEmi: new Date('2026-12-01T14:30:00Z'),
    verAplic: 'test-1.0.0',
    serie: '1',
    nDPS: '1',
    dCompet: new Date('2026-12-01T12:00:00Z'),
    tpEmit: TipoEmitenteDps.Prestador,
    finNFSe: FinalidadeNFSe.Regular,
    cLocEmi: '2111300',
    prest: {
      identificador: { CNPJ: '00574753000100' },
      IM: '6123007',
      regTrib: {
        opSimpNac: OpcaoSimplesNacional.NaoOptante,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    toma: {
      identificador: { CPF: '12345678909' },
      xNome: 'Tomador de Teste',
      end: {
        localidade: { endNac: { cMun: '2111300', CEP: '65000000' } },
        xLgr: 'Rua A',
        nro: '10',
        xBairro: 'Centro',
      },
    },
    serv: {
      locPrest: { cLocPrestacao: '2111300' },
      cServ: {
        cTribNac: '990301',
        xDescServ: 'Locação de imóvel',
        cNBS: '123456789',
        cIntContrib: 'INT001',
      },
    },
    valores: {
      vServPrest: { vServ: 1000 },
      // E0434: vDescIncond = pCopropriedade (100%) × vDescIncondTot (10).
      vDescCondIncond: { vDescIncond: 10 },
      vAjusteBC: {
        ajusteIssqn: { pAjusteBCISSQN: 10 },
        documentos: {
          docAjusteBC: [
            {
              // 102: convive com pAjusteBCISSQN (E0462), admite docOutro (E0479)
              // e dispensa E0435 com tribISSQN=4.
              tpAjusteBC: TipoAjusteBCNt009.RepasseFornecedorAgenciaTurismo,
              vTotDoc: 200,
              vAjusteAplic: 100.5,
              dtEmiDoc: new Date('2026-11-20T12:00:00Z'),
              documento: { docOutro: { nDoc: 'REC-41', xDoc: 'Recibo' } },
              fornec: {
                identificador: { CNPJ: '11222333000181' },
                xNome: 'Fornecedor de Teste',
                // E0492: fornecedor com CPF/CNPJ exige endereço nacional.
                end: {
                  localidade: { endNac: { cMun: '2111300', CEP: '65020000' } },
                  xLgr: 'Rua F',
                  nro: '5',
                  xBairro: 'Centro',
                },
              },
            },
            {
              // 199 exige documento fiscal (E0479).
              tpAjusteBC: TipoAjusteBCNt009.OutrosReembolsos,
              xTpAjusteBC: 'Reembolso de despesas',
              vTotDoc: 50,
              vAjusteAplic: 50,
              dtCompDoc: new Date('2026-11-25T12:00:00Z'),
              documento: { dFeNacional: { tipoChaveDFe: TipoChaveDFe.Nfse, chaveDFe: CHAVE_NFSE } },
            },
          ],
        },
      },
      trib: {
        // E0532 (nt009): 99.XX.XX exige tribISSQN=4 — e então sem pAliq (E0602).
        tribMun: {
          tribISSQN: TipoTribISSQN.NaoIncidencia,
          tpRetISSQN: TipoRetISSQN.NaoRetido,
        },
        // Não Optante não usa indTotTrib (E0713).
        totTrib: { pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
      },
    },
    IBSCBS: {
      // 99.03 exige cIndOp 02XXXX (E0902); 020101 admite imovel (E0928/E0932) e
      // exige gUnidImob (E0938).
      cIndOp: '020101',
      indDest: IndicadorDestinatario.TomadorEhDestinatario,
      imovel: {
        cMun: '2111300',
        gLocacao: {
          pCopropriedade: 100,
          vTotOper: 1000,
          vDescIncondTot: 10,
          dVencOrig: new Date('2026-12-10T12:00:00Z'),
        },
        gUnidImob: [
          {
            inscImobFisc: 'IMOB-1',
            identificacao: { cCIB: 'ABC12345' },
            gAjusteBCLocImoveis: [
              {
                tpAjusteBCLocImoveis: TipoAjusteBCLocImoveisNt009.Condominio,
                vAjusteBCLocImoveis: 150,
              },
            ],
          },
          {
            identificacao: {
              end: {
                CEP: '65010000',
                xLgr: 'Av. B',
                nro: '200',
                xCpl: 'Apto 3',
                xBairro: 'Jardim',
              },
            },
          },
        ],
      },
      bensMoveis: [
        { cNCMBemMovel: '94036000', xNCMBemMovel: 'Móveis de madeira', qtdNCMBemMovel: '3' },
        { cNCMBemMovel: '84183000', xNCMBemMovel: 'Congelador', qtdNCMBemMovel: '1' },
      ],
      valores: { trib: { CST: '000', cClassTrib: '000001' } },
    },
  };
}

/** DPS nt009 com todos os grupos novos do release 1 preenchidos. */
export function dpsNt009Completa(): DpsNt009 {
  return { layout: 'nt009', versao: '1.01', infDPS: infDPSNt009Completa() };
}

/**
 * Como {@link dpsNt009Completa}, mas com `bensMoveis`, `gUnidImob` e
 * `gAjusteBCLocImoveis` como arrays vazios — o serializer deve omiti-los.
 */
export function dpsNt009ComArraysVazios(): DpsNt009 {
  const base = infDPSNt009Completa();
  const ibscbs = base.IBSCBS;
  if (!ibscbs?.imovel) throw new Error('fixture inconsistente: IBSCBS.imovel ausente');
  return {
    layout: 'nt009',
    versao: '1.01',
    infDPS: {
      ...base,
      IBSCBS: {
        ...ibscbs,
        imovel: { ...ibscbs.imovel, gUnidImob: [] },
        bensMoveis: [],
      },
    },
  };
}
