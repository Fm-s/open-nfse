import { InvalidXmlError } from '../errors/validation.js';
import { type Logger, noopLogger } from '../logging.js';
import { ATTR_PREFIX, parseXml, type XmlObject } from '../xml/parser.js';
import type {
  AjusteBCIssqnNt009,
  AtvEvento,
  AtvEventoIdentificacao,
  BeneficioMunicipal,
  ComExterior,
  CServ,
  DocAjusteBCNt009,
  DocDedRedNt004,
  DocNFNFSNt004,
  DocOutNFSeNt004,
  DpsNt004,
  DpsNt009,
  Emitente,
  Endereco,
  EnderecoEmitente,
  EnderecoExterior,
  EnderecoExteriorSimples,
  EnderecoSimples,
  EnderecoSimplesLocalidade,
  EnderImovelNt009,
  EnderObraEvento,
  ExigSuspensa,
  IdentificadorEmitente,
  IdentificadorPessoa,
  ImovelIdentificacaoNt004,
  InfDPSNt004,
  InfDPSNt009,
  InfNFSeNt004,
  InfNFSeNt009,
  InfoAjusteBCNt009,
  InfoCompl,
  InfoDedRedNt004,
  InfoItemPed,
  InfoObra,
  InfoObraIdentificacao,
  InfoPessoaNt004,
  InfoPessoaNt009,
  InfoPrestador,
  InfoRefNFSe,
  InfoTributacao,
  InfoValoresNt004,
  InfoValoresNt009,
  ListaDocDedRedNt004,
  LocPrest,
  NFSe,
  ReferenciaDocDedRedNt004,
  RegTrib,
  RtcDocumentoReferenciado,
  RtcIbsCbsNt004,
  RtcIbsCbsNt009,
  RtcInfoBensMoveisNt009,
  RtcInfoDest,
  RtcInfoIbsCbsNt004,
  RtcInfoIbsCbsNt009,
  RtcInfoImovelNt004,
  RtcInfoImovelNt009,
  RtcInfoReeRepResNt004,
  RtcInfoTribIbsCbsNt009,
  RtcInfoTributosDif,
  RtcInfoTributosIbsCbsNt004,
  RtcInfoTributosSitClasNt004,
  RtcInfoTributosSitClasNt009,
  RtcInfoTributosTribRegular,
  RtcInfoValoresIbsCbsNt004,
  RtcInfoValoresIbsCbsNt009,
  RtcListaDocDFe,
  RtcListaDocFiscalOutro,
  RtcListaDocFornec,
  RtcListaDocNt004,
  RtcListaDocOutro,
  RtcLocacaoImovelNt009,
  RtcTotalCbs,
  RtcTotalCbsCredPres,
  RtcTotalCIbsNt004,
  RtcTotalCIbsNt009,
  RtcTotalIbs,
  RtcTotalIbsCredPres,
  RtcTotalIbsMun,
  RtcTotalIbsUF,
  RtcTotalTribCompraGov,
  RtcTotalTribRegular,
  RtcUnidadeImobiliariaNt009,
  RtcValoresBCImoveisNt009,
  RtcValoresIbsCbsFed,
  RtcValoresIbsCbsMun,
  RtcValoresIbsCbsNt004,
  RtcValoresIbsCbsNt009,
  RtcValoresIbsCbsUF,
  Serv,
  Signature,
  Substituicao,
  TribFederal,
  TribMunicipal,
  TribOutrosPisCofins,
  TribTotal,
  TribTotalMonet,
  TribTotalPercent,
  UnidadeImobiliariaIdentificacaoNt009,
  ValoresNFSeNt004,
  ValoresNFSeNt009,
  VDescCondIncond,
  VServPrest,
} from './domain.js';
import type {
  AmbienteGerador,
  CodigoNaoNif,
  CST,
  EnvioMDIC,
  FinalidadeNFSe,
  IndicadorDestinatario,
  IndicadorFinal,
  IndicadorTotalTributos,
  JustificativaSubstituicao,
  MecanismoApoioComExPrestador,
  MecanismoApoioComExTomador,
  ModoPrestacao,
  MotivoEmissaoTomadorIntermediario,
  MovimentacaoTemporariaBens,
  OpcaoSimplesNacional,
  ProcessoEmissao,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  SituacaoNfse,
  TipoAjusteBC,
  TipoAjusteBCLocImoveis,
  TipoAmbienteDps,
  TipoBeneficioMunicipal,
  TipoChaveDFe,
  TipoDedRed,
  TipoEmissao,
  TipoEmitenteDps,
  TipoEnteGovernamental,
  TipoExigSuspensa,
  TipoImunidadeISSQN,
  TipoOperacao,
  TipoReembolsoRepasse,
  TipoRetISSQN,
  TipoRetPisCofins,
  TipoTribISSQN,
  UF,
  VinculoPrestacao,
} from './enums.js';
import type { Layout } from './layout.js';

export interface ParseNfseXmlOptions {
  /** Recebe `warn('nfse.parse.unexpected_field', { layout, field })` para campos de outro layout. */
  readonly logger?: Logger;
}

/** Contexto de parse: layout do documento + logger para campos de outro layout. */
interface ParseContext {
  readonly layout: Layout;
  readonly logger: Logger;
}

/**
 * Faz o parse de uma NFS-e (nt004 ou nt009). O layout é detectado pelo DPS
 * embutido ({@link detectDpsLayout}). Elementos exclusivos do outro layout são
 * ignorados e reportados via `logger.warn('nfse.parse.unexpected_field', …)`.
 */
export function parseNfseXml(xml: string, options?: ParseNfseXmlOptions): NFSe {
  let tree: XmlObject;
  try {
    tree = parseXml(xml);
  } catch (cause) {
    throw new InvalidXmlError('falha ao parsear XML', { cause });
  }
  const root = tree.NFSe;
  if (!isObject(root)) {
    throw new InvalidXmlError('elemento raiz <NFSe> ausente');
  }
  return parseNFSe(root, options?.logger ?? noopLogger);
}

/** `'nt009'` sse `infDPS` tem `finNFSe` como filho direto; senão `'nt004'`. */
function detectDpsLayout(infDPS: XmlObject): Layout {
  return typeof infDPS.finNFSe === 'string' ? 'nt009' : 'nt004';
}

/** Ignora e avisa sobre elementos de `fields` presentes em `node` (outro layout). */
function warnForeignFields(node: XmlObject, fields: readonly string[], ctx: ParseContext): void {
  for (const field of fields) {
    if (node[field] !== undefined) {
      ctx.logger.warn('nfse.parse.unexpected_field', { layout: ctx.layout, field });
    }
  }
}

function parseNFSe(node: XmlObject, logger: Logger): NFSe {
  const infNFSe = requireChild(node, 'infNFSe');
  const dps = requireChild(infNFSe, 'DPS');
  const layout = detectDpsLayout(requireChild(dps, 'infDPS'));
  const ctx: ParseContext = { layout, logger };
  const versao = requireAttr(node, 'versao');
  const signature = parseSignature(requireChild(node, 'Signature'));
  if (layout === 'nt009') {
    return { layout, versao, infNFSe: parseInfNFSeNt009(infNFSe, ctx), signature };
  }
  return { layout, versao, infNFSe: parseInfNFSe(infNFSe, ctx), signature };
}

function parseInfNFSe(node: XmlObject, ctx: ParseContext): InfNFSeNt004 {
  warnForeignFields(requireChild(node, 'valores'), ['vCalcAjusteBCISSQN'], ctx);
  return {
    ...parseInfNFSeBase(node),
    valores: parseValoresNFSe(requireChild(node, 'valores')),
    ...optionalAssign('xOutInf', optionalText(node, 'xOutInf')),
    ...optionalAssign('IBSCBS', mapIfPresent(optionalChild(node, 'IBSCBS'), parseRtcIbsCbs)),
    DPS: parseDPS(requireChild(node, 'DPS'), ctx),
  };
}

function parseInfNFSeNt009(node: XmlObject, ctx: ParseContext): InfNFSeNt009 {
  warnForeignFields(requireChild(node, 'valores'), ['vCalcDR'], ctx);
  return {
    ...parseInfNFSeBase(node),
    valores: parseValoresNFSeNt009(requireChild(node, 'valores')),
    ...optionalAssign('xOutInf', optionalText(node, 'xOutInf')),
    ...optionalAssign('IBSCBS', mapIfPresent(optionalChild(node, 'IBSCBS'), parseRtcIbsCbsNt009)),
    DPS: parseDpsNt009(requireChild(node, 'DPS'), ctx),
  };
}

