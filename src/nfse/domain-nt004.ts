import type {
  Emitente,
  Endereco,
  EnderObraEvento,
  IdentificadorPessoa,
  InfoPrestador,
  InfoRefNFSe,
  InfoTributacao,
  RtcDocumentoReferenciado,
  RtcInfoDest,
  RtcInfoTributosDif,
  RtcInfoTributosTribRegular,
  RtcListaDocFornec,
  RtcTotalCbs,
  RtcTotalIbs,
  RtcTotalTribCompraGov,
  RtcTotalTribRegular,
  RtcValoresIbsCbsFed,
  RtcValoresIbsCbsMun,
  RtcValoresIbsCbsUF,
  Serv,
  Signature,
  Substituicao,
  VDescCondIncond,
  VServPrest,
} from './domain.js';
import type {
  AmbienteGerador,
  FinalidadeNFSe,
  IndicadorDestinatario,
  IndicadorFinal,
  MotivoEmissaoTomadorIntermediario,
  ProcessoEmissao,
  SituacaoNfse,
  TipoAmbienteDps,
  TipoBeneficioMunicipal,
  TipoDedRedNt004,
  TipoEmissao,
  TipoEmitenteDps,
  TipoEnteGovernamental,
  TipoOperacao,
  TipoReembolsoRepasseNt004,
} from './enums.js';

export interface InfoPessoaNt004 {
  readonly identificador: IdentificadorPessoa;
  readonly CAEPF?: string;
  readonly IM?: string;
  readonly xNome: string;
  readonly end?: Endereco;
  readonly fone?: string;
  readonly email?: string;
}

export interface DocOutNFSeNt004 {
  readonly cMunNFSeMun: string;
  readonly nNFSeMun: string;
  readonly cVerifNFSeMun: string;
}

export interface DocNFNFSNt004 {
  readonly nNFS: string;
  readonly modNFS: string;
  readonly serieNFS: string;
}

export type ReferenciaDocDedRedNt004 =
  | { readonly chNFSe: string }
  | { readonly chNFe: string }
  | { readonly NFSeMun: DocOutNFSeNt004 }
  | { readonly NFNFS: DocNFNFSNt004 }
  | { readonly nDocFisc: string }
  | { readonly nDoc: string };

export interface DocDedRedNt004 {
  readonly referencia: ReferenciaDocDedRedNt004;
  readonly tpDedRed: TipoDedRedNt004;
  readonly xDescOutDed?: string;
  readonly dtEmiDoc: Date;
  readonly vDedutivelRedutivel: number;
  readonly vDeducaoReducao: number;
  readonly fornec?: InfoPessoaNt004;
}

export interface ListaDocDedRedNt004 {
  readonly docDedRed: readonly DocDedRedNt004[];
}

export type InfoDedRedNt004 =
  | { readonly pDR: number }
  | { readonly vDR: number }
  | { readonly documentos: ListaDocDedRedNt004 };

export interface InfoValoresNt004 {
  readonly vServPrest: VServPrest;
  readonly vDescCondIncond?: VDescCondIncond;
  readonly vDedRed?: InfoDedRedNt004;
  readonly trib: InfoTributacao;
}

export interface RtcValoresIbsCbsNt004 {
  readonly vBC: number;
  readonly vCalcReeRepRes?: number;
  readonly uf: RtcValoresIbsCbsUF;
  readonly mun: RtcValoresIbsCbsMun;
  readonly fed: RtcValoresIbsCbsFed;
}

export interface RtcTotalCIbsNt004 {
  readonly vTotNF: number;
  readonly gIBS: RtcTotalIbs;
  readonly gCBS: RtcTotalCbs;
  readonly gTribRegular?: RtcTotalTribRegular;
  readonly gTribCompraGov?: RtcTotalTribCompraGov;
}

export interface RtcIbsCbsNt004 {
  readonly cLocalidadeIncid: string;
  readonly xLocalidadeIncid: string;
  /** `minOccurs="0"` — só preenchido em compra governamental. */
  readonly pRedutor?: number;
  readonly valores: RtcValoresIbsCbsNt004;
  readonly totCIBS: RtcTotalCIbsNt004;
}

export type ImovelIdentificacaoNt004 =
  | { readonly cCIB: string }
  | { readonly end: EnderObraEvento };

