// Tipos exclusivos do layout nt009 (NT 009 release 1 — bundle XSD
// `schemas/1.01-nt009/`, `esquemas_prod_restrita_20261020.zip`). Os tipos
// idênticos nos dois layouts ficam sem sufixo em `domain.ts`.
import type {
  Emitente,
  Endereco,
  IdentificadorPessoa,
  InfoPrestador,
  InfoRefNFSe,
  InfoTributacao,
  RtcDocumentoReferenciado,
  RtcInfoDest,
  RtcInfoTributosDif,
  RtcInfoTributosTribRegular,
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
  TipoAjusteBC,
  TipoAjusteBCLocImoveis,
  TipoAmbienteDps,
  TipoBeneficioMunicipal,
  TipoEmissao,
  TipoEmitenteDps,
  TipoEnteGovernamental,
  TipoOperacao,
} from './enums.js';

/** `TCInfoPessoa` no nt009 — igual ao nt004, mas `xNome` passou a `minOccurs="0"`. */
export interface InfoPessoaNt009 {
  readonly identificador: IdentificadorPessoa;
  readonly CAEPF?: string;
  readonly IM?: string;
  readonly xNome?: string;
  readonly end?: Endereco;
  readonly fone?: string;
  readonly email?: string;
}

/** `xs:choice` opcional de `TCInfoAjusteBC`: percentual ou valor de ajuste da BC do ISSQN. */
export type AjusteBCIssqnNt009 =
  | { readonly pAjusteBCISSQN: number }
  | { readonly vAjusteBCISSQN: number };

/** `TCDocAjusteBC` — documento que fundamenta um ajuste da base de cálculo. */
export interface DocAjusteBCNt009 {
  readonly tpAjusteBC: TipoAjusteBC;
  readonly xTpAjusteBC?: string;
  readonly vTotDoc: number;
  readonly vAjusteAplic: number;
  readonly dtEmiDoc?: Date;
  readonly dtCompDoc?: Date;
  /** `xs:choice` `dFeNacional` | `docFiscalOutro` | `docOutro`. */
  readonly documento: RtcDocumentoReferenciado;
  readonly fornec?: InfoPessoaNt009;
}

/** `TCListaDocAjusteBC` — 1 a 1000 `docAjusteBC`. */
export interface ListaDocAjusteBCNt009 {
  readonly docAjusteBC: readonly DocAjusteBCNt009[];
}

/**
 * `TCInfoAjusteBC` (`valores/vAjusteBC`) — substitui `vDedRed` do nt004. O
 * percentual/valor (`ajusteIssqn`) e a lista de documentos não são mais
 * mutuamente exclusivos: ambos são opcionais e podem coexistir.
 */
export interface InfoAjusteBCNt009 {
  readonly ajusteIssqn?: AjusteBCIssqnNt009;
  readonly documentos?: ListaDocAjusteBCNt009;
}

export interface InfoValoresNt009 {
  readonly vServPrest: VServPrest;
  readonly vDescCondIncond?: VDescCondIncond;
  readonly vAjusteBC?: InfoAjusteBCNt009;
  readonly trib: InfoTributacao;
}

/** `TCRTCInfoBensMoveis` — bem móvel associado à operação (até 1000). */
export interface RtcInfoBensMoveisNt009 {
  /** NCM do bem (8 dígitos, `TSNCM`). */
  readonly cNCMBemMovel: string;
  readonly xNCMBemMovel: string;
  /** Quantidade (`TSNum3Dig`, 1 a 3 dígitos) — mantida como string, como os demais `TSNum*`. */
  readonly qtdNCMBemMovel: string;
}

/** `TCEnderImovel` — endereço nacional do imóvel (só CEP; `xBairro` opcional). */
export interface EnderImovelNt009 {
  readonly CEP: string;
  readonly xLgr: string;
  readonly nro: string;
  readonly xCpl?: string;
  readonly xBairro?: string;
}

/** `TCRTCValoresBCImoveis` — parcela não integrante da BC do IBS/CBS na locação de imóveis. */
export interface RtcValoresBCImoveisNt009 {
  readonly tpAjusteBCLocImoveis: TipoAjusteBCLocImoveis;
  readonly xTpAjusteBCLocImoveis?: string;
  readonly vAjusteBCLocImoveis: number;
}