/** Campos de `TCInfNFSe` idênticos nos dois layouts (tudo exceto valores/IBSCBS/DPS). */
function parseInfNFSeBase(node: XmlObject) {
  const id = requireAttr(node, 'Id');
  return {
    Id: id,
    chaveAcesso: id.replace(/^NFS/, ''),
    xLocEmi: requireText(node, 'xLocEmi'),
    xLocPrestacao: requireText(node, 'xLocPrestacao'),
    nNFSe: requireText(node, 'nNFSe'),
    ...optionalAssign('cLocIncid', optionalText(node, 'cLocIncid')),
    ...optionalAssign('xLocIncid', optionalText(node, 'xLocIncid')),
    xTribNac: requireText(node, 'xTribNac'),
    ...optionalAssign('xTribMun', optionalText(node, 'xTribMun')),
    ...optionalAssign('xNBS', optionalText(node, 'xNBS')),
    verAplic: requireText(node, 'verAplic'),
    ambGer: requireText(node, 'ambGer') as AmbienteGerador,
    tpEmis: requireText(node, 'tpEmis') as TipoEmissao,
    ...optionalAssign('procEmi', optionalText(node, 'procEmi') as ProcessoEmissao | undefined),
    cStat: requireText(node, 'cStat') as SituacaoNfse,
    dhProc: coerceDate(requireText(node, 'dhProc')),
    nDFSe: requireText(node, 'nDFSe'),
    emit: parseEmitente(requireChild(node, 'emit')),
  };
}

function parseEmitente(node: XmlObject): Emitente {
  return {
    identificador: parseIdentificadorEmitente(node),
    ...optionalAssign('IM', optionalText(node, 'IM')),
    xNome: requireText(node, 'xNome'),
    ...optionalAssign('xFant', optionalText(node, 'xFant')),
    enderNac: parseEnderecoEmitente(requireChild(node, 'enderNac')),
    ...optionalAssign('fone', optionalText(node, 'fone')),
    ...optionalAssign('email', optionalText(node, 'email')),
  };
}

function parseEnderecoEmitente(node: XmlObject): EnderecoEmitente {
  return {
    xLgr: requireText(node, 'xLgr'),
    nro: requireText(node, 'nro'),
    ...optionalAssign('xCpl', optionalText(node, 'xCpl')),
    xBairro: requireText(node, 'xBairro'),
    cMun: requireText(node, 'cMun'),
    UF: requireText(node, 'UF') as UF,
    CEP: requireText(node, 'CEP'),
  };
}

function parseValoresNFSe(node: XmlObject): ValoresNFSeNt004 {
  return {
    ...optionalAssign('vCalcDR', optionalNumber(node, 'vCalcDR')),
    ...optionalAssign('tpBM', optionalText(node, 'tpBM') as TipoBeneficioMunicipal | undefined),
    ...optionalAssign('vCalcBM', optionalNumber(node, 'vCalcBM')),
    ...optionalAssign('vBC', optionalNumber(node, 'vBC')),
    ...optionalAssign('pAliqAplic', optionalNumber(node, 'pAliqAplic')),
    ...optionalAssign('vISSQN', optionalNumber(node, 'vISSQN')),
    ...optionalAssign('vTotalRet', optionalNumber(node, 'vTotalRet')),
    vLiq: coerceNumber(requireText(node, 'vLiq')),
  };
}

function parseDPS(node: XmlObject, ctx: ParseContext): DpsNt004 {
  const sig = optionalChild(node, 'Signature');
  return {
    layout: 'nt004',
    versao: requireAttr(node, 'versao'),
    infDPS: parseInfDPS(requireChild(node, 'infDPS'), ctx),
    ...optionalAssign('signature', sig ? parseSignature(sig) : undefined),
  };
}

function parseInfDPS(node: XmlObject, ctx: ParseContext): InfDPSNt004 {
  warnForeignFields(requireChild(node, 'valores'), ['vAjusteBC'], ctx);
  warnForeignIbsCbsNt004(optionalChild(node, 'IBSCBS'), ctx);
  return {
    Id: requireAttr(node, 'Id'),
    tpAmb: requireText(node, 'tpAmb') as TipoAmbienteDps,
    dhEmi: coerceDate(requireText(node, 'dhEmi')),
    verAplic: requireText(node, 'verAplic'),
    serie: requireText(node, 'serie'),
    nDPS: requireText(node, 'nDPS'),
    dCompet: coerceDateOnly(requireText(node, 'dCompet')),
    tpEmit: requireText(node, 'tpEmit') as TipoEmitenteDps,
    ...optionalAssign(
      'cMotivoEmisTI',
      optionalText(node, 'cMotivoEmisTI') as MotivoEmissaoTomadorIntermediario | undefined,
    ),
    ...optionalAssign('chNFSeRej', optionalText(node, 'chNFSeRej')),
    cLocEmi: requireText(node, 'cLocEmi'),
    ...optionalAssign('subst', mapIfPresent(optionalChild(node, 'subst'), parseSubstituicao)),
    prest: parseInfoPrestador(requireChild(node, 'prest')),
    ...optionalAssign('toma', mapIfPresent(optionalChild(node, 'toma'), parseInfoPessoa)),
    ...optionalAssign('interm', mapIfPresent(optionalChild(node, 'interm'), parseInfoPessoa)),
    serv: parseServ(requireChild(node, 'serv')),
    valores: parseInfoValoresNt004(requireChild(node, 'valores')),
    ...optionalAssign('IBSCBS', mapIfPresent(optionalChild(node, 'IBSCBS'), parseRtcInfoIbsCbs)),
  };
}

function parseSubstituicao(node: XmlObject): Substituicao {
  return {
    chSubstda: requireText(node, 'chSubstda'),
    cMotivo: requireText(node, 'cMotivo') as JustificativaSubstituicao,
    ...optionalAssign('xMotivo', optionalText(node, 'xMotivo')),
  };
}

function parseRtcInfoIbsCbs(node: XmlObject): RtcInfoIbsCbsNt004 {
  return {
    finNFSe: requireText(node, 'finNFSe') as FinalidadeNFSe,
    ...optionalAssign('indFinal', optionalText(node, 'indFinal') as IndicadorFinal | undefined),
    cIndOp: requireText(node, 'cIndOp'),
    ...optionalAssign('tpOper', optionalText(node, 'tpOper') as TipoOperacao | undefined),
    ...optionalAssign('gRefNFSe', mapIfPresent(optionalChild(node, 'gRefNFSe'), parseInfoRefNFSe)),
    ...optionalAssign(
      'tpEnteGov',
      optionalText(node, 'tpEnteGov') as TipoEnteGovernamental | undefined,
    ),
    indDest: requireText(node, 'indDest') as IndicadorDestinatario,
    ...optionalAssign('dest', mapIfPresent(optionalChild(node, 'dest'), parseRtcInfoDest)),
    ...optionalAssign('imovel', mapIfPresent(optionalChild(node, 'imovel'), parseRtcInfoImovel)),
    valores: parseRtcInfoValoresIbsCbs(requireChild(node, 'valores')),
  };
}

function parseInfoRefNFSe(node: XmlObject): InfoRefNFSe {
  return {
    refNFSe: asArray(node.refNFSe).map((v) => {
      if (typeof v !== 'string') throw new InvalidXmlError('refNFSe não é string');
      return v;
    }),
  };
}

function parseRtcInfoDest(node: XmlObject): RtcInfoDest {
  return {
    identificador: parseIdentificador(node),
    xNome: requireText(node, 'xNome'),
    ...optionalAssign('end', mapIfPresent(optionalChild(node, 'end'), parseEndereco)),
    ...optionalAssign('fone', optionalText(node, 'fone')),
    ...optionalAssign('email', optionalText(node, 'email')),
  };
}

function parseRtcInfoImovel(node: XmlObject): RtcInfoImovelNt004 {
  return {
    ...optionalAssign('inscImobFisc', optionalText(node, 'inscImobFisc')),
    identificacao: parseImovelIdentificacao(node),
  };
}

