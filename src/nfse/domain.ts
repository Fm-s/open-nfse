import type {
  AmbienteGerador,
  CST,
  CodigoNaoNif,
  EnvioMDIC,
  FinalidadeNFSe,
  IndicadorFinal,
  IndicadorTotalTributos,
  JustificativaSubstituicao,
  ModoPrestacao,
  MotivoEmissaoTomadorIntermediario,
  MovimentacaoTemporariaBens,
  ObjetoLocacao,
  OpcaoSimplesNacional,
  ProcessoEmissao,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAmbienteDps,
  TipoBeneficioMunicipal,
  TipoDedRed,
  TipoEmissao,
  TipoEmitenteDps,
  TipoExigSuspensa,
  TipoImunidadeISSQN,
  TipoOperacao,
  TipoRetISSQN,
  TipoRetPisCofins,
  TipoTribISSQN,
  UF,
  VinculoPrestacao,
} from './enums.js';

export type IdentificadorPessoa =
  | { readonly CNPJ: string }
  | { readonly CPF: string }
  | { readonly NIF: string }
  | { readonly cNaoNIF: CodigoNaoNif };

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
  readonly identificador: IdentificadorPessoa;
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

export interface InfoPessoa {
  readonly identificador: IdentificadorPessoa;
  readonly CAEPF?: string;
  readonly IM?: string;
  readonly xNome: string;
  readonly end?: Endereco;
  readonly fone?: string;
  readonly email?: string;
}

export type LocPrest = { readonly cLocPrestacao: string } | { readonly cPaisPrestacao: string };

export interface CServ {
  readonly cTribNac: string;
  readonly cTribMun?: string;
  readonly xDescServ: string;
  readonly cNBS?: string;
  readonly cIntContrib?: string;
}

export interface EnderecoSimples {
  readonly CEP?: string;
  readonly endExt?: EnderecoExterior;
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
}

export interface EnderObraEvento {
  readonly CEP?: string;
  readonly endExt?: EnderecoExterior;
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro: string;
}

export interface ComExterior {
  readonly mdPrestacao: ModoPrestacao;
  readonly vincPrest: VinculoPrestacao;
  readonly tpMoeda: string;
  readonly vServMoeda: number;
  readonly mecAFComexP: string;
  readonly mecAFComexT: string;
  readonly movTempBens: MovimentacaoTemporariaBens;
  readonly nDI?: string;
  readonly nRE?: string;
  readonly mdic: EnvioMDIC;
}

export interface ExploracaoRodoviaria {
  readonly categVeic: string;
  readonly nEixos: string;
  readonly rodagem: string;
  readonly sentido: string;
  readonly placa: string;
  readonly codAcessoPed: string;
  readonly codContrato: string;
}