/** `xs:choice` de `TCRTCUnidadesImobiliarias`: código CIB ou endereço. */
export type UnidadeImobiliariaIdentificacaoNt009 =
  | { readonly cCIB: string }
  | { readonly end: EnderImovelNt009 };

/** `TCRTCUnidadesImobiliarias` (`gUnidImob`). */
export interface RtcUnidadeImobiliariaNt009 {
  readonly inscImobFisc?: string;
  readonly identificacao: UnidadeImobiliariaIdentificacaoNt009;
  /** 0 a 1000 ocorrências; array vazio é omitido na serialização. */
  readonly gAjusteBCLocImoveis?: readonly RtcValoresBCImoveisNt009[];
}

/** `TCRTCLocacaoImovel` (`gLocacao`). */
export interface RtcLocacaoImovelNt009 {
  readonly pCopropriedade: number;
  readonly vTotOper: number;
  readonly vDescIncondTot?: number;
  readonly vDescCondTot?: number;
  readonly dVencOrig?: Date;
}

/** `TCRTCInfoImovel` no nt009 — reestruturado: município + locação + unidades imobiliárias. */
export interface RtcInfoImovelNt009 {
  readonly cMun: string;
  readonly gLocacao?: RtcLocacaoImovelNt009;
  /** 0 a 99 ocorrências; array vazio é omitido na serialização. */
  readonly gUnidImob?: readonly RtcUnidadeImobiliariaNt009[];
}

/**
 * `TCRTCInfoTributosSitClas` no nt009 — `CST`/`cClassTrib` subiram para
 * {@link RtcInfoTribIbsCbsNt009}; aqui ficam só os grupos complementares.
 */
export interface RtcInfoTributosSitClasNt009 {
  /** Código de crédito presumido (2 dígitos, `TSRTCCodCredPres`), quando aplicável. */
  readonly cCredPres?: string;
  readonly gTribRegular?: RtcInfoTributosTribRegular;
  readonly gDif?: RtcInfoTributosDif;
}

/** `TCRTCInfoTribIBSCBS` (`IBSCBS/valores/trib`). */
export interface RtcInfoTribIbsCbsNt009 {
  /** CST do IBS/CBS (3 dígitos, `TSRTCCodSitTrib`) — não é o enum `CST` de PIS/COFINS. */
  readonly CST: string;
  /** Código de classificação tributária do IBS/CBS (6 dígitos, `TSRTCCodClassTrib`). */
  readonly cClassTrib: string;
  readonly gIBSCBS?: RtcInfoTributosSitClasNt009;
}

/** `TCRTCInfoValoresIBSCBS` no nt009 — sem `gReeRepRes` (migrou para `valores/vAjusteBC`). */
export interface RtcInfoValoresIbsCbsNt009 {
  readonly trib: RtcInfoTribIbsCbsNt009;
}

/** `TCRTCInfoIBSCBS` no nt009 — `finNFSe` saiu daqui (vai na raiz de `infDPS`). */
export interface RtcInfoIbsCbsNt009 {
  readonly indFinal?: IndicadorFinal;
  /** `minOccurs="0"` no nt009. */
  readonly cIndOp?: string;
  readonly tpOper?: TipoOperacao;
  readonly gRefNFSe?: InfoRefNFSe;
  readonly tpEnteGov?: TipoEnteGovernamental;
  readonly indDest: IndicadorDestinatario;
  readonly dest?: RtcInfoDest;
  readonly imovel?: RtcInfoImovelNt009;
  /** 0 a 1000 ocorrências; array vazio é omitido na serialização. */
  readonly bensMoveis?: readonly RtcInfoBensMoveisNt009[];
  readonly valores: RtcInfoValoresIbsCbsNt009;
}