function parseImovelIdentificacao(node: XmlObject): ImovelIdentificacaoNt004 {
  const cCIB = optionalText(node, 'cCIB');
  if (cCIB !== undefined) return { cCIB };
  const end = optionalChild(node, 'end');
  if (end) return { end: parseEnderObraEvento(end) };
  throw new InvalidXmlError('imovel sem cCIB nem end');
}

function parseRtcInfoValoresIbsCbs(node: XmlObject): RtcInfoValoresIbsCbsNt004 {
  return {
    ...optionalAssign(
      'gReeRepRes',
      mapIfPresent(optionalChild(node, 'gReeRepRes'), parseRtcInfoReeRepRes),
    ),
    trib: parseRtcInfoTributosIbsCbs(requireChild(node, 'trib')),
  };
}

function parseRtcInfoReeRepRes(node: XmlObject): RtcInfoReeRepResNt004 {
  return {
    documentos: asArray(node.documentos).map((entry) => {
      if (!isObject(entry)) throw new InvalidXmlError('documentos entry inválida');
      return parseRtcListaDoc(entry);
    }),
  };
}

function parseRtcListaDoc(node: XmlObject): RtcListaDocNt004 {
  return {
    documento: parseRtcDocumentoReferenciado(node),
    ...optionalAssign(
      'fornec',
      mapIfPresent(optionalChild(node, 'fornec'), parseRtcListaDocFornec),
    ),
    dtEmiDoc: coerceDateOnly(requireText(node, 'dtEmiDoc')),
    dtCompDoc: coerceDateOnly(requireText(node, 'dtCompDoc')),
    tpReeRepRes: requireText(node, 'tpReeRepRes') as TipoReembolsoRepasse,
    ...optionalAssign('xTpReeRepRes', optionalText(node, 'xTpReeRepRes')),
    vlrReeRepRes: coerceNumber(requireText(node, 'vlrReeRepRes')),
  };
}

function parseRtcDocumentoReferenciado(node: XmlObject): RtcDocumentoReferenciado {
  const dFe = optionalChild(node, 'dFeNacional');
  if (dFe) return { dFeNacional: parseRtcListaDocDFe(dFe) };
  const outroFiscal = optionalChild(node, 'docFiscalOutro');
  if (outroFiscal) return { docFiscalOutro: parseRtcListaDocFiscalOutro(outroFiscal) };
  const outro = optionalChild(node, 'docOutro');
  if (outro) return { docOutro: parseRtcListaDocOutro(outro) };
  throw new InvalidXmlError('documento referenciado sem variante reconhecida');
}

function parseRtcListaDocDFe(node: XmlObject): RtcListaDocDFe {
  return {
    tipoChaveDFe: requireText(node, 'tipoChaveDFe') as TipoChaveDFe,
    ...optionalAssign('xTipoChaveDFe', optionalText(node, 'xTipoChaveDFe')),
    chaveDFe: requireText(node, 'chaveDFe'),
  };
}

function parseRtcListaDocFiscalOutro(node: XmlObject): RtcListaDocFiscalOutro {
  return {
    cMunDocFiscal: requireText(node, 'cMunDocFiscal'),
    nDocFiscal: requireText(node, 'nDocFiscal'),
    xDocFiscal: requireText(node, 'xDocFiscal'),
  };
}

function parseRtcListaDocOutro(node: XmlObject): RtcListaDocOutro {
  return {
    nDoc: requireText(node, 'nDoc'),
    xDoc: requireText(node, 'xDoc'),
  };
}

function parseRtcListaDocFornec(node: XmlObject): RtcListaDocFornec {
  return {
    identificador: parseIdentificador(node),
    xNome: requireText(node, 'xNome'),
  };
}

function parseRtcInfoTributosIbsCbs(node: XmlObject): RtcInfoTributosIbsCbsNt004 {
  return {
    gIBSCBS: parseRtcInfoTributosSitClas(requireChild(node, 'gIBSCBS')),
  };
}

function parseRtcInfoTributosSitClas(node: XmlObject): RtcInfoTributosSitClasNt004 {
  return {
    CST: requireText(node, 'CST'),
    cClassTrib: requireText(node, 'cClassTrib'),
    ...optionalAssign('cCredPres', optionalText(node, 'cCredPres')),
    ...optionalAssign(
      'gTribRegular',
      mapIfPresent(optionalChild(node, 'gTribRegular'), parseRtcInfoTributosTribRegular),
    ),
    ...optionalAssign('gDif', mapIfPresent(optionalChild(node, 'gDif'), parseRtcInfoTributosDif)),
  };
}

function parseRtcInfoTributosTribRegular(node: XmlObject): RtcInfoTributosTribRegular {
  return {
    CSTReg: requireText(node, 'CSTReg'),
    cClassTribReg: requireText(node, 'cClassTribReg'),
  };
}

function parseRtcInfoTributosDif(node: XmlObject): RtcInfoTributosDif {
  return {
    pDifUF: coerceNumber(requireText(node, 'pDifUF')),
    pDifMun: coerceNumber(requireText(node, 'pDifMun')),
    pDifCBS: coerceNumber(requireText(node, 'pDifCBS')),
  };
}

function parseInfoPrestador(node: XmlObject): InfoPrestador {
  return {
    identificador: parseIdentificador(node),
    ...optionalAssign('CAEPF', optionalText(node, 'CAEPF')),
    ...optionalAssign('IM', optionalText(node, 'IM')),
    ...optionalAssign('xNome', optionalText(node, 'xNome')),
    ...optionalAssign('end', mapIfPresent(optionalChild(node, 'end'), parseEndereco)),
    ...optionalAssign('fone', optionalText(node, 'fone')),
    ...optionalAssign('email', optionalText(node, 'email')),
    regTrib: parseRegTrib(requireChild(node, 'regTrib')),
  };
}

function parseInfoPessoa(node: XmlObject): InfoPessoaNt004 {
  return {
    identificador: parseIdentificador(node),
    ...optionalAssign('CAEPF', optionalText(node, 'CAEPF')),
    ...optionalAssign('IM', optionalText(node, 'IM')),
    xNome: requireText(node, 'xNome'),
    ...optionalAssign('end', mapIfPresent(optionalChild(node, 'end'), parseEndereco)),
    ...optionalAssign('fone', optionalText(node, 'fone')),
    ...optionalAssign('email', optionalText(node, 'email')),
  };
}

function parseRegTrib(node: XmlObject): RegTrib {
  return {
    opSimpNac: requireText(node, 'opSimpNac') as OpcaoSimplesNacional,
    ...optionalAssign(
      'regApTribSN',
      optionalText(node, 'regApTribSN') as RegimeApuracaoSimplesNacional | undefined,
    ),
    regEspTrib: requireText(node, 'regEspTrib') as RegimeEspecialTributacao,
  };
}

function parseEndereco(node: XmlObject): Endereco {
  const endNac = optionalChild(node, 'endNac');
  const endExt = optionalChild(node, 'endExt');
  let localidade: Endereco['localidade'];
  if (endNac) {
    localidade = {
      endNac: {
        cMun: requireText(endNac, 'cMun'),
        CEP: requireText(endNac, 'CEP'),
      },
    };
  } else if (endExt) {
    localidade = { endExt: parseEnderecoExterior(endExt) };
  } else {
    throw new InvalidXmlError('endereço sem endNac nem endExt');
  }

  return {
    localidade,
    xLgr: requireText(node, 'xLgr'),
    nro: requireText(node, 'nro'),
    ...optionalAssign('xCpl', optionalText(node, 'xCpl')),
    xBairro: requireText(node, 'xBairro'),
  };
}

function parseServ(node: XmlObject): Serv {
  return {
    locPrest: parseLocPrest(requireChild(node, 'locPrest')),
    cServ: parseCServ(requireChild(node, 'cServ')),
    ...optionalAssign('comExt', mapIfPresent(optionalChild(node, 'comExt'), parseComExterior)),
    ...optionalAssign('obra', mapIfPresent(optionalChild(node, 'obra'), parseInfoObra)),
    ...optionalAssign('atvEvento', mapIfPresent(optionalChild(node, 'atvEvento'), parseAtvEvento)),
    ...optionalAssign('infoCompl', mapIfPresent(optionalChild(node, 'infoCompl'), parseInfoCompl)),
  };
}

