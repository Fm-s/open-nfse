// Fixtures DTO compartilhadas do layout nt009 (fora do dist — ver tsconfig.build.json).
// Os códigos (CST, cClassTrib, cNBS, cIndOp…) só precisam casar com os patterns
// do XSD `schemas/1.01-nt009/`; não representam um cenário fiscal real aceito
// pelas regras de negócio do Sistema Nacional.
import type { DpsNt009, InfDPSNt009 } from '../domain.js';
import {
  FinalidadeNFSe,
  IndicadorDestinatario,
  IndicadorTotalTributos,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAjusteBC,
  TipoAjusteBCLocImoveis,
  TipoAmbienteDps,
  TipoChaveDFe,
  TipoEmitenteDps,
  TipoRetISSQN,
  TipoTribISSQN,
} from '../enums.js';

function infDPSNt009Completa(): InfDPSNt009 {
  return {
    Id: 'DPS211130010057475300010000001000000000000001',
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
        cTribNac: '250101',
        xDescServ: 'Locação de imóvel',
        cNBS: '123456789',
        cIntContrib: 'INT001',
      },
    },
    valores: {
      vServPrest: { vServ: 1000 },
      vAjusteBC: {
        ajusteIssqn: { pAjusteBCISSQN: 10 },
        documentos: {
          docAjusteBC: [
            {
              tpAjusteBC: TipoAjusteBC.Materiais,
              vTotDoc: 200,
              vAjusteAplic: 100.5,
              dtEmiDoc: new Date('2026-11-20T12:00:00Z'),
              documento: {
                dFeNacional: {
                  tipoChaveDFe: TipoChaveDFe.Nfse,
                  chaveDFe: '21113002200574753000100000000000146726037032711025',
                },
              },
              fornec: {
                identificador: { CNPJ: '11222333000181' },
                xNome: 'Fornecedor de Teste',
              },
            },
            {
              tpAjusteBC: TipoAjusteBC.OutrosReembolsos,
              xTpAjusteBC: 'Reembolso de despesas',
              vTotDoc: 50,
              vAjusteAplic: 50,
              dtCompDoc: new Date('2026-11-25T12:00:00Z'),
              documento: { docOutro: { nDoc: 'REC-42', xDoc: 'Recibo' } },
            },
          ],
        },
      },
      trib: {
        tribMun: {
          tribISSQN: TipoTribISSQN.OperacaoTributavel,
          tpRetISSQN: TipoRetISSQN.NaoRetido,
          pAliq: 2,
        },
        totTrib: { indTotTrib: IndicadorTotalTributos.Nao },
      },
    },
    IBSCBS: {
      cIndOp: '100301',
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
                tpAjusteBCLocImoveis: TipoAjusteBCLocImoveis.Condominio,
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
