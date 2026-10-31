import type { DpsNt004, NfseNt004 } from './domain-nt004.js';
import type {
  CodigoNaoNif,
  CST,
  EnvioMDIC,
  IndicadorTotalTributos,
  JustificativaSubstituicao,
  MecanismoApoioComExPrestador,
  MecanismoApoioComExTomador,
  ModoPrestacao,
  MovimentacaoTemporariaBens,
  OpcaoSimplesNacional,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoChaveDFe,
  TipoExigSuspensa,
  TipoImunidadeISSQN,
  TipoRetISSQN,
  TipoRetPisCofins,
  TipoTribISSQN,
  UF,
  VinculoPrestacao,
} from './enums.js';
import type { Layout } from './layout.js';

export type * from './domain-nt004.js';

export type IdentificadorPessoa =
  | { readonly CNPJ: string }
  | { readonly CPF: string }
  | { readonly NIF: string }
  | { readonly cNaoNIF: CodigoNaoNif };

/**
 * Identificação do emitente do documento. `TCEmitente` restringe a escolha a
 * `CNPJ` ou `CPF` apenas — diferente de {@link IdentificadorPessoa}, que também
 * admite `NIF`/`cNaoNIF` para prestador/tomador/intermediário.
 */
export type IdentificadorEmitente = { readonly CNPJ: string } | { readonly CPF: string };

export interface EnderecoNacional {
  readonly cMun: string;
  readonly CEP: string;
}

export interface EnderecoExterior {
  readonly cPais: string;
  readonly cEndPost: string;
  readonly xCidade: string;
  readonly xEstProvReg: string;
}

export type EnderecoLocalidade =
  | { readonly endNac: EnderecoNacional }
  | { readonly endExt: EnderecoExterior };

export interface Endereco {
  readonly localidade: EnderecoLocalidade;
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
}

export interface EnderecoEmitente {
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
  readonly cMun: string;
  readonly UF: UF;
  readonly CEP: string;
}

export interface Emitente {
  readonly identificador: IdentificadorEmitente;
  readonly IM?: string;
  readonly xNome: string;
  readonly xFant?: string;
  readonly enderNac: EnderecoEmitente;
  readonly fone?: string;
  readonly email?: string;
}

export interface RegTrib {
  readonly opSimpNac: OpcaoSimplesNacional;
  readonly regApTribSN?: RegimeApuracaoSimplesNacional;
  readonly regEspTrib: RegimeEspecialTributacao;
}

export interface InfoPrestador {
  readonly identificador: IdentificadorPessoa;
  readonly CAEPF?: string;
  readonly IM?: string;
  readonly xNome?: string;
  readonly end?: Endereco;
  readonly fone?: string;
  readonly email?: string;
  readonly regTrib: RegTrib;
}

export type LocPrest = { readonly cLocPrestacao: string } | { readonly cPaisPrestacao: string };

export interface CServ {
  readonly cTribNac: string;
  readonly cTribMun?: string;
  readonly xDescServ: string;
  readonly cNBS?: string;
  readonly cIntContrib?: string;
}

export interface EnderecoExteriorSimples {
  readonly cEndPost: string;
  readonly xCidade: string;
  readonly xEstProvReg: string;
}

export type EnderecoSimplesLocalidade =
  | { readonly CEP: string }
  | { readonly endExt: EnderecoExteriorSimples };

export type EnderecoSimples = EnderecoSimplesLocalidade & {
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
};

export type EnderObraEventoLocalidade =
  | { readonly CEP: string }
  | { readonly endExt: EnderecoExteriorSimples };

export type EnderObraEvento = EnderObraEventoLocalidade & {
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
};

export interface ComExterior {
  readonly mdPrestacao: ModoPrestacao;
  readonly vincPrest: VinculoPrestacao;
  readonly tpMoeda: string;
  readonly vServMoeda: number;
  readonly mecAFComexP: MecanismoApoioComExPrestador;
  readonly mecAFComexT: MecanismoApoioComExTomador;
  readonly movTempBens: MovimentacaoTemporariaBens;
  readonly nDI?: string;
  readonly nRE?: string;
  readonly mdic: EnvioMDIC;
}