function parseComExterior(node: XmlObject): ComExterior {
  return {
    mdPrestacao: requireText(node, 'mdPrestacao') as ModoPrestacao,
    vincPrest: requireText(node, 'vincPrest') as VinculoPrestacao,
    tpMoeda: requireText(node, 'tpMoeda'),
    vServMoeda: coerceNumber(requireText(node, 'vServMoeda')),
    mecAFComexP: requireText(node, 'mecAFComexP') as MecanismoApoioComExPrestador,
    mecAFComexT: requireText(node, 'mecAFComexT') as MecanismoApoioComExTomador,
    movTempBens: requireText(node, 'movTempBens') as MovimentacaoTemporariaBens,
    ...optionalAssign('nDI', optionalText(node, 'nDI')),
    ...optionalAssign('nRE', optionalText(node, 'nRE')),
    mdic: requireText(node, 'mdic') as EnvioMDIC,
  };
}

function parseAtvEvento(node: XmlObject): AtvEvento {
  return {
    xNome: requireText(node, 'xNome'),
    dtIni: coerceDateOnly(requireText(node, 'dtIni')),
    dtFim: coerceDateOnly(requireText(node, 'dtFim')),
    identificacao: parseAtvEventoIdentificacao(node),
  };
}

function parseAtvEventoIdentificacao(node: XmlObject): AtvEventoIdentificacao {
  const id = optionalText(node, 'idAtvEvt');
  if (id !== undefined) return { idAtvEvt: id };
  const end = optionalChild(node, 'end');
  if (end) return { end: parseEnderecoSimples(end) };
  throw new InvalidXmlError('atvEvento sem idAtvEvt nem end');
}

function parseEnderecoExterior(node: XmlObject): EnderecoExterior {
  return {
    cPais: requireText(node, 'cPais'),
    cEndPost: requireText(node, 'cEndPost'),
    xCidade: requireText(node, 'xCidade'),
    xEstProvReg: requireText(node, 'xEstProvReg'),
  };
}

function parseEnderecoExteriorSimples(node: XmlObject): EnderecoExteriorSimples {
  return {
    cEndPost: requireText(node, 'cEndPost'),
    xCidade: requireText(node, 'xCidade'),
    xEstProvReg: requireText(node, 'xEstProvReg'),
  };
}

function parseEnderecoSimples(node: XmlObject): EnderecoSimples {
  const cep = optionalText(node, 'CEP');
  const localidade: EnderecoSimplesLocalidade = cep
    ? { CEP: cep }
    : { endExt: parseEnderecoExteriorSimples(requireChild(node, 'endExt')) };
  return {
    ...localidade,
    xLgr: requireText(node, 'xLgr'),
    nro: requireText(node, 'nro'),
    ...optionalAssign('xCpl', optionalText(node, 'xCpl')),
    xBairro: requireText(node, 'xBairro'),
  };
}

function parseEnderObraEvento(node: XmlObject): EnderObraEvento {
  return parseEnderecoSimples(node);
}

function parseInfoObra(node: XmlObject): InfoObra {
  return {
    ...optionalAssign('inscImobFisc', optionalText(node, 'inscImobFisc')),
    identificacao: parseInfoObraIdentificacao(node),
  };
}

function parseInfoObraIdentificacao(node: XmlObject): InfoObraIdentificacao {
  const cObra = optionalText(node, 'cObra');
  if (cObra !== undefined) return { cObra };
  const cCIB = optionalText(node, 'cCIB');
  if (cCIB !== undefined) return { cCIB };
  const end = optionalChild(node, 'end');
  if (end) return { end: parseEnderObraEvento(end) };
  throw new InvalidXmlError('obra sem cObra/cCIB/end');
}

function parseInfoCompl(node: XmlObject): InfoCompl {
  return {
    ...optionalAssign('idDocTec', optionalText(node, 'idDocTec')),
    ...optionalAssign('docRef', optionalText(node, 'docRef')),
    ...optionalAssign('xPed', optionalText(node, 'xPed')),
    ...optionalAssign('gItemPed', mapIfPresent(optionalChild(node, 'gItemPed'), parseInfoItemPed)),
    ...optionalAssign('xInfComp', optionalText(node, 'xInfComp')),
  };
}

function parseInfoItemPed(node: XmlObject): InfoItemPed {
  return {
    xItemPed: asArray(node.xItemPed).map((v) => {
      if (typeof v !== 'string') {
        throw new InvalidXmlError('xItemPed não é string');
      }
      return v;
    }),
  };
}

function parseLocPrest(node: XmlObject): LocPrest {
  const muni = optionalText(node, 'cLocPrestacao');
  if (muni !== undefined) return { cLocPrestacao: muni };
  const pais = optionalText(node, 'cPaisPrestacao');
  if (pais !== undefined) return { cPaisPrestacao: pais };
  throw new InvalidXmlError('locPrest sem cLocPrestacao nem cPaisPrestacao');
}

function parseCServ(node: XmlObject): CServ {
  return {
    cTribNac: requireText(node, 'cTribNac'),
    ...optionalAssign('cTribMun', optionalText(node, 'cTribMun')),
    xDescServ: requireText(node, 'xDescServ'),
    ...optionalAssign('cNBS', optionalText(node, 'cNBS')),
    ...optionalAssign('cIntContrib', optionalText(node, 'cIntContrib')),
  };
}

function parseInfoValoresNt004(node: XmlObject): InfoValoresNt004 {
  return {
    vServPrest: parseVServPrest(requireChild(node, 'vServPrest')),
    ...optionalAssign(
      'vDescCondIncond',
      mapIfPresent(optionalChild(node, 'vDescCondIncond'), parseVDescCondIncond),
    ),
    ...optionalAssign('vDedRed', mapIfPresent(optionalChild(node, 'vDedRed'), parseInfoDedRed)),
    trib: parseInfoTributacao(requireChild(node, 'trib')),
  };
}

function parseVServPrest(node: XmlObject): VServPrest {
  return {
    ...optionalAssign('vReceb', optionalNumber(node, 'vReceb')),
    vServ: coerceNumber(requireText(node, 'vServ')),
  };
}

function parseVDescCondIncond(node: XmlObject): VDescCondIncond {
  return {
    ...optionalAssign('vDescIncond', optionalNumber(node, 'vDescIncond')),
    ...optionalAssign('vDescCond', optionalNumber(node, 'vDescCond')),
  };
}

function parseInfoDedRed(node: XmlObject): InfoDedRedNt004 {
  const pDR = optionalNumber(node, 'pDR');
  if (pDR !== undefined) return { pDR };
  const vDR = optionalNumber(node, 'vDR');
  if (vDR !== undefined) return { vDR };
  const documentos = optionalChild(node, 'documentos');
  if (documentos) return { documentos: parseListaDocDedRed(documentos) };
  throw new InvalidXmlError('vDedRed sem pDR, vDR ou documentos');
}

function parseListaDocDedRed(node: XmlObject): ListaDocDedRedNt004 {
  return {
    docDedRed: asArray(node.docDedRed).map((entry) => {
      if (!isObject(entry)) {
        throw new InvalidXmlError('docDedRed não é um elemento');
      }
      return parseDocDedRed(entry);
    }),
  };
}

function parseDocDedRed(node: XmlObject): DocDedRedNt004 {
  return {
    referencia: parseReferenciaDocDedRed(node),
    tpDedRed: requireText(node, 'tpDedRed') as TipoDedRed,
    ...optionalAssign('xDescOutDed', optionalText(node, 'xDescOutDed')),
    dtEmiDoc: coerceDateOnly(requireText(node, 'dtEmiDoc')),
    vDedutivelRedutivel: coerceNumber(requireText(node, 'vDedutivelRedutivel')),
    vDeducaoReducao: coerceNumber(requireText(node, 'vDeducaoReducao')),
    ...optionalAssign('fornec', mapIfPresent(optionalChild(node, 'fornec'), parseInfoPessoa)),
  };
}

