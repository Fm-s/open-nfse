// Fixture DTO "máxima" do layout nt009 (fora do dist — ver tsconfig.build.json):
// preenche todo elemento opcional dos tipos que o nt009 serializa com walkers
// próprios (TCInfDPS, TCInfoPessoa, TCCServ, TCInfoValores, TCInfoAjusteBC,
// TCRTCInfoIBSCBS, TCRTCLocacaoImovel, TCRTCUnidadesImobiliarias,
// TCRTCValoresBCImoveis, TCRTCInfoTribIBSCBS/gIBSCBS). Como quase todos são
// `minOccurs="0"`, um campo descartado pelo serializer ou pelo parser ainda
// passaria no XSD — os testes comparam `parse(build(x))` com `x` no nível do DTO.
//
// Válida contra `schemas/1.01-nt009/` e contra os guards fechados do nt009
// (E0031: tpEmit 2 só com cMotivoEmisTI 1; E0034: sem chNFSeRej). Não representa
// um cenário fiscal real aceito pelas demais regras de negócio do Sistema Nacional.
import type { DpsNt009 } from '../domain.js';
import {
  FinalidadeNFSe,
  IndicadorDestinatario,
  IndicadorFinal,
  IndicadorTotalTributos,
  JustificativaSubstituicao,
  MotivoEmissaoTomadorIntermediario,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAjusteBC,
  TipoAjusteBCLocImoveis,
  TipoAmbienteDps,
  TipoChaveDFe,
  TipoEmitenteDps,
  TipoEnteGovernamental,
  TipoOperacao,
  TipoRetISSQN,
  TipoTribISSQN,
} from '../enums.js';

const CHAVE_A = '21113002200574753000100000000000146726037032711025';
const CHAVE_B = '21113002200574753000100000000000146726037032711026';

export function dpsNt009Max(): DpsNt009 {
  return {
    layout: 'nt009',
    versao: '1.01',
    infDPS: {
      Id: 'DPS211130010057475300010000001000000000000002',
      tpAmb: TipoAmbienteDps.Homologacao,
      dhEmi: new Date('2026-12-01T14:30:00Z'),
      verAplic: 'test-1.0.0',
      serie: '1',
      nDPS: '2',
      dCompet: new Date('2026-12-01T03:00:00Z'),
      tpEmit: TipoEmitenteDps.Tomador,
      cMotivoEmisTI: MotivoEmissaoTomadorIntermediario.ImportacaoServico,
      finNFSe: FinalidadeNFSe.Regular,
      cLocEmi: '2111300',
      subst: {
        chSubstda: CHAVE_B,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Correção de dados da operação',
      },
      prest: {
        identificador: { CNPJ: '00574753000100' },
        IM: '6123007',
        xNome: 'Prestador de Teste',
        fone: '9832221111',
        email: 'prestador@example.com',
        regTrib: {
          opSimpNac: OpcaoSimplesNacional.NaoOptante,
          regEspTrib: RegimeEspecialTributacao.Nenhum,
        },
      },
      toma: {
        identificador: { CNPJ: '11222333000181' },
        CAEPF: '12345678901234',
        IM: '998877',
        xNome: 'Tomador de Teste',
        end: {
          localidade: { endNac: { cMun: '2111300', CEP: '65000000' } },
          xLgr: 'Rua A',
          nro: '10',
          xCpl: 'Sala 2',
          xBairro: 'Centro',
        },
        fone: '9833334444',
        email: 'tomador@example.com',
      },
      interm: {
        identificador: { CPF: '12345678909' },
        CAEPF: '43210987654321',
        IM: '554433',
        xNome: 'Intermediário de Teste',
        end: {
          localidade: { endNac: { cMun: '2111300', CEP: '65010000' } },
          xLgr: 'Rua B',
          nro: '20',
          xBairro: 'Renascença',
        },
        fone: '9835556666',
        email: 'interm@example.com',
      },
      serv: {
        locPrest: { cLocPrestacao: '2111300' },
        cServ: {
          cTribNac: '250101',
          cTribMun: '001',
          xDescServ: 'Locação de imóvel',
          cNBS: '123456789',
          cIntContrib: 'INT001',
        },
      },
      valores: {
        vServPrest: { vReceb: 900, vServ: 1000 },
        vDescCondIncond: { vDescIncond: 10, vDescCond: 5 },
        vAjusteBC: {
          ajusteIssqn: { vAjusteBCISSQN: 30 },
          documentos: {
            docAjusteBC: [
              {
                tpAjusteBC: TipoAjusteBC.OutrasDeducoesIssqn,
                xTpAjusteBC: 'Outras deduções',
                vTotDoc: 200,
                vAjusteAplic: 30,
                dtEmiDoc: new Date('2026-11-20T03:00:00Z'),
                dtCompDoc: new Date('2026-11-21T03:00:00Z'),
                documento: {
                  dFeNacional: {
                    tipoChaveDFe: TipoChaveDFe.Nfse,
                    xTipoChaveDFe: 'NFS-e nacional',
                    chaveDFe: CHAVE_A,
                  },
                },
                fornec: {
                  identificador: { CNPJ: '11222333000181' },
                  CAEPF: '12345678901234',
                  IM: '112233',
                  xNome: 'Fornecedor de Teste',
                  fone: '9837778888',
                  email: 'fornec@example.com',
                },
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
        indFinal: IndicadorFinal.Sim,
        cIndOp: '100301',
        tpOper: TipoOperacao.FornecimentoComPagamentoPosterior,
        gRefNFSe: { refNFSe: [CHAVE_A, CHAVE_B] },
        tpEnteGov: TipoEnteGovernamental.Municipio,
        indDest: IndicadorDestinatario.DestinatarioDistinto,
        dest: {
          identificador: { CPF: '98765432100' },
          xNome: 'Destinatário de Teste',
          end: {
            localidade: { endNac: { cMun: '2111300', CEP: '65020000' } },
            xLgr: 'Rua C',
            nro: '30',
            xBairro: 'Cohama',
          },
          fone: '9839990000',
          email: 'dest@example.com',
        },
        imovel: {
          cMun: '2111300',
          gLocacao: {
            pCopropriedade: 50,
            vTotOper: 1000,
            vDescIncondTot: 10,
            vDescCondTot: 5,
            dVencOrig: new Date('2026-12-10T03:00:00Z'),
          },
          gUnidImob: [
            {
              inscImobFisc: 'IMOB-1',
              identificacao: { cCIB: 'ABC12345' },
              gAjusteBCLocImoveis: [
                {
                  tpAjusteBCLocImoveis: TipoAjusteBCLocImoveis.Outras,
                  xTpAjusteBCLocImoveis: 'Fundo de reserva',
                  vAjusteBCLocImoveis: 40,
                },
                {
                  tpAjusteBCLocImoveis: TipoAjusteBCLocImoveis.Condominio,
                  vAjusteBCLocImoveis: 150,
                },
              ],
            },
          ],
        },
        bensMoveis: [
          { cNCMBemMovel: '94036000', xNCMBemMovel: 'Móveis de madeira', qtdNCMBemMovel: '3' },
        ],
        valores: {
          trib: {
            CST: '000',
            cClassTrib: '000001',
            gIBSCBS: {
              cCredPres: '01',
              gTribRegular: { CSTReg: '000', cClassTribReg: '000001' },
              gDif: { pDifUF: 10, pDifMun: 20, pDifCBS: 30 },
            },
          },
        },
      },
    },
  };
}