export type AtvEventoIdentificacao =
  | { readonly idAtvEvt: string }
  | { readonly end: EnderecoSimples };

export interface AtvEvento {
  readonly xNome: string;
  readonly dtIni: Date;
  readonly dtFim: Date;
  readonly identificacao: AtvEventoIdentificacao;
}

export type InfoObraIdentificacao =
  | { readonly cObra: string }
  | { readonly cCIB: string }
  | { readonly end: EnderObraEvento };

export interface InfoObra {
  readonly inscImobFisc?: string;
  readonly identificacao: InfoObraIdentificacao;
}

export interface InfoItemPed {
  readonly xItemPed: readonly string[];
}

export interface InfoCompl {
  readonly idDocTec?: string;
  readonly docRef?: string;
  readonly xPed?: string;
  readonly gItemPed?: InfoItemPed;
  readonly xInfComp?: string;
}

export interface Serv {
  readonly locPrest: LocPrest;
  readonly cServ: CServ;
  readonly comExt?: ComExterior;
  readonly obra?: InfoObra;
  readonly atvEvento?: AtvEvento;
  readonly infoCompl?: InfoCompl;
}

export interface VServPrest {
  readonly vReceb?: number;
  readonly vServ: number;
}

export interface VDescCondIncond {
  readonly vDescIncond?: number;
  readonly vDescCond?: number;
}

export interface ExigSuspensa {
  readonly tpSusp: TipoExigSuspensa;
  readonly nProcesso: string;
}

export type BeneficioMunicipal =
  | { readonly nBM: string; readonly vRedBCBM: number }
  | { readonly nBM: string; readonly pRedBCBM: number }
  | { readonly nBM: string };

export interface TribMunicipal {
  readonly tribISSQN: TipoTribISSQN;
  readonly cPaisResult?: string;
  readonly tpImunidade?: TipoImunidadeISSQN;
  readonly exigSusp?: ExigSuspensa;
  readonly BM?: BeneficioMunicipal;
  readonly tpRetISSQN: TipoRetISSQN;
  readonly pAliq?: number;
}

export interface TribOutrosPisCofins {
  readonly CST: CST;
  readonly vBCPisCofins?: number;
  readonly pAliqPis?: number;
  readonly pAliqCofins?: number;
  readonly vPis?: number;
  readonly vCofins?: number;
  readonly tpRetPisCofins?: TipoRetPisCofins;
}

export interface TribFederal {
  readonly piscofins?: TribOutrosPisCofins;
  readonly vRetCP?: number;
  readonly vRetIRRF?: number;
  readonly vRetCSLL?: number;
}

export interface TribTotalMonet {
  readonly vTotTribFed: number;
  readonly vTotTribEst: number;
  readonly vTotTribMun: number;
}

export interface TribTotalPercent {
  readonly pTotTribFed: number;
  readonly pTotTribEst: number;
  readonly pTotTribMun: number;
}

export type TribTotal =
  | { readonly vTotTrib: TribTotalMonet }
  | { readonly pTotTrib: TribTotalPercent }
  | { readonly indTotTrib: IndicadorTotalTributos }
  | { readonly pTotTribSN: number };

export interface InfoTributacao {
  readonly tribMun: TribMunicipal;
  readonly tribFed?: TribFederal;
  readonly totTrib: TribTotal;
}

export interface RtcValoresIbsCbsUF {
  readonly pIBSUF: number;
  readonly pRedAliqUF?: number;
  readonly pAliqEfetUF: number;
}

export interface RtcValoresIbsCbsMun {
  readonly pIBSMun: number;
  readonly pRedAliqMun?: number;
  readonly pAliqEfetMun: number;
}

export interface RtcValoresIbsCbsFed {
  readonly pCBS: number;
  readonly pRedAliqCBS?: number;
  readonly pAliqEfetCBS: number;
}

export interface RtcTotalIbsCredPres {
  readonly pCredPresIBS: number;
  readonly vCredPresIBS: number;
}