function parseReferenciaDocDedRed(node: XmlObject): ReferenciaDocDedRedNt004 {
  const chNFSe = optionalText(node, 'chNFSe');
  if (chNFSe !== undefined) return { chNFSe };
  const chNFe = optionalText(node, 'chNFe');
  if (chNFe !== undefined) return { chNFe };
  const NFSeMun = optionalChild(node, 'NFSeMun');
  if (NFSeMun) return { NFSeMun: parseDocOutNFSe(NFSeMun) };
  const NFNFS = optionalChild(node, 'NFNFS');
  if (NFNFS) return { NFNFS: parseDocNFNFS(NFNFS) };
  const nDocFisc = optionalText(node, 'nDocFisc');
  if (nDocFisc !== undefined) return { nDocFisc };
  const nDoc = optionalText(node, 'nDoc');
  if (nDoc !== undefined) return { nDoc };
  throw new InvalidXmlError('docDedRed sem referência de documento');
}

function parseDocOutNFSe(node: XmlObject): DocOutNFSeNt004 {
  return {
    cMunNFSeMun: requireText(node, 'cMunNFSeMun'),
    nNFSeMun: requireText(node, 'nNFSeMun'),
    cVerifNFSeMun: requireText(node, 'cVerifNFSeMun'),
  };
}

function parseDocNFNFS(node: XmlObject): DocNFNFSNt004 {
  return {
    nNFS: requireText(node, 'nNFS'),
    modNFS: requireText(node, 'modNFS'),
    serieNFS: requireText(node, 'serieNFS'),
  };
}

function parseInfoTributacao(node: XmlObject): InfoTributacao {
  return {
    tribMun: parseTribMunicipal(requireChild(node, 'tribMun')),
    ...optionalAssign('tribFed', mapIfPresent(optionalChild(node, 'tribFed'), parseTribFederal)),
    totTrib: parseTribTotal(requireChild(node, 'totTrib')),
  };
}

function parseTribMunicipal(node: XmlObject): TribMunicipal {
  return {
    tribISSQN: requireText(node, 'tribISSQN') as TipoTribISSQN,
    ...optionalAssign('cPaisResult', optionalText(node, 'cPaisResult')),
    ...optionalAssign(
      'tpImunidade',
      optionalText(node, 'tpImunidade') as TipoImunidadeISSQN | undefined,
    ),
    ...optionalAssign('exigSusp', mapIfPresent(optionalChild(node, 'exigSusp'), parseExigSuspensa)),
    ...optionalAssign('BM', mapIfPresent(optionalChild(node, 'BM'), parseBeneficioMunicipal)),
    tpRetISSQN: requireText(node, 'tpRetISSQN') as TipoRetISSQN,
    ...optionalAssign('pAliq', optionalNumber(node, 'pAliq')),
  };
}

function parseExigSuspensa(node: XmlObject): ExigSuspensa {
  return {
    tpSusp: requireText(node, 'tpSusp') as TipoExigSuspensa,
    nProcesso: requireText(node, 'nProcesso'),
  };
}

function parseBeneficioMunicipal(node: XmlObject): BeneficioMunicipal {
  const nBM = requireText(node, 'nBM');
  const vRedBCBM = optionalNumber(node, 'vRedBCBM');
  if (vRedBCBM !== undefined) return { nBM, vRedBCBM };
  const pRedBCBM = optionalNumber(node, 'pRedBCBM');
  if (pRedBCBM !== undefined) return { nBM, pRedBCBM };
  return { nBM };
}

function parseTribFederal(node: XmlObject): TribFederal {
  return {
    ...optionalAssign(
      'piscofins',
      mapIfPresent(optionalChild(node, 'piscofins'), parseTribOutrosPisCofins),
    ),
    ...optionalAssign('vRetCP', optionalNumber(node, 'vRetCP')),
    ...optionalAssign('vRetIRRF', optionalNumber(node, 'vRetIRRF')),
    ...optionalAssign('vRetCSLL', optionalNumber(node, 'vRetCSLL')),
  };
}

function parseTribOutrosPisCofins(node: XmlObject): TribOutrosPisCofins {
  return {
    CST: requireText(node, 'CST') as CST,
    ...optionalAssign('vBCPisCofins', optionalNumber(node, 'vBCPisCofins')),
    ...optionalAssign('pAliqPis', optionalNumber(node, 'pAliqPis')),
    ...optionalAssign('pAliqCofins', optionalNumber(node, 'pAliqCofins')),
    ...optionalAssign('vPis', optionalNumber(node, 'vPis')),
    ...optionalAssign('vCofins', optionalNumber(node, 'vCofins')),
    ...optionalAssign(
      'tpRetPisCofins',
      optionalText(node, 'tpRetPisCofins') as TipoRetPisCofins | undefined,
    ),
  };
}

function parseTribTotal(node: XmlObject): TribTotal {
  const vTot = optionalChild(node, 'vTotTrib');
  if (vTot) return { vTotTrib: parseTribTotalMonet(vTot) };
  const pTot = optionalChild(node, 'pTotTrib');
  if (pTot) return { pTotTrib: parseTribTotalPercent(pTot) };
  const ind = optionalText(node, 'indTotTrib');
  if (ind !== undefined) return { indTotTrib: ind as IndicadorTotalTributos };
  const pSN = optionalNumber(node, 'pTotTribSN');
  if (pSN !== undefined) return { pTotTribSN: pSN };
  throw new InvalidXmlError('totTrib sem variante (vTotTrib/pTotTrib/indTotTrib/pTotTribSN)');
}

function parseTribTotalMonet(node: XmlObject): TribTotalMonet {
  return {
    vTotTribFed: coerceNumber(requireText(node, 'vTotTribFed')),
    vTotTribEst: coerceNumber(requireText(node, 'vTotTribEst')),
    vTotTribMun: coerceNumber(requireText(node, 'vTotTribMun')),
  };
}

function parseTribTotalPercent(node: XmlObject): TribTotalPercent {
  return {
    pTotTribFed: coerceNumber(requireText(node, 'pTotTribFed')),
    pTotTribEst: coerceNumber(requireText(node, 'pTotTribEst')),
    pTotTribMun: coerceNumber(requireText(node, 'pTotTribMun')),
  };
}

function parseRtcIbsCbs(node: XmlObject): RtcIbsCbsNt004 {
  return {
    cLocalidadeIncid: requireText(node, 'cLocalidadeIncid'),
    xLocalidadeIncid: requireText(node, 'xLocalidadeIncid'),
    ...optionalAssign('pRedutor', optionalNumber(node, 'pRedutor')),
    valores: parseRtcValoresIbsCbs(requireChild(node, 'valores')),
    totCIBS: parseRtcTotalCIbs(requireChild(node, 'totCIBS')),
  };
}

function parseRtcValoresIbsCbs(node: XmlObject): RtcValoresIbsCbsNt004 {
  return {
    vBC: coerceNumber(requireText(node, 'vBC')),
    ...optionalAssign('vCalcReeRepRes', optionalNumber(node, 'vCalcReeRepRes')),
    uf: parseRtcValoresIbsCbsUF(requireChild(node, 'uf')),
    mun: parseRtcValoresIbsCbsMun(requireChild(node, 'mun')),
    fed: parseRtcValoresIbsCbsFed(requireChild(node, 'fed')),
  };
}

function parseRtcValoresIbsCbsUF(node: XmlObject): RtcValoresIbsCbsUF {
  return {
    pIBSUF: coerceNumber(requireText(node, 'pIBSUF')),
    ...optionalAssign('pRedAliqUF', optionalNumber(node, 'pRedAliqUF')),
    pAliqEfetUF: coerceNumber(requireText(node, 'pAliqEfetUF')),
  };
}

function parseRtcValoresIbsCbsMun(node: XmlObject): RtcValoresIbsCbsMun {
  return {
    pIBSMun: coerceNumber(requireText(node, 'pIBSMun')),
    ...optionalAssign('pRedAliqMun', optionalNumber(node, 'pRedAliqMun')),
    pAliqEfetMun: coerceNumber(requireText(node, 'pAliqEfetMun')),
  };
}

function parseRtcValoresIbsCbsFed(node: XmlObject): RtcValoresIbsCbsFed {
  return {
    pCBS: coerceNumber(requireText(node, 'pCBS')),
    ...optionalAssign('pRedAliqCBS', optionalNumber(node, 'pRedAliqCBS')),
    pAliqEfetCBS: coerceNumber(requireText(node, 'pAliqEfetCBS')),
  };
}