export interface RtcInfoImovelNt004 {
  readonly inscImobFisc?: string;
  readonly identificacao: ImovelIdentificacaoNt004;
}

export interface RtcListaDocNt004 {
  readonly documento: RtcDocumentoReferenciado;
  readonly fornec?: RtcListaDocFornec;
  readonly dtEmiDoc: Date;
  readonly dtCompDoc: Date;
  readonly tpReeRepRes: TipoReembolsoRepasseNt004;
  readonly xTpReeRepRes?: string;
  readonly vlrReeRepRes: number;
}

export interface RtcInfoReeRepResNt004 {
  readonly documentos: readonly RtcListaDocNt004[];
}

export interface RtcInfoTributosSitClasNt004 {
  /**
   * CST do IBS/CBS (3 dígitos, `TSRTCCodSitTrib` pattern `[0-9]{3}`).
   *
   * **NÃO é o mesmo CST do enum `CST` exportado** — aquele é de PIS/COFINS
   * (`TSTipoCST`, valores `'00'`-`'09'`). O CST da Reforma Tributária tem
   * um valuespace próprio (3 dígitos) que evolui via Nota Técnica; por isso
   * fica como `string` em vez de enum.
   */
  readonly CST: string;
  /** Código de classificação tributária do IBS/CBS (6 dígitos, `TSRTCCodClassTrib`). */
  readonly cClassTrib: string;
  /** Código de crédito presumido (2 dígitos, `TSRTCCodCredPres`), quando aplicável. */
  readonly cCredPres?: string;
  readonly gTribRegular?: RtcInfoTributosTribRegular;
  readonly gDif?: RtcInfoTributosDif;
}

export interface RtcInfoTributosIbsCbsNt004 {
  readonly gIBSCBS: RtcInfoTributosSitClasNt004;
}

export interface RtcInfoValoresIbsCbsNt004 {
  readonly gReeRepRes?: RtcInfoReeRepResNt004;
  readonly trib: RtcInfoTributosIbsCbsNt004;
}

export interface RtcInfoIbsCbsNt004 {
  readonly finNFSe: FinalidadeNFSe;
  /** `minOccurs="0"` no XSD — não force o preenchimento. */
  readonly indFinal?: IndicadorFinal;
  readonly cIndOp: string;
  readonly tpOper?: TipoOperacao;
  readonly gRefNFSe?: InfoRefNFSe;
  readonly tpEnteGov?: TipoEnteGovernamental;
  readonly indDest: IndicadorDestinatario;
  readonly dest?: RtcInfoDest;
  readonly imovel?: RtcInfoImovelNt004;
  readonly valores: RtcInfoValoresIbsCbsNt004;
}

export interface InfDPSNt004 {
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
  readonly toma?: InfoPessoaNt004;
  readonly interm?: InfoPessoaNt004;
  readonly serv: Serv;
  readonly valores: InfoValoresNt004;
  readonly IBSCBS?: RtcInfoIbsCbsNt004;
}

export interface DpsNt004 {
  /** Campo sintético da lib (não existe no XML): identifica o layout do documento. */
  readonly layout: 'nt004';
  readonly versao: string;
  readonly infDPS: InfDPSNt004;
  readonly signature?: Signature;
}

export interface ValoresNFSeNt004 {
  readonly vCalcDR?: number;
  readonly tpBM?: TipoBeneficioMunicipal;
  readonly vCalcBM?: number;
  readonly vBC?: number;
  readonly pAliqAplic?: number;
  readonly vISSQN?: number;
  readonly vTotalRet?: number;
  readonly vLiq: number;
}

export interface InfNFSeNt004 {
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
  readonly cStat: SituacaoNfse;
  readonly dhProc: Date;
  readonly nDFSe: string;
  readonly emit: Emitente;
  readonly valores: ValoresNFSeNt004;
  /** `TCInfNFSe/xOutInf` (`minOccurs="0"`) — uso da Adm. Tributária Municipal. */
  readonly xOutInf?: string;
  readonly IBSCBS?: RtcIbsCbsNt004;
  readonly DPS: DpsNt004;
}

export interface NfseNt004 {
  /** Campo sintético da lib (não existe no XML): identifica o layout do documento. */
  readonly layout: 'nt004';
  readonly versao: string;
  readonly infNFSe: InfNFSeNt004;
  readonly signature: Signature;
}