export interface InfDPSNt009 {
  readonly Id: string;
  readonly tpAmb: TipoAmbienteDps;
  readonly dhEmi: Date;
  readonly verAplic: string;
  readonly serie: string;
  readonly nDPS: string;
  readonly dCompet: Date;
  readonly tpEmit: TipoEmitenteDps;
  /**
   * O XSD nt009 (`TSMotivoEmisTI`) ainda aceita 1–4, mas a **E0031** do Anexo I
   * `20261020` exige, com tpEmit 2 ou 3, o valor `1` (Importação de Serviço) —
   * os motivos 2–4 do nt004 são sempre rejeitados. `buildDpsXml` lança
   * `RuleViolationError('E0031')` para outro valor (ou para a ausência com
   * tpEmit 2/3). O tipo segue o XSD para o parser ser sem perdas: um valor 2–4
   * lido de uma NFS-e é mantido, com `warn` `nfse.parse.rule_violation`.
   */
  readonly cMotivoEmisTI?: MotivoEmissaoTomadorIntermediario;
  /** Obrigatório no nt009 — serializado logo após `cMotivoEmisTI`. */
  readonly finNFSe: FinalidadeNFSe;
  /**
   * Fora do contrato de emissão nt009: o XSD ainda aceita `chNFSeRej`, mas a
   * **E0034** do Anexo I `20261020` rejeita sempre ("Não é permitido informar
   * nenhuma chave de acesso de NFSe"). `buildDpsXml` lança
   * `RuleViolationError('E0034')` se vier preenchido. O tipo segue o XSD para o
   * parser ser sem perdas: o valor lido de uma NFS-e é mantido, com `warn`
   * `nfse.parse.rule_violation`.
   */
  readonly chNFSeRej?: string;
  readonly cLocEmi: string;
  readonly subst?: Substituicao;
  readonly prest: InfoPrestador;
  readonly toma?: InfoPessoaNt009;
  readonly interm?: InfoPessoaNt009;
  readonly serv: Serv;
  readonly valores: InfoValoresNt009;
  readonly IBSCBS?: RtcInfoIbsCbsNt009;
}

export interface DpsNt009 {
  /** Campo sintético da lib (não existe no XML): identifica o layout do documento. */
  readonly layout: 'nt009';
  readonly versao: string;
  readonly infDPS: InfDPSNt009;
  readonly signature?: Signature;
}

/** `TCValoresNFSe` no nt009 — `vCalcDR` virou `vCalcAjusteBCISSQN`. */
export interface ValoresNFSeNt009 {
  readonly vCalcAjusteBCISSQN?: number;
  readonly tpBM?: TipoBeneficioMunicipal;
  readonly vCalcBM?: number;
  readonly vBC?: number;
  readonly pAliqAplic?: number;
  readonly vISSQN?: number;
  readonly vTotalRet?: number;
  readonly vLiq: number;
}

/** `TCRTCValoresIBSCBS` no nt009 — `vBC` opcional; `vCalcReeRepRes` substituído. */
export interface RtcValoresIbsCbsNt009 {
  readonly vBC?: number;
  readonly vCalcAjusteBCLocImoveis?: number;
  readonly vCalcAjusteBCIBSCBS?: number;
  readonly uf: RtcValoresIbsCbsUF;
  readonly mun: RtcValoresIbsCbsMun;
  readonly fed: RtcValoresIbsCbsFed;
}

/** `TCRTCTotalCIBS` no nt009 — `gIBS`/`gCBS` passaram a `minOccurs="0"`. */
export interface RtcTotalCIbsNt009 {
  readonly vTotNF: number;
  readonly gIBS?: RtcTotalIbs;
  readonly gCBS?: RtcTotalCbs;
  readonly gTribRegular?: RtcTotalTribRegular;
  readonly gTribCompraGov?: RtcTotalTribCompraGov;
}

/** `TCRTCIBSCBS` no nt009 — localidade de incidência e `valores` passaram a opcionais. */
export interface RtcIbsCbsNt009 {
  readonly cLocalidadeIncid?: string;
  readonly xLocalidadeIncid?: string;
  readonly pRedutor?: number;
  readonly valores?: RtcValoresIbsCbsNt009;
  readonly totCIBS: RtcTotalCIbsNt009;
}

export interface InfNFSeNt009 {
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
  readonly valores: ValoresNFSeNt009;
  /** `TCInfNFSe/xOutInf` (`minOccurs="0"`) — uso da Adm. Tributária Municipal. */
  readonly xOutInf?: string;
  readonly IBSCBS?: RtcIbsCbsNt009;
  readonly DPS: DpsNt009;
}

export interface NfseNt009 {
  /** Campo sintético da lib (não existe no XML): identifica o layout do documento. */
  readonly layout: 'nt009';
  readonly versao: string;
  readonly infNFSe: InfNFSeNt009;
  readonly signature: Signature;
}