function parseRtcTotalCIbs(node: XmlObject): RtcTotalCIbsNt004 {
  return {
    vTotNF: coerceNumber(requireText(node, 'vTotNF')),
    gIBS: parseRtcTotalIbs(requireChild(node, 'gIBS')),
    gCBS: parseRtcTotalCbs(requireChild(node, 'gCBS')),
    ...optionalAssign(
      'gTribRegular',
      mapIfPresent(optionalChild(node, 'gTribRegular'), parseRtcTotalTribRegular),
    ),
    ...optionalAssign(
      'gTribCompraGov',
      mapIfPresent(optionalChild(node, 'gTribCompraGov'), parseRtcTotalTribCompraGov),
    ),
  };
}

function parseRtcTotalIbs(node: XmlObject): RtcTotalIbs {
  return {
    vIBSTot: coerceNumber(requireText(node, 'vIBSTot')),
    ...optionalAssign(
      'gIBSCredPres',
      mapIfPresent(optionalChild(node, 'gIBSCredPres'), parseRtcTotalIbsCredPres),
    ),
    gIBSUFTot: parseRtcTotalIbsUF(requireChild(node, 'gIBSUFTot')),
    gIBSMunTot: parseRtcTotalIbsMun(requireChild(node, 'gIBSMunTot')),
  };
}

function parseRtcTotalIbsCredPres(node: XmlObject): RtcTotalIbsCredPres {
  return {
    pCredPresIBS: coerceNumber(requireText(node, 'pCredPresIBS')),
    vCredPresIBS: coerceNumber(requireText(node, 'vCredPresIBS')),
  };
}

function parseRtcTotalIbsUF(node: XmlObject): RtcTotalIbsUF {
  return {
    ...optionalAssign('vDifUF', optionalNumber(node, 'vDifUF')),
    vIBSUF: coerceNumber(requireText(node, 'vIBSUF')),
  };
}

function parseRtcTotalIbsMun(node: XmlObject): RtcTotalIbsMun {
  return {
    ...optionalAssign('vDifMun', optionalNumber(node, 'vDifMun')),
    vIBSMun: coerceNumber(requireText(node, 'vIBSMun')),
  };
}

function parseRtcTotalCbs(node: XmlObject): RtcTotalCbs {
  return {
    ...optionalAssign(
      'gCBSCredPres',
      mapIfPresent(optionalChild(node, 'gCBSCredPres'), parseRtcTotalCbsCredPres),
    ),
    ...optionalAssign('vDifCBS', optionalNumber(node, 'vDifCBS')),
    vCBS: coerceNumber(requireText(node, 'vCBS')),
  };
}

function parseRtcTotalCbsCredPres(node: XmlObject): RtcTotalCbsCredPres {
  return {
    pCredPresCBS: coerceNumber(requireText(node, 'pCredPresCBS')),
    vCredPresCBS: coerceNumber(requireText(node, 'vCredPresCBS')),
  };
}

function parseRtcTotalTribRegular(node: XmlObject): RtcTotalTribRegular {
  return {
    pAliqEfeRegIBSUF: coerceNumber(requireText(node, 'pAliqEfeRegIBSUF')),
    vTribRegIBSUF: coerceNumber(requireText(node, 'vTribRegIBSUF')),
    pAliqEfeRegIBSMun: coerceNumber(requireText(node, 'pAliqEfeRegIBSMun')),
    vTribRegIBSMun: coerceNumber(requireText(node, 'vTribRegIBSMun')),
    pAliqEfeRegCBS: coerceNumber(requireText(node, 'pAliqEfeRegCBS')),
    vTribRegCBS: coerceNumber(requireText(node, 'vTribRegCBS')),
  };
}

function parseRtcTotalTribCompraGov(node: XmlObject): RtcTotalTribCompraGov {
  return {
    pIBSUF: coerceNumber(requireText(node, 'pIBSUF')),
    vIBSUF: coerceNumber(requireText(node, 'vIBSUF')),
    pIBSMun: coerceNumber(requireText(node, 'pIBSMun')),
    vIBSMun: coerceNumber(requireText(node, 'vIBSMun')),
    pCBS: coerceNumber(requireText(node, 'pCBS')),
    vCBS: coerceNumber(requireText(node, 'vCBS')),
  };
}

function warnForeignIbsCbsNt004(ibscbs: XmlObject | undefined, ctx: ParseContext): void {
  if (ibscbs) warnForeignFields(ibscbs, ['bensMoveis'], ctx);
}

// ---------------------------------------------------------------------------
// Layout nt009 (NT 009 release 1) — espelha os walkers `build*Nt009` de build-xml.ts.
// ---------------------------------------------------------------------------

function parseDpsNt009(node: XmlObject, ctx: ParseContext): DpsNt009 {
  const sig = optionalChild(node, 'Signature');
  return {
    layout: 'nt009',
    versao: requireAttr(node, 'versao'),
    infDPS: parseInfDPSNt009(requireChild(node, 'infDPS'), ctx),
    ...optionalAssign('signature', sig ? parseSignature(sig) : undefined),
  };
}

function parseInfDPSNt009(node: XmlObject, ctx: ParseContext): InfDPSNt009 {
  const valores = requireChild(node, 'valores');
  warnForeignFields(valores, ['vDedRed'], ctx);
  const ibscbs = optionalChild(node, 'IBSCBS');
  const ibscbsValores = ibscbs ? optionalChild(ibscbs, 'valores') : undefined;
  if (ibscbsValores) warnForeignFields(ibscbsValores, ['gReeRepRes'], ctx);
  return {
    Id: requireAttr(node, 'Id'),
    tpAmb: requireText(node, 'tpAmb') as TipoAmbienteDps,
    dhEmi: coerceDate(requireText(node, 'dhEmi')),
    verAplic: requireText(node, 'verAplic'),
    serie: requireText(node, 'serie'),
    nDPS: requireText(node, 'nDPS'),
    dCompet: coerceDateOnly(requireText(node, 'dCompet')),
    tpEmit: requireText(node, 'tpEmit') as TipoEmitenteDps,
    ...optionalAssign(
      'cMotivoEmisTI',
      optionalText(node, 'cMotivoEmisTI') as MotivoEmissaoTomadorIntermediario | undefined,
    ),
    finNFSe: requireText(node, 'finNFSe') as FinalidadeNFSe,
    ...optionalAssign('chNFSeRej', optionalText(node, 'chNFSeRej')),
    cLocEmi: requireText(node, 'cLocEmi'),
    ...optionalAssign('subst', mapIfPresent(optionalChild(node, 'subst'), parseSubstituicao)),
    prest: parseInfoPrestador(requireChild(node, 'prest')),
    ...optionalAssign('toma', mapIfPresent(optionalChild(node, 'toma'), parseInfoPessoaNt009)),
    ...optionalAssign('interm', mapIfPresent(optionalChild(node, 'interm'), parseInfoPessoaNt009)),
    serv: parseServ(requireChild(node, 'serv')),
    valores: parseInfoValoresNt009(valores),
    ...optionalAssign(
      'IBSCBS',
      mapIfPresent(optionalChild(node, 'IBSCBS'), parseRtcInfoIbsCbsNt009),
    ),
  };
}

function parseInfoPessoaNt009(node: XmlObject): InfoPessoaNt009 {
  return {
    identificador: parseIdentificador(node),
    ...optionalAssign('CAEPF', optionalText(node, 'CAEPF')),
    ...optionalAssign('IM', optionalText(node, 'IM')),
    ...optionalAssign('xNome', optionalText(node, 'xNome')),
    ...optionalAssign('end', mapIfPresent(optionalChild(node, 'end'), parseEndereco)),
    ...optionalAssign('fone', optionalText(node, 'fone')),
    ...optionalAssign('email', optionalText(node, 'email')),
  };
}

function parseInfoValoresNt009(node: XmlObject): InfoValoresNt009 {
  return {
    vServPrest: parseVServPrest(requireChild(node, 'vServPrest')),
    ...optionalAssign(
      'vDescCondIncond',
      mapIfPresent(optionalChild(node, 'vDescCondIncond'), parseVDescCondIncond),
    ),
    ...optionalAssign(
      'vAjusteBC',
      mapIfPresent(optionalChild(node, 'vAjusteBC'), parseInfoAjusteBCNt009),
    ),
    trib: parseInfoTributacao(requireChild(node, 'trib')),
  };
}