export interface RtcTotalIbsUF {
  /** `minOccurs="0"` — só presente quando há diferimento estadual. */
  readonly vDifUF?: number;
  readonly vIBSUF: number;
}

export interface RtcTotalIbsMun {
  /** `minOccurs="0"` — só presente quando há diferimento municipal. */
  readonly vDifMun?: number;
  readonly vIBSMun: number;
}

export interface RtcTotalIbs {
  readonly vIBSTot: number;
  readonly gIBSCredPres?: RtcTotalIbsCredPres;
  readonly gIBSUFTot: RtcTotalIbsUF;
  readonly gIBSMunTot: RtcTotalIbsMun;
}

export interface RtcTotalCbsCredPres {
  readonly pCredPresCBS: number;
  readonly vCredPresCBS: number;
}

export interface RtcTotalCbs {
  readonly gCBSCredPres?: RtcTotalCbsCredPres;
  /** `minOccurs="0"` — só presente quando há diferimento da CBS. */
  readonly vDifCBS?: number;
  readonly vCBS: number;
}

export interface RtcTotalTribRegular {
  readonly pAliqEfeRegIBSUF: number;
  readonly vTribRegIBSUF: number;
  readonly pAliqEfeRegIBSMun: number;
  readonly vTribRegIBSMun: number;
  readonly pAliqEfeRegCBS: number;
  readonly vTribRegCBS: number;
}

export interface RtcTotalTribCompraGov {
  readonly pIBSUF: number;
  readonly vIBSUF: number;
  readonly pIBSMun: number;
  readonly vIBSMun: number;
  readonly pCBS: number;
  readonly vCBS: number;
}

export interface Substituicao {
  readonly chSubstda: string;
  readonly cMotivo: JustificativaSubstituicao;
  readonly xMotivo?: string;
}

export interface InfoRefNFSe {
  readonly refNFSe: readonly string[];
}

export interface RtcInfoDest {
  readonly identificador: IdentificadorPessoa;
  readonly xNome: string;
  readonly end?: Endereco;
  readonly fone?: string;
  readonly email?: string;
}

export interface RtcListaDocDFe {
  readonly tipoChaveDFe: TipoChaveDFe;
  readonly xTipoChaveDFe?: string;
  readonly chaveDFe: string;
}

export interface RtcListaDocFiscalOutro {
  readonly cMunDocFiscal: string;
  readonly nDocFiscal: string;
  readonly xDocFiscal: string;
}

export interface RtcListaDocOutro {
  readonly nDoc: string;
  readonly xDoc: string;
}

export type RtcDocumentoReferenciado =
  | { readonly dFeNacional: RtcListaDocDFe }
  | { readonly docFiscalOutro: RtcListaDocFiscalOutro }
  | { readonly docOutro: RtcListaDocOutro };

export interface RtcListaDocFornec {
  readonly identificador: IdentificadorPessoa;
  readonly xNome: string;
}

export interface RtcInfoTributosTribRegular {
  /**
   * CST do IBS/CBS para tributação regular (3 dígitos). Valores definidos pela
   * Reforma Tributária — distinto do `CST` PIS/COFINS do enum homônimo. O
   * XSD valida contra o pattern `[0-9]{3}`; os valores semânticos específicos
   * estão no Manual do Contribuinte e evoluem a cada NT.
   */
  readonly CSTReg: string;
  /** Código de classificação tributária (6 dígitos) — `TSRTCCodClassTrib`. */
  readonly cClassTribReg: string;
}

export interface RtcInfoTributosDif {
  readonly pDifUF: number;
  readonly pDifMun: number;
  readonly pDifCBS: number;
}

export interface Signature {
  readonly signatureValue: string;
  readonly digestValue: string;
  readonly x509Certificate: string;
  readonly referenceUri: string;
}

/** Union dos layouts de DPS suportados (alargada na Task 3). */
export type DPS = DpsNt004;

/** Union dos layouts de NFS-e suportados (alargada na Task 3). */
export type NFSe = NfseNt004;

export type DpsFor<L extends Layout> = Extract<DPS, { readonly layout: L }>;

export type NfseFor<L extends Layout> = Extract<NFSe, { readonly layout: L }>;
