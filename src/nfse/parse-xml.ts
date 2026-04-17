import { InvalidXmlError } from '../errors/validation.js';
import { ATTR_PREFIX, type XmlObject, parseXml } from '../xml/parser.js';
import type {
  AtvEvento,
  AtvEventoIdentificacao,
  BeneficioMunicipal,
  CServ,
  ComExterior,
  DPS,
  DocDedRed,
  DocNFNFS,
  DocOutNFSe,
  Emitente,
  EnderObraEvento,
  Endereco,
  EnderecoEmitente,
  EnderecoSimples,
  ExigSuspensa,
  ExploracaoRodoviaria,
  IdentificadorPessoa,
  ImovelIdentificacao,
  InfDPS,
  InfNFSe,
  InfoCompl,
  InfoDedRed,
  InfoItemPed,
  InfoObra,
  InfoObraIdentificacao,
  InfoPessoa,
  InfoPrestador,
  InfoRefNFSe,
  InfoTributacao,
  InfoValores,
  ListaDocDedRed,
  LocPrest,
  LocacaoSublocacao,
  NFSe,
  ReferenciaDocDedRed,
  RegTrib,
  RtcDocumentoReferenciado,
  RtcIbsCbs,
  RtcInfoDest,
  RtcInfoIbsCbs,
  RtcInfoImovel,
  RtcInfoReeRepRes,
  RtcInfoTributosDif,
  RtcInfoTributosIbsCbs,
  RtcInfoTributosSitClas,
  RtcInfoTributosTribRegular,
  RtcInfoValoresIbsCbs,
  RtcListaDoc,
  RtcListaDocDFe,
  RtcListaDocFiscalOutro,
  RtcListaDocFornec,
  RtcListaDocOutro,
  RtcTotalCIbs,
  RtcTotalCbs,
  RtcTotalCbsCredPres,
  RtcTotalIbs,
  RtcTotalIbsCredPres,
  RtcTotalIbsMun,
  RtcTotalIbsUF,
  RtcTotalTribCompraGov,
  RtcTotalTribRegular,
  RtcValoresIbsCbs,
  RtcValoresIbsCbsFed,
  RtcValoresIbsCbsMun,
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
  VDescCondIncond,
  VServPrest,
  ValoresNFSe,
} from './domain.js';
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

export function parseNfseXml(xml: string): NFSe {
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
  return parseNFSe(root);
}

function parseNFSe(node: XmlObject): NFSe {
  return {
    versao: requireAttr(node, 'versao'),
    infNFSe: parseInfNFSe(requireChild(node, 'infNFSe')),
    signature: parseSignature(requireChild(node, 'Signature')),
  };
}

function parseInfNFSe(node: XmlObject): InfNFSe {
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
    cStat: requireText(node, 'cStat'),
    dhProc: coerceDate(requireText(node, 'dhProc')),
    nDFSe: requireText(node, 'nDFSe'),
    emit: parseEmitente(requireChild(node, 'emit')),
    valores: parseValoresNFSe(requireChild(node, 'valores')),
    ...optionalAssign('IBSCBS', mapIfPresent(optionalChild(node, 'IBSCBS'), parseRtcIbsCbs)),
    DPS: parseDPS(requireChild(node, 'DPS')),
  };
}