function parseInfoAjusteBCNt009(node: XmlObject): InfoAjusteBCNt009 {
  const ajusteIssqn = parseAjusteBCIssqnNt009(node);
  const docs = mapIfPresent(optionalChild(node, 'documentos'), (d) =>
    asArray(d.docAjusteBC).map((entry) => {
      if (!isObject(entry)) throw new InvalidXmlError('docAjusteBC não é um elemento');
      return parseDocAjusteBCNt009(entry);
    }),
  );
  return {
    ...optionalAssign('ajusteIssqn', ajusteIssqn),
    ...optionalAssign('documentos', docs && docs.length > 0 ? { docAjusteBC: docs } : undefined),
  };
}

function parseAjusteBCIssqnNt009(node: XmlObject): AjusteBCIssqnNt009 | undefined {
  const p = optionalNumber(node, 'pAjusteBCISSQN');
  if (p !== undefined) return { pAjusteBCISSQN: p };
  const v = optionalNumber(node, 'vAjusteBCISSQN');
  if (v !== undefined) return { vAjusteBCISSQN: v };
  return undefined;
}

function parseDocAjusteBCNt009(node: XmlObject): DocAjusteBCNt009 {
  const dtEmiDoc = optionalText(node, 'dtEmiDoc');
  const dtCompDoc = optionalText(node, 'dtCompDoc');
  return {
    tpAjusteBC: requireText(node, 'tpAjusteBC') as TipoAjusteBC,
    ...optionalAssign('xTpAjusteBC', optionalText(node, 'xTpAjusteBC')),
    vTotDoc: coerceNumber(requireText(node, 'vTotDoc')),
    vAjusteAplic: coerceNumber(requireText(node, 'vAjusteAplic')),
    ...optionalAssign('dtEmiDoc', dtEmiDoc !== undefined ? coerceDateOnly(dtEmiDoc) : undefined),
    ...optionalAssign('dtCompDoc', dtCompDoc !== undefined ? coerceDateOnly(dtCompDoc) : undefined),
    documento: parseRtcDocumentoReferenciado(node),
    ...optionalAssign('fornec', mapIfPresent(optionalChild(node, 'fornec'), parseInfoPessoaNt009)),
  };
}

function parseRtcInfoIbsCbsNt009(node: XmlObject): RtcInfoIbsCbsNt009 {
  const bensMoveis = asArray(node.bensMoveis).map((entry) => {
    if (!isObject(entry)) throw new InvalidXmlError('bensMoveis não é um elemento');
    return parseRtcInfoBensMoveisNt009(entry);
  });
  return {
    ...optionalAssign('indFinal', optionalText(node, 'indFinal') as IndicadorFinal | undefined),
    ...optionalAssign('cIndOp', optionalText(node, 'cIndOp')),
    ...optionalAssign('tpOper', optionalText(node, 'tpOper') as TipoOperacao | undefined),
    ...optionalAssign('gRefNFSe', mapIfPresent(optionalChild(node, 'gRefNFSe'), parseInfoRefNFSe)),
    ...optionalAssign(
      'tpEnteGov',
      optionalText(node, 'tpEnteGov') as TipoEnteGovernamental | undefined,
    ),
    indDest: requireText(node, 'indDest') as IndicadorDestinatario,
    ...optionalAssign('dest', mapIfPresent(optionalChild(node, 'dest'), parseRtcInfoDest)),
    ...optionalAssign(
      'imovel',
      mapIfPresent(optionalChild(node, 'imovel'), parseRtcInfoImovelNt009),
    ),
    ...optionalAssign('bensMoveis', bensMoveis.length > 0 ? bensMoveis : undefined),
    valores: parseRtcInfoValoresIbsCbsNt009(requireChild(node, 'valores')),
  };
}

function parseRtcInfoBensMoveisNt009(node: XmlObject): RtcInfoBensMoveisNt009 {
  return {
    cNCMBemMovel: requireText(node, 'cNCMBemMovel'),
    xNCMBemMovel: requireText(node, 'xNCMBemMovel'),
    qtdNCMBemMovel: requireText(node, 'qtdNCMBemMovel'),
  };
}

function parseRtcInfoImovelNt009(node: XmlObject): RtcInfoImovelNt009 {
  const unidades = asArray(node.gUnidImob).map((entry) => {
    if (!isObject(entry)) throw new InvalidXmlError('gUnidImob não é um elemento');
    return parseRtcUnidadeImobiliariaNt009(entry);
  });
  return {
    cMun: requireText(node, 'cMun'),
    ...optionalAssign(
      'gLocacao',
      mapIfPresent(optionalChild(node, 'gLocacao'), parseRtcLocacaoImovelNt009),
    ),
    ...optionalAssign('gUnidImob', unidades.length > 0 ? unidades : undefined),
  };
}

function parseRtcLocacaoImovelNt009(node: XmlObject): RtcLocacaoImovelNt009 {
  const dVencOrig = optionalText(node, 'dVencOrig');
  return {
    pCopropriedade: coerceNumber(requireText(node, 'pCopropriedade')),
    vTotOper: coerceNumber(requireText(node, 'vTotOper')),
    ...optionalAssign('vDescIncondTot', optionalNumber(node, 'vDescIncondTot')),
    ...optionalAssign('vDescCondTot', optionalNumber(node, 'vDescCondTot')),
    ...optionalAssign('dVencOrig', dVencOrig !== undefined ? coerceDateOnly(dVencOrig) : undefined),
  };
}

function parseRtcUnidadeImobiliariaNt009(node: XmlObject): RtcUnidadeImobiliariaNt009 {
  const ajustes = asArray(node.gAjusteBCLocImoveis).map((entry) => {
    if (!isObject(entry)) throw new InvalidXmlError('gAjusteBCLocImoveis não é um elemento');
    return parseRtcValoresBCImoveisNt009(entry);
  });
  return {
    ...optionalAssign('inscImobFisc', optionalText(node, 'inscImobFisc')),
    identificacao: parseUnidadeImobiliariaIdentificacaoNt009(node),
    ...optionalAssign('gAjusteBCLocImoveis', ajustes.length > 0 ? ajustes : undefined),
  };
}

function parseUnidadeImobiliariaIdentificacaoNt009(
  node: XmlObject,
): UnidadeImobiliariaIdentificacaoNt009 {
  const cCIB = optionalText(node, 'cCIB');
  if (cCIB !== undefined) return { cCIB };
  const end = optionalChild(node, 'end');
  if (end) return { end: parseEnderImovelNt009(end) };
  throw new InvalidXmlError('gUnidImob sem cCIB nem end');
}

function parseEnderImovelNt009(node: XmlObject): EnderImovelNt009 {
  return {
    CEP: requireText(node, 'CEP'),
    xLgr: requireText(node, 'xLgr'),
    nro: requireText(node, 'nro'),
    ...optionalAssign('xCpl', optionalText(node, 'xCpl')),
    ...optionalAssign('xBairro', optionalText(node, 'xBairro')),
  };
}

function parseRtcValoresBCImoveisNt009(node: XmlObject): RtcValoresBCImoveisNt009 {
  return {
    tpAjusteBCLocImoveis: requireText(node, 'tpAjusteBCLocImoveis') as TipoAjusteBCLocImoveis,
    ...optionalAssign('xTpAjusteBCLocImoveis', optionalText(node, 'xTpAjusteBCLocImoveis')),
    vAjusteBCLocImoveis: coerceNumber(requireText(node, 'vAjusteBCLocImoveis')),
  };
}

function parseRtcInfoValoresIbsCbsNt009(node: XmlObject): RtcInfoValoresIbsCbsNt009 {
  return { trib: parseRtcInfoTribIbsCbsNt009(requireChild(node, 'trib')) };
}

function parseRtcInfoTribIbsCbsNt009(node: XmlObject): RtcInfoTribIbsCbsNt009 {
  return {
    CST: requireText(node, 'CST'),
    cClassTrib: requireText(node, 'cClassTrib'),
    ...optionalAssign(
      'gIBSCBS',
      mapIfPresent(optionalChild(node, 'gIBSCBS'), parseRtcInfoTributosSitClasNt009),
    ),
  };
}