export interface LocacaoSublocacao {
  readonly categ: string;
  readonly objeto: ObjetoLocacao;
  readonly extensao: string;
  readonly nPostes: string;
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
  readonly lsadppu?: LocacaoSublocacao;
  readonly obra?: InfoObra;
  readonly atvEvento?: AtvEvento;
  readonly explRod?: ExploracaoRodoviaria;
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

export interface BeneficioMunicipal {
  readonly nBM: string;
  readonly vRedBCBM?: number;
  readonly pRedBCBM?: number;
}

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

export interface DocOutNFSe {
  readonly cMunNFSeMun: string;
  readonly nNFSeMun: string;
  readonly cVerifNFSeMun: string;
}

export interface DocNFNFS {
  readonly nNFS: string;
  readonly modNFS: string;
  readonly serieNFS: string;
}

export type ReferenciaDocDedRed =
  | { readonly chNFSe: string }
  | { readonly chNFe: string }
  | { readonly NFSeMun: DocOutNFSe }
  | { readonly NFNFS: DocNFNFS }
  | { readonly nDocFisc: string }
  | { readonly nDoc: string };

export interface DocDedRed {
  readonly referencia: ReferenciaDocDedRed;
  readonly tpDedRed: TipoDedRed;
  readonly xDescOutDed?: string;
  readonly dtEmiDoc: Date;
  readonly vDedutivelRedutivel: number;
  readonly vDeducaoReducao: number;
  readonly fornec?: InfoPessoa;
}

export interface ListaDocDedRed {
  readonly docDedRed: readonly DocDedRed[];
}

export type InfoDedRed =
  | { readonly pDR: number }
  | { readonly vDR: number }
  | { readonly documentos: ListaDocDedRed };

export interface InfoTributacao {
  readonly tribMun: TribMunicipal;
  readonly tribFed?: TribFederal;
  readonly totTrib: TribTotal;
}

export interface InfoValores {
  readonly vServPrest: VServPrest;
  readonly vDescCondIncond?: VDescCondIncond;
  readonly vDedRed?: InfoDedRed;
  readonly trib: InfoTributacao;
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

export interface RtcValoresIbsCbs {
  readonly vBC: number;
  readonly vCalcReeRepRes?: number;
  readonly uf: RtcValoresIbsCbsUF;
  readonly mun: RtcValoresIbsCbsMun;
  readonly fed: RtcValoresIbsCbsFed;
}

export interface RtcTotalIbsCredPres {
  readonly pCredPresIBS: number;
  readonly vCredPresIBS: number;
}

export interface RtcTotalIbsUF {
  readonly vDifUF: number;
  readonly vIBSUF: number;
}

export interface RtcTotalIbsMun {
  readonly vDifMun: number;
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
  readonly vDifCBS: number;
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

export interface RtcTotalCIbs {
  readonly vTotNF: number;
  readonly gIBS: RtcTotalIbs;
  readonly gCBS: RtcTotalCbs;
  readonly gTribRegular?: RtcTotalTribRegular;
  readonly gTribCompraGov?: RtcTotalTribCompraGov;
}

export interface RtcIbsCbs {
  readonly cLocalidadeIncid: string;
  readonly xLocalidadeIncid: string;
  readonly pRedutor: number;
  readonly valores: RtcValoresIbsCbs;
  readonly totCIBS: RtcTotalCIbs;
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

export type ImovelIdentificacao = { readonly cCIB: string } | { readonly end: EnderObraEvento };

export interface RtcInfoImovel {
  readonly inscImobFisc?: string;
  readonly identificacao: ImovelIdentificacao;
}

export interface RtcListaDocDFe {
  readonly tipoChaveDFe: string;
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

export interface RtcListaDoc {
  readonly documento: RtcDocumentoReferenciado;
  readonly fornec?: RtcListaDocFornec;
  readonly dtEmiDoc: Date;
  readonly dtCompDoc: Date;
  readonly tpReeRepRes: string;
  readonly xTpReeRepRes?: string;
  readonly vlrReeRepRes: number;
}

export interface RtcInfoReeRepRes {
  readonly documentos: readonly RtcListaDoc[];
}

export interface RtcInfoTributosTribRegular {
  readonly CSTReg: string;
  readonly cClassTribReg: string;
}

export interface RtcInfoTributosDif {
  readonly pDifUF: number;
  readonly pDifMun: number;
  readonly pDifCBS: number;
}

export interface RtcInfoTributosSitClas {
  readonly CST: string;
  readonly cClassTrib: string;
  readonly cCredPres?: string;
  readonly gTribRegular?: RtcInfoTributosTribRegular;
  readonly gDif?: RtcInfoTributosDif;
}

export interface RtcInfoTributosIbsCbs {
  readonly gIBSCBS: RtcInfoTributosSitClas;
}

export interface RtcInfoValoresIbsCbs {
  readonly gReeRepRes?: RtcInfoReeRepRes;
  readonly trib: RtcInfoTributosIbsCbs;
}

export interface RtcInfoIbsCbs {
  readonly finNFSe: FinalidadeNFSe;
  readonly indFinal: IndicadorFinal;
  readonly cIndOp: string;
  readonly tpOper?: TipoOperacao;
  readonly gRefNFSe?: InfoRefNFSe;
  readonly tpEnteGov?: string;
  readonly indDest: string;
  readonly dest?: RtcInfoDest;
  readonly imovel?: RtcInfoImovel;
  readonly valores: RtcInfoValoresIbsCbs;
}

export interface InfDPS {
  readonly Id: string;
  readonly tpAmb: TipoAmbienteDps;
  readonly dhEmi: Date;
  readonly verAplic: string;
  readonly serie: string;
  readonly nDPS: string;
  readonly dCompet: Date;
  readonly tpEmit: TipoEmitenteDps;
  readonly cMotivoEmisTI?: MotivoEmissaoTomadorIntermediario;
  readonly chNFSeRej?: string;
  readonly cLocEmi: string;
  readonly subst?: Substituicao;
  readonly prest: InfoPrestador;
  readonly toma?: InfoPessoa;
  readonly interm?: InfoPessoa;
  readonly serv: Serv;
  readonly valores: InfoValores;
  readonly IBSCBS?: RtcInfoIbsCbs;
}

export interface Signature {
  readonly signatureValue: string;
  readonly digestValue: string;
  readonly x509Certificate: string;
  readonly referenceUri: string;
}

export interface DPS {
  readonly versao: string;
  readonly infDPS: InfDPS;
  readonly signature?: Signature;
}

export interface ValoresNFSe {
  readonly vCalcDR?: number;
  readonly tpBM?: TipoBeneficioMunicipal;
  readonly vCalcBM?: number;
  readonly vBC?: number;
  readonly pAliqAplic?: number;
  readonly vISSQN?: number;
  readonly vTotalRet?: number;
  readonly vLiq: number;
  readonly xOutInf?: string;
}

export interface InfNFSe {
  readonly Id: string;
  readonly chaveAcesso: string;
  readonly xLocEmi: string;
  readonly xLocPrestacao: string;
  readonly nNFSe: string;
  readonly cLocIncid?: string;
  readonly xLocIncid?: string;
  readonly xTribNac: string;
  readonly xTribMun?: string;
  readonly xNBS?: string;
  readonly verAplic: string;
  readonly ambGer: AmbienteGerador;
  readonly tpEmis: TipoEmissao;
  readonly procEmi?: ProcessoEmissao;
  readonly cStat: string;
  readonly dhProc: Date;
  readonly nDFSe: string;
  readonly emit: Emitente;
  readonly valores: ValoresNFSe;
  readonly IBSCBS?: RtcIbsCbs;
  readonly DPS: DPS;
}

export interface NFSe {
  readonly versao: string;
  readonly infNFSe: InfNFSe;
  readonly signature: Signature;
}