function parseEmitente(node: XmlObject): Emitente {
  return {
    identificador: parseIdentificador(node),
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

function parseValoresNFSe(node: XmlObject): ValoresNFSe {
  return {
    ...optionalAssign('vCalcDR', optionalNumber(node, 'vCalcDR')),
    ...optionalAssign('tpBM', optionalText(node, 'tpBM') as TipoBeneficioMunicipal | undefined),
    ...optionalAssign('vCalcBM', optionalNumber(node, 'vCalcBM')),
    ...optionalAssign('vBC', optionalNumber(node, 'vBC')),
    ...optionalAssign('pAliqAplic', optionalNumber(node, 'pAliqAplic')),
    ...optionalAssign('vISSQN', optionalNumber(node, 'vISSQN')),
    ...optionalAssign('vTotalRet', optionalNumber(node, 'vTotalRet')),
    vLiq: coerceNumber(requireText(node, 'vLiq')),
    ...optionalAssign('xOutInf', optionalText(node, 'xOutInf')),
  };
}

function parseDPS(node: XmlObject): DPS {
  const sig = optionalChild(node, 'Signature');
  return {
    versao: requireAttr(node, 'versao'),
    infDPS: parseInfDPS(requireChild(node, 'infDPS')),
    ...optionalAssign('signature', sig ? parseSignature(sig) : undefined),
  };
}

function parseInfDPS(node: XmlObject): InfDPS {
  return {
    Id: requireAttr(node, 'Id'),
    tpAmb: requireText(node, 'tpAmb') as TipoAmbienteDps,
    dhEmi: coerceDate(requireText(node, 'dhEmi')),
    verAplic: requireText(node, 'verAplic'),
    serie: requireText(node, 'serie'),
    nDPS: requireText(node, 'nDPS'),
    dCompet: coerceDate(requireText(node, 'dCompet')),
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
    valores: parseInfoValores(requireChild(node, 'valores')),
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

function parseRtcInfoIbsCbs(node: XmlObject): RtcInfoIbsCbs {
  return {
    finNFSe: requireText(node, 'finNFSe') as FinalidadeNFSe,
    indFinal: requireText(node, 'indFinal') as IndicadorFinal,
    cIndOp: requireText(node, 'cIndOp'),
    ...optionalAssign('tpOper', optionalText(node, 'tpOper') as TipoOperacao | undefined),
    ...optionalAssign('gRefNFSe', mapIfPresent(optionalChild(node, 'gRefNFSe'), parseInfoRefNFSe)),
    ...optionalAssign('tpEnteGov', optionalText(node, 'tpEnteGov')),
    indDest: requireText(node, 'indDest'),
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

function parseRtcInfoImovel(node: XmlObject): RtcInfoImovel {
  return {
    ...optionalAssign('inscImobFisc', optionalText(node, 'inscImobFisc')),
    identificacao: parseImovelIdentificacao(node),
  };
}

function parseImovelIdentificacao(node: XmlObject): ImovelIdentificacao {
  const cCIB = optionalText(node, 'cCIB');
  if (cCIB !== undefined) return { cCIB };
  const end = optionalChild(node, 'end');
  if (end) return { end: parseEnderObraEvento(end) };
  throw new InvalidXmlError('imovel sem cCIB nem end');
}

function parseRtcInfoValoresIbsCbs(node: XmlObject): RtcInfoValoresIbsCbs {
  return {
    ...optionalAssign(
      'gReeRepRes',
      mapIfPresent(optionalChild(node, 'gReeRepRes'), parseRtcInfoReeRepRes),
    ),
    trib: parseRtcInfoTributosIbsCbs(requireChild(node, 'trib')),
  };
}

function parseRtcInfoReeRepRes(node: XmlObject): RtcInfoReeRepRes {
  return {
    documentos: asArray(node.documentos).map((entry) => {
      if (!isObject(entry)) throw new InvalidXmlError('documentos entry inválida');
      return parseRtcListaDoc(entry);
    }),
  };
}

function parseRtcListaDoc(node: XmlObject): RtcListaDoc {
  return {
    documento: parseRtcDocumentoReferenciado(node),
    ...optionalAssign(
      'fornec',
      mapIfPresent(optionalChild(node, 'fornec'), parseRtcListaDocFornec),
    ),
    dtEmiDoc: coerceDate(requireText(node, 'dtEmiDoc')),
    dtCompDoc: coerceDate(requireText(node, 'dtCompDoc')),
    tpReeRepRes: requireText(node, 'tpReeRepRes'),
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
    tipoChaveDFe: requireText(node, 'tipoChaveDFe'),
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

function parseRtcInfoTributosIbsCbs(node: XmlObject): RtcInfoTributosIbsCbs {
  return {
    gIBSCBS: parseRtcInfoTributosSitClas(requireChild(node, 'gIBSCBS')),
  };
}

function parseRtcInfoTributosSitClas(node: XmlObject): RtcInfoTributosSitClas {
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

function parseInfoPessoa(node: XmlObject): InfoPessoa {
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
    localidade = {
      endExt: {
        cPais: requireText(endExt, 'cPais'),
        cEndPost: requireText(endExt, 'cEndPost'),
        xCidade: requireText(endExt, 'xCidade'),
        xEstProvReg: requireText(endExt, 'xEstProvReg'),
      },
    };
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
    ...optionalAssign(
      'lsadppu',
      mapIfPresent(optionalChild(node, 'lsadppu'), parseLocacaoSublocacao),
    ),
    ...optionalAssign('obra', mapIfPresent(optionalChild(node, 'obra'), parseInfoObra)),
    ...optionalAssign('atvEvento', mapIfPresent(optionalChild(node, 'atvEvento'), parseAtvEvento)),
    ...optionalAssign(
      'explRod',
      mapIfPresent(optionalChild(node, 'explRod'), parseExploracaoRodoviaria),
    ),
    ...optionalAssign('infoCompl', mapIfPresent(optionalChild(node, 'infoCompl'), parseInfoCompl)),
  };
}

function parseComExterior(node: XmlObject): ComExterior {
  return {
    mdPrestacao: requireText(node, 'mdPrestacao') as ModoPrestacao,
    vincPrest: requireText(node, 'vincPrest') as VinculoPrestacao,
    tpMoeda: requireText(node, 'tpMoeda'),
    vServMoeda: coerceNumber(requireText(node, 'vServMoeda')),
    mecAFComexP: requireText(node, 'mecAFComexP'),
    mecAFComexT: requireText(node, 'mecAFComexT'),
    movTempBens: requireText(node, 'movTempBens') as MovimentacaoTemporariaBens,
    ...optionalAssign('nDI', optionalText(node, 'nDI')),
    ...optionalAssign('nRE', optionalText(node, 'nRE')),
    mdic: requireText(node, 'mdic') as EnvioMDIC,
  };
}

function parseExploracaoRodoviaria(node: XmlObject): ExploracaoRodoviaria {
  return {
    categVeic: requireText(node, 'categVeic'),
    nEixos: requireText(node, 'nEixos'),
    rodagem: requireText(node, 'rodagem'),
    sentido: requireText(node, 'sentido'),
    placa: requireText(node, 'placa'),
    codAcessoPed: requireText(node, 'codAcessoPed'),
    codContrato: requireText(node, 'codContrato'),
  };
}

function parseLocacaoSublocacao(node: XmlObject): LocacaoSublocacao {
  return {
    categ: requireText(node, 'categ'),
    objeto: requireText(node, 'objeto') as ObjetoLocacao,
    extensao: requireText(node, 'extensao'),
    nPostes: requireText(node, 'nPostes'),
  };
}

function parseAtvEvento(node: XmlObject): AtvEvento {
  return {
    xNome: requireText(node, 'xNome'),
    dtIni: coerceDate(requireText(node, 'dtIni')),
    dtFim: coerceDate(requireText(node, 'dtFim')),
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

function parseEnderecoSimples(node: XmlObject): EnderecoSimples {
  return {
    ...optionalAssign('CEP', optionalText(node, 'CEP')),
    ...optionalAssign(
      'endExt',
      mapIfPresent(optionalChild(node, 'endExt'), (n) => ({
        cPais: requireText(n, 'cPais'),
        cEndPost: requireText(n, 'cEndPost'),
        xCidade: requireText(n, 'xCidade'),
        xEstProvReg: requireText(n, 'xEstProvReg'),
      })),
    ),
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

function parseInfoValores(node: XmlObject): InfoValores {
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

function parseInfoDedRed(node: XmlObject): InfoDedRed {
  const pDR = optionalNumber(node, 'pDR');
  if (pDR !== undefined) return { pDR };
  const vDR = optionalNumber(node, 'vDR');
  if (vDR !== undefined) return { vDR };
  const documentos = optionalChild(node, 'documentos');
  if (documentos) return { documentos: parseListaDocDedRed(documentos) };
  throw new InvalidXmlError('vDedRed sem pDR, vDR ou documentos');
}

function parseListaDocDedRed(node: XmlObject): ListaDocDedRed {
  return {
    docDedRed: asArray(node.docDedRed).map((entry) => {
      if (!isObject(entry)) {
        throw new InvalidXmlError('docDedRed não é um elemento');
      }
      return parseDocDedRed(entry);
    }),
  };
}

function parseDocDedRed(node: XmlObject): DocDedRed {
  return {
    referencia: parseReferenciaDocDedRed(node),
    tpDedRed: requireText(node, 'tpDedRed') as TipoDedRed,
    ...optionalAssign('xDescOutDed', optionalText(node, 'xDescOutDed')),
    dtEmiDoc: coerceDate(requireText(node, 'dtEmiDoc')),
    vDedutivelRedutivel: coerceNumber(requireText(node, 'vDedutivelRedutivel')),
    vDeducaoReducao: coerceNumber(requireText(node, 'vDeducaoReducao')),
    ...optionalAssign('fornec', mapIfPresent(optionalChild(node, 'fornec'), parseInfoPessoa)),
  };
}

function parseReferenciaDocDedRed(node: XmlObject): ReferenciaDocDedRed {
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

function parseDocOutNFSe(node: XmlObject): DocOutNFSe {
  return {
    cMunNFSeMun: requireText(node, 'cMunNFSeMun'),
    nNFSeMun: requireText(node, 'nNFSeMun'),
    cVerifNFSeMun: requireText(node, 'cVerifNFSeMun'),
  };
}

function parseDocNFNFS(node: XmlObject): DocNFNFS {
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
  return {
    nBM: requireText(node, 'nBM'),
    ...optionalAssign('vRedBCBM', optionalNumber(node, 'vRedBCBM')),
    ...optionalAssign('pRedBCBM', optionalNumber(node, 'pRedBCBM')),
  };
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

function parseRtcIbsCbs(node: XmlObject): RtcIbsCbs {
  return {
    cLocalidadeIncid: requireText(node, 'cLocalidadeIncid'),
    xLocalidadeIncid: requireText(node, 'xLocalidadeIncid'),
    pRedutor: coerceNumber(requireText(node, 'pRedutor')),
    valores: parseRtcValoresIbsCbs(requireChild(node, 'valores')),
    totCIBS: parseRtcTotalCIbs(requireChild(node, 'totCIBS')),
  };
}

function parseRtcValoresIbsCbs(node: XmlObject): RtcValoresIbsCbs {
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

function parseRtcTotalCIbs(node: XmlObject): RtcTotalCIbs {
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
    vDifUF: coerceNumber(requireText(node, 'vDifUF')),
    vIBSUF: coerceNumber(requireText(node, 'vIBSUF')),
  };
}

function parseRtcTotalIbsMun(node: XmlObject): RtcTotalIbsMun {
  return {
    vDifMun: coerceNumber(requireText(node, 'vDifMun')),
    vIBSMun: coerceNumber(requireText(node, 'vIBSMun')),
  };
}

function parseRtcTotalCbs(node: XmlObject): RtcTotalCbs {
  return {
    ...optionalAssign(
      'gCBSCredPres',
      mapIfPresent(optionalChild(node, 'gCBSCredPres'), parseRtcTotalCbsCredPres),
    ),
    vDifCBS: coerceNumber(requireText(node, 'vDifCBS')),
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