function parseRtcInfoTributosSitClasNt009(node: XmlObject): RtcInfoTributosSitClasNt009 {
  return {
    ...optionalAssign('cCredPres', optionalText(node, 'cCredPres')),
    ...optionalAssign(
      'gTribRegular',
      mapIfPresent(optionalChild(node, 'gTribRegular'), parseRtcInfoTributosTribRegular),
    ),
    ...optionalAssign('gDif', mapIfPresent(optionalChild(node, 'gDif'), parseRtcInfoTributosDif)),
  };
}

function parseValoresNFSeNt009(node: XmlObject): ValoresNFSeNt009 {
  return {
    ...optionalAssign('vCalcAjusteBCISSQN', optionalNumber(node, 'vCalcAjusteBCISSQN')),
    ...optionalAssign('tpBM', optionalText(node, 'tpBM') as TipoBeneficioMunicipal | undefined),
    ...optionalAssign('vCalcBM', optionalNumber(node, 'vCalcBM')),
    ...optionalAssign('vBC', optionalNumber(node, 'vBC')),
    ...optionalAssign('pAliqAplic', optionalNumber(node, 'pAliqAplic')),
    ...optionalAssign('vISSQN', optionalNumber(node, 'vISSQN')),
    ...optionalAssign('vTotalRet', optionalNumber(node, 'vTotalRet')),
    vLiq: coerceNumber(requireText(node, 'vLiq')),
  };
}

function parseRtcIbsCbsNt009(node: XmlObject): RtcIbsCbsNt009 {
  return {
    ...optionalAssign('cLocalidadeIncid', optionalText(node, 'cLocalidadeIncid')),
    ...optionalAssign('xLocalidadeIncid', optionalText(node, 'xLocalidadeIncid')),
    ...optionalAssign('pRedutor', optionalNumber(node, 'pRedutor')),
    ...optionalAssign(
      'valores',
      mapIfPresent(optionalChild(node, 'valores'), parseRtcValoresIbsCbsNt009),
    ),
    totCIBS: parseRtcTotalCIbsNt009(requireChild(node, 'totCIBS')),
  };
}

function parseRtcValoresIbsCbsNt009(node: XmlObject): RtcValoresIbsCbsNt009 {
  return {
    ...optionalAssign('vBC', optionalNumber(node, 'vBC')),
    ...optionalAssign('vCalcAjusteBCLocImoveis', optionalNumber(node, 'vCalcAjusteBCLocImoveis')),
    ...optionalAssign('vCalcAjusteBCIBSCBS', optionalNumber(node, 'vCalcAjusteBCIBSCBS')),
    uf: parseRtcValoresIbsCbsUF(requireChild(node, 'uf')),
    mun: parseRtcValoresIbsCbsMun(requireChild(node, 'mun')),
    fed: parseRtcValoresIbsCbsFed(requireChild(node, 'fed')),
  };
}

function parseRtcTotalCIbsNt009(node: XmlObject): RtcTotalCIbsNt009 {
  return {
    vTotNF: coerceNumber(requireText(node, 'vTotNF')),
    ...optionalAssign('gIBS', mapIfPresent(optionalChild(node, 'gIBS'), parseRtcTotalIbs)),
    ...optionalAssign('gCBS', mapIfPresent(optionalChild(node, 'gCBS'), parseRtcTotalCbs)),
    ...optionalAssign(
      'gTribRegular',
      mapIfPresent(optionalChild(node, 'gTribRegular'), parseRtcTotalTribRegular),
    ),
    ...optionalAssign(
      'gTribCompraGov',
      mapIfPresent(optionalChild(node, 'gTribCompraGov'), parseRtcTotalTribCompraGov),
    ),
  };
}

function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value as T];
}

function parseSignature(node: XmlObject): Signature {
  const signedInfo = requireChild(node, 'SignedInfo');
  const reference = requireChild(signedInfo, 'Reference');
  const keyInfo = requireChild(node, 'KeyInfo');
  const x509Data = requireChild(keyInfo, 'X509Data');
  return {
    signatureValue: requireText(node, 'SignatureValue').trim(),
    digestValue: requireText(reference, 'DigestValue').trim(),
    x509Certificate: requireText(x509Data, 'X509Certificate').trim(),
    referenceUri: requireAttr(reference, 'URI'),
  };
}

function parseIdentificador(node: XmlObject): IdentificadorPessoa {
  const cnpj = optionalText(node, 'CNPJ');
  if (cnpj !== undefined) return { CNPJ: cnpj };
  const cpf = optionalText(node, 'CPF');
  if (cpf !== undefined) return { CPF: cpf };
  const nif = optionalText(node, 'NIF');
  if (nif !== undefined) return { NIF: nif };
  const cNaoNIF = optionalText(node, 'cNaoNIF');
  if (cNaoNIF !== undefined) return { cNaoNIF: cNaoNIF as CodigoNaoNif };
  throw new InvalidXmlError('identificador ausente (CNPJ/CPF/NIF/cNaoNIF)');
}

/**
 * Identificação do emitente: `TCEmitente` admite apenas `CNPJ` ou `CPF`
 * (sem `NIF`/`cNaoNIF`), por isso não reutiliza {@link parseIdentificador}.
 */
function parseIdentificadorEmitente(node: XmlObject): IdentificadorEmitente {
  const cnpj = optionalText(node, 'CNPJ');
  if (cnpj !== undefined) return { CNPJ: cnpj };
  const cpf = optionalText(node, 'CPF');
  if (cpf !== undefined) return { CPF: cpf };
  throw new InvalidXmlError('identificador do emitente ausente (CNPJ/CPF)');
}

function isObject(value: unknown): value is XmlObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireAttr(node: XmlObject, name: string): string {
  const value = node[`${ATTR_PREFIX}${name}`];
  if (typeof value !== 'string') {
    throw new InvalidXmlError(`atributo @${name} ausente`);
  }
  return value;
}

function requireChild(node: XmlObject, name: string): XmlObject {
  const child = node[name];
  if (!isObject(child)) {
    throw new InvalidXmlError(`elemento <${name}> ausente`);
  }
  return child;
}

function optionalChild(node: XmlObject, name: string): XmlObject | undefined {
  const child = node[name];
  return isObject(child) ? child : undefined;
}

function requireText(node: XmlObject, name: string): string {
  const value = node[name];
  if (typeof value !== 'string') {
    throw new InvalidXmlError(`elemento <${name}> ausente ou não textual`);
  }
  return value;
}

function optionalText(node: XmlObject, name: string): string | undefined {
  const value = node[name];
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(node: XmlObject, name: string): number | undefined {
  const value = optionalText(node, name);
  return value !== undefined ? coerceNumber(value) : undefined;
}

function coerceNumber(value: string): number {
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new InvalidXmlError(`valor não numérico: "${value}"`);
  }
  return n;
}

function coerceDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidXmlError(`valor não é data válida: "${value}"`);
  }
  return d;
}

/**
 * Campos **date-only** (`TSData`, `YYYY-MM-DD`: `dCompet`, `dtEmiDoc`, `dtCompDoc`,
 * `dtIni`, `dtFim`) são ancorados na meia-noite de **Brasília (-03:00)**,
 * espelhando a escrita (`build-xml` aplica `toBrt` antes de fatiar a data). Sem
 * isso, `new Date('2026-03-03')` cairia na meia-noite **UTC** e, lido com
 * acessores locais em fuso BR (UTC-3), retornaria o **dia anterior** (off-by-one)
 * — e o round-trip build→parse não seria estável. Não usar para datetime
 * (`dhEmi`/`dhProc`), que já carregam offset explícito → `coerceDate`.
 */
function coerceDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) {
    // Não é date-only puro (datetime/edge) — delega ao parser geral.
    return coerceDate(value);
  }
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00-03:00`);
  if (Number.isNaN(d.getTime())) {
    throw new InvalidXmlError(`valor não é data válida: "${value}"`);
  }
  return d;
}

function mapIfPresent<T>(node: XmlObject | undefined, fn: (n: XmlObject) => T): T | undefined {
  return node ? fn(node) : undefined;
}

function optionalAssign<K extends string, V>(
  key: K,
  value: V | undefined,
): { readonly [P in K]?: V } {
  return value === undefined
    ? ({} as { readonly [P in K]?: V })
    : ({ [key]: value } as { readonly [P in K]: V });
}
