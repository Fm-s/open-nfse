import { XMLBuilder } from 'fast-xml-parser';
import { ATTR_PREFIX } from '../xml/parser.js';
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
  EnderObraEvento,
  Endereco,
  EnderecoSimples,
  ExigSuspensa,
  ExploracaoRodoviaria,
  IdentificadorPessoa,
  ImovelIdentificacao,
  InfDPS,
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
  ReferenciaDocDedRed,
  RegTrib,
  RtcDocumentoReferenciado,
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
} from './domain.js';

const NFSE_NS = 'http://www.sped.fazenda.gov.br/nfse';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';

export interface BuildDpsXmlOptions {
  /** Emit the `<?xml ... ?>` declaration. Default `true`. */
  readonly includeXmlDeclaration?: boolean;
}

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  suppressEmptyNode: true,
  processEntities: true,
});

/**
 * Serializes a typed `DPS` DTO to canonical XML. Inverse of `parseNfseXml`'s
 * DPS branch. Element order and namespace declarations follow RTC v1.01.
 */
export function buildDpsXml(dps: DPS, options?: BuildDpsXmlOptions): string {
  const root = {
    DPS: {
      [`${ATTR_PREFIX}xmlns`]: NFSE_NS,
      [`${ATTR_PREFIX}versao`]: dps.versao,
      infDPS: buildInfDPS(dps.infDPS),
      ...onlyDefined('Signature', dps.signature ? buildSignature(dps.signature) : undefined),
    },
  };

  const body = xmlBuilder.build(root) as string;
  return options?.includeXmlDeclaration === false
    ? body
    : `<?xml version="1.0" encoding="UTF-8"?>${body}`;
}

function buildInfDPS(inf: InfDPS): object {
  return {
    [`${ATTR_PREFIX}Id`]: inf.Id,
    tpAmb: inf.tpAmb,
    dhEmi: formatDateTime(inf.dhEmi),
    verAplic: inf.verAplic,
    serie: inf.serie,
    nDPS: inf.nDPS,
    dCompet: formatDate(inf.dCompet),
    tpEmit: inf.tpEmit,
    ...onlyDefined('cMotivoEmisTI', inf.cMotivoEmisTI),
    ...onlyDefined('chNFSeRej', inf.chNFSeRej),
    cLocEmi: inf.cLocEmi,
    ...onlyDefined('subst', inf.subst && buildSubstituicao(inf.subst)),
    prest: buildInfoPrestador(inf.prest),
    ...onlyDefined('toma', inf.toma && buildInfoPessoa(inf.toma)),
    ...onlyDefined('interm', inf.interm && buildInfoPessoa(inf.interm)),
    serv: buildServ(inf.serv),
    valores: buildInfoValores(inf.valores),
    ...onlyDefined('IBSCBS', inf.IBSCBS && buildRtcInfoIbsCbs(inf.IBSCBS)),
  };
}

function buildSubstituicao(s: Substituicao): object {
  return {
    chSubstda: s.chSubstda,
    cMotivo: s.cMotivo,
    ...onlyDefined('xMotivo', s.xMotivo),
  };
}

function buildInfoPrestador(p: InfoPrestador): object {
  return {
    ...buildIdentificador(p.identificador),
    ...onlyDefined('CAEPF', p.CAEPF),
    ...onlyDefined('IM', p.IM),
    ...onlyDefined('xNome', p.xNome),
    ...onlyDefined('end', p.end && buildEndereco(p.end)),
    ...onlyDefined('fone', p.fone),
    ...onlyDefined('email', p.email),
    regTrib: buildRegTrib(p.regTrib),
  };
}

function buildInfoPessoa(p: InfoPessoa): object {
  return {
    ...buildIdentificador(p.identificador),
    ...onlyDefined('CAEPF', p.CAEPF),
    ...onlyDefined('IM', p.IM),
    xNome: p.xNome,
    ...onlyDefined('end', p.end && buildEndereco(p.end)),
    ...onlyDefined('fone', p.fone),
    ...onlyDefined('email', p.email),
  };
}

function buildIdentificador(id: IdentificadorPessoa): object {
  if ('CNPJ' in id) return { CNPJ: id.CNPJ };
  if ('CPF' in id) return { CPF: id.CPF };
  if ('NIF' in id) return { NIF: id.NIF };
  return { cNaoNIF: id.cNaoNIF };
}

function buildRegTrib(r: RegTrib): object {
  return {
    opSimpNac: r.opSimpNac,
    ...onlyDefined('regApTribSN', r.regApTribSN),
    regEspTrib: r.regEspTrib,
  };
}

function buildEndereco(e: Endereco): object {
  const localidade =
    'endNac' in e.localidade
      ? { endNac: { cMun: e.localidade.endNac.cMun, CEP: e.localidade.endNac.CEP } }
      : {
          endExt: {
            cPais: e.localidade.endExt.cPais,
            cEndPost: e.localidade.endExt.cEndPost,
            xCidade: e.localidade.endExt.xCidade,
            xEstProvReg: e.localidade.endExt.xEstProvReg,
          },
        };

  return {
    ...localidade,
    xLgr: e.xLgr,
    nro: e.nro,
    ...onlyDefined('xCpl', e.xCpl),
    xBairro: e.xBairro,
  };
}

function buildEnderecoSimples(e: EnderecoSimples): object {
  return {
    ...onlyDefined('CEP', e.CEP),
    ...onlyDefined(
      'endExt',
      e.endExt && {
        cPais: e.endExt.cPais,
        cEndPost: e.endExt.cEndPost,
        xCidade: e.endExt.xCidade,
        xEstProvReg: e.endExt.xEstProvReg,
      },
    ),
    xLgr: e.xLgr,
    nro: e.nro,
    ...onlyDefined('xCpl', e.xCpl),
    xBairro: e.xBairro,
  };
}

function buildEnderObraEvento(e: EnderObraEvento): object {
  return buildEnderecoSimples(e);
}

function buildServ(s: Serv): object {
  return {
    locPrest: buildLocPrest(s.locPrest),
    cServ: buildCServ(s.cServ),
    ...onlyDefined('comExt', s.comExt && buildComExterior(s.comExt)),
    ...onlyDefined('lsadppu', s.lsadppu && buildLocacaoSublocacao(s.lsadppu)),
    ...onlyDefined('obra', s.obra && buildInfoObra(s.obra)),
    ...onlyDefined('atvEvento', s.atvEvento && buildAtvEvento(s.atvEvento)),
    ...onlyDefined('explRod', s.explRod && buildExploracaoRodoviaria(s.explRod)),
    ...onlyDefined('infoCompl', s.infoCompl && buildInfoCompl(s.infoCompl)),
  };
}

function buildLocPrest(l: LocPrest): object {
  if ('cLocPrestacao' in l) return { cLocPrestacao: l.cLocPrestacao };
  return { cPaisPrestacao: l.cPaisPrestacao };
}

function buildCServ(c: CServ): object {
  return {
    cTribNac: c.cTribNac,
    ...onlyDefined('cTribMun', c.cTribMun),
    xDescServ: c.xDescServ,
    ...onlyDefined('cNBS', c.cNBS),
    ...onlyDefined('cIntContrib', c.cIntContrib),
  };
}

function buildComExterior(c: ComExterior): object {
  return {
    mdPrestacao: c.mdPrestacao,
    vincPrest: c.vincPrest,
    tpMoeda: c.tpMoeda,
    vServMoeda: formatDecimal(c.vServMoeda),
    mecAFComexP: c.mecAFComexP,
    mecAFComexT: c.mecAFComexT,
    movTempBens: c.movTempBens,
    ...onlyDefined('nDI', c.nDI),
    ...onlyDefined('nRE', c.nRE),
    mdic: c.mdic,
  };
}

function buildLocacaoSublocacao(l: LocacaoSublocacao): object {
  return {
    categ: l.categ,
    objeto: l.objeto,
    extensao: l.extensao,
    nPostes: l.nPostes,
  };
}

function buildInfoObra(o: InfoObra): object {
  return {
    ...onlyDefined('inscImobFisc', o.inscImobFisc),
    ...buildInfoObraIdentificacao(o.identificacao),
  };
}

function buildInfoObraIdentificacao(i: InfoObraIdentificacao): object {
  if ('cObra' in i) return { cObra: i.cObra };
  if ('cCIB' in i) return { cCIB: i.cCIB };
  return { end: buildEnderObraEvento(i.end) };
}

function buildAtvEvento(a: AtvEvento): object {
  return {
    xNome: a.xNome,
    dtIni: formatDate(a.dtIni),
    dtFim: formatDate(a.dtFim),
    ...buildAtvEventoIdentificacao(a.identificacao),
  };
}

function buildAtvEventoIdentificacao(i: AtvEventoIdentificacao): object {
  if ('idAtvEvt' in i) return { idAtvEvt: i.idAtvEvt };
  return { end: buildEnderecoSimples(i.end) };
}

function buildExploracaoRodoviaria(r: ExploracaoRodoviaria): object {
  return {
    categVeic: r.categVeic,
    nEixos: r.nEixos,
    rodagem: r.rodagem,
    sentido: r.sentido,
    placa: r.placa,
    codAcessoPed: r.codAcessoPed,
    codContrato: r.codContrato,
  };
}

function buildInfoCompl(i: InfoCompl): object {
  return {
    ...onlyDefined('idDocTec', i.idDocTec),
    ...onlyDefined('docRef', i.docRef),
    ...onlyDefined('xPed', i.xPed),
    ...onlyDefined('gItemPed', i.gItemPed && buildInfoItemPed(i.gItemPed)),
    ...onlyDefined('xInfComp', i.xInfComp),
  };
}

function buildInfoItemPed(g: InfoItemPed): object {
  return { xItemPed: [...g.xItemPed] };
}

function buildInfoValores(v: InfoValores): object {
  return {
    vServPrest: buildVServPrest(v.vServPrest),
    ...onlyDefined('vDescCondIncond', v.vDescCondIncond && buildVDescCondIncond(v.vDescCondIncond)),
    ...onlyDefined('vDedRed', v.vDedRed && buildInfoDedRed(v.vDedRed)),
    trib: buildInfoTributacao(v.trib),
  };
}

function buildVServPrest(v: VServPrest): object {
  return {
    ...onlyDefined('vReceb', formatOptionalDecimal(v.vReceb)),
    vServ: formatDecimal(v.vServ),
  };
}

function buildVDescCondIncond(v: VDescCondIncond): object {
  return {
    ...onlyDefined('vDescIncond', formatOptionalDecimal(v.vDescIncond)),
    ...onlyDefined('vDescCond', formatOptionalDecimal(v.vDescCond)),
  };
}

function buildInfoDedRed(d: InfoDedRed): object {
  if ('pDR' in d) return { pDR: formatDecimal(d.pDR) };
  if ('vDR' in d) return { vDR: formatDecimal(d.vDR) };
  return { documentos: buildListaDocDedRed(d.documentos) };
}

function buildListaDocDedRed(l: ListaDocDedRed): object {
  return { docDedRed: l.docDedRed.map(buildDocDedRed) };
}

function buildDocDedRed(d: DocDedRed): object {
  return {
    ...buildReferenciaDocDedRed(d.referencia),
    tpDedRed: d.tpDedRed,
    ...onlyDefined('xDescOutDed', d.xDescOutDed),
    dtEmiDoc: formatDate(d.dtEmiDoc),
    vDedutivelRedutivel: formatDecimal(d.vDedutivelRedutivel),
    vDeducaoReducao: formatDecimal(d.vDeducaoReducao),
    ...onlyDefined('fornec', d.fornec && buildInfoPessoa(d.fornec)),
  };
}

function buildReferenciaDocDedRed(r: ReferenciaDocDedRed): object {
  if ('chNFSe' in r) return { chNFSe: r.chNFSe };
  if ('chNFe' in r) return { chNFe: r.chNFe };
  if ('NFSeMun' in r) return { NFSeMun: buildDocOutNFSe(r.NFSeMun) };
  if ('NFNFS' in r) return { NFNFS: buildDocNFNFS(r.NFNFS) };
  if ('nDocFisc' in r) return { nDocFisc: r.nDocFisc };
  return { nDoc: r.nDoc };
}

function buildDocOutNFSe(d: DocOutNFSe): object {
  return {
    cMunNFSeMun: d.cMunNFSeMun,
    nNFSeMun: d.nNFSeMun,
    cVerifNFSeMun: d.cVerifNFSeMun,
  };
}

function buildDocNFNFS(d: DocNFNFS): object {
  return { nNFS: d.nNFS, modNFS: d.modNFS, serieNFS: d.serieNFS };
}

function buildInfoTributacao(t: InfoTributacao): object {
  return {
    tribMun: buildTribMunicipal(t.tribMun),
    ...onlyDefined('tribFed', t.tribFed && buildTribFederal(t.tribFed)),
    totTrib: buildTribTotal(t.totTrib),
  };
}

function buildTribMunicipal(t: TribMunicipal): object {
  return {
    tribISSQN: t.tribISSQN,
    ...onlyDefined('cPaisResult', t.cPaisResult),
    ...onlyDefined('tpImunidade', t.tpImunidade),
    ...onlyDefined('exigSusp', t.exigSusp && buildExigSuspensa(t.exigSusp)),
    ...onlyDefined('BM', t.BM && buildBeneficioMunicipal(t.BM)),
    tpRetISSQN: t.tpRetISSQN,
    ...onlyDefined('pAliq', formatOptionalDecimal(t.pAliq)),
  };
}

function buildExigSuspensa(e: ExigSuspensa): object {
  return { tpSusp: e.tpSusp, nProcesso: e.nProcesso };
}

function buildBeneficioMunicipal(b: BeneficioMunicipal): object {
  return {
    nBM: b.nBM,
    ...onlyDefined('vRedBCBM', formatOptionalDecimal(b.vRedBCBM)),
    ...onlyDefined('pRedBCBM', formatOptionalDecimal(b.pRedBCBM)),
  };
}

function buildTribFederal(f: TribFederal): object {
  return {
    ...onlyDefined('piscofins', f.piscofins && buildTribOutrosPisCofins(f.piscofins)),
    ...onlyDefined('vRetCP', formatOptionalDecimal(f.vRetCP)),
    ...onlyDefined('vRetIRRF', formatOptionalDecimal(f.vRetIRRF)),
    ...onlyDefined('vRetCSLL', formatOptionalDecimal(f.vRetCSLL)),
  };
}

function buildTribOutrosPisCofins(p: TribOutrosPisCofins): object {
  return {
    CST: p.CST,
    ...onlyDefined('vBCPisCofins', formatOptionalDecimal(p.vBCPisCofins)),
    ...onlyDefined('pAliqPis', formatOptionalDecimal(p.pAliqPis)),
    ...onlyDefined('pAliqCofins', formatOptionalDecimal(p.pAliqCofins)),
    ...onlyDefined('vPis', formatOptionalDecimal(p.vPis)),
    ...onlyDefined('vCofins', formatOptionalDecimal(p.vCofins)),
    ...onlyDefined('tpRetPisCofins', p.tpRetPisCofins),
  };
}

function buildTribTotal(t: TribTotal): object {
  if ('vTotTrib' in t) return { vTotTrib: buildTribTotalMonet(t.vTotTrib) };
  if ('pTotTrib' in t) return { pTotTrib: buildTribTotalPercent(t.pTotTrib) };
  if ('indTotTrib' in t) return { indTotTrib: t.indTotTrib };
  return { pTotTribSN: formatDecimal(t.pTotTribSN) };
}

function buildTribTotalMonet(m: TribTotalMonet): object {
  return {
    vTotTribFed: formatDecimal(m.vTotTribFed),
    vTotTribEst: formatDecimal(m.vTotTribEst),
    vTotTribMun: formatDecimal(m.vTotTribMun),
  };
}

function buildTribTotalPercent(p: TribTotalPercent): object {
  return {
    pTotTribFed: formatDecimal(p.pTotTribFed),
    pTotTribEst: formatDecimal(p.pTotTribEst),
    pTotTribMun: formatDecimal(p.pTotTribMun),
  };
}

function buildRtcInfoIbsCbs(r: RtcInfoIbsCbs): object {
  return {
    finNFSe: r.finNFSe,
    indFinal: r.indFinal,
    cIndOp: r.cIndOp,
    ...onlyDefined('tpOper', r.tpOper),
    ...onlyDefined('gRefNFSe', r.gRefNFSe && buildInfoRefNFSe(r.gRefNFSe)),
    ...onlyDefined('tpEnteGov', r.tpEnteGov),
    indDest: r.indDest,
    ...onlyDefined('dest', r.dest && buildRtcInfoDest(r.dest)),
    ...onlyDefined('imovel', r.imovel && buildRtcInfoImovel(r.imovel)),
    valores: buildRtcInfoValoresIbsCbs(r.valores),
  };
}

function buildInfoRefNFSe(g: InfoRefNFSe): object {
  return { refNFSe: [...g.refNFSe] };
}

function buildRtcInfoDest(d: RtcInfoDest): object {
  return {
    ...buildIdentificador(d.identificador),
    xNome: d.xNome,
    ...onlyDefined('end', d.end && buildEndereco(d.end)),
    ...onlyDefined('fone', d.fone),
    ...onlyDefined('email', d.email),
  };
}

function buildRtcInfoImovel(i: RtcInfoImovel): object {
  return {
    ...onlyDefined('inscImobFisc', i.inscImobFisc),
    ...buildImovelIdentificacao(i.identificacao),
  };
}

function buildImovelIdentificacao(i: ImovelIdentificacao): object {
  if ('cCIB' in i) return { cCIB: i.cCIB };
  return { end: buildEnderObraEvento(i.end) };
}

function buildRtcInfoValoresIbsCbs(v: RtcInfoValoresIbsCbs): object {
  return {
    ...onlyDefined('gReeRepRes', v.gReeRepRes && buildRtcInfoReeRepRes(v.gReeRepRes)),
    trib: buildRtcInfoTributosIbsCbs(v.trib),
  };
}

function buildRtcInfoReeRepRes(r: RtcInfoReeRepRes): object {
  return { documentos: r.documentos.map(buildRtcListaDoc) };
}

function buildRtcListaDoc(d: RtcListaDoc): object {
  return {
    ...buildRtcDocumentoReferenciado(d.documento),
    ...onlyDefined('fornec', d.fornec && buildRtcListaDocFornec(d.fornec)),
    dtEmiDoc: formatDate(d.dtEmiDoc),
    dtCompDoc: formatDate(d.dtCompDoc),
    tpReeRepRes: d.tpReeRepRes,
    ...onlyDefined('xTpReeRepRes', d.xTpReeRepRes),
    vlrReeRepRes: formatDecimal(d.vlrReeRepRes),
  };
}

function buildRtcDocumentoReferenciado(d: RtcDocumentoReferenciado): object {
  if ('dFeNacional' in d) return { dFeNacional: buildRtcListaDocDFe(d.dFeNacional) };
  if ('docFiscalOutro' in d)
    return { docFiscalOutro: buildRtcListaDocFiscalOutro(d.docFiscalOutro) };
  return { docOutro: buildRtcListaDocOutro(d.docOutro) };
}

function buildRtcListaDocDFe(d: RtcListaDocDFe): object {
  return {
    tipoChaveDFe: d.tipoChaveDFe,
    ...onlyDefined('xTipoChaveDFe', d.xTipoChaveDFe),
    chaveDFe: d.chaveDFe,
  };
}

function buildRtcListaDocFiscalOutro(d: RtcListaDocFiscalOutro): object {
  return {
    cMunDocFiscal: d.cMunDocFiscal,
    nDocFiscal: d.nDocFiscal,
    xDocFiscal: d.xDocFiscal,
  };
}

function buildRtcListaDocOutro(d: RtcListaDocOutro): object {
  return { nDoc: d.nDoc, xDoc: d.xDoc };
}

function buildRtcListaDocFornec(d: RtcListaDocFornec): object {
  return { ...buildIdentificador(d.identificador), xNome: d.xNome };
}

function buildRtcInfoTributosIbsCbs(t: RtcInfoTributosIbsCbs): object {
  return { gIBSCBS: buildRtcInfoTributosSitClas(t.gIBSCBS) };
}

function buildRtcInfoTributosSitClas(s: RtcInfoTributosSitClas): object {
  return {
    CST: s.CST,
    cClassTrib: s.cClassTrib,
    ...onlyDefined('cCredPres', s.cCredPres),
    ...onlyDefined(
      'gTribRegular',
      s.gTribRegular && buildRtcInfoTributosTribRegular(s.gTribRegular),
    ),
    ...onlyDefined('gDif', s.gDif && buildRtcInfoTributosDif(s.gDif)),
  };
}

function buildRtcInfoTributosTribRegular(r: RtcInfoTributosTribRegular): object {
  return { CSTReg: r.CSTReg, cClassTribReg: r.cClassTribReg };
}

function buildRtcInfoTributosDif(d: RtcInfoTributosDif): object {
  return {
    pDifUF: formatDecimal(d.pDifUF),
    pDifMun: formatDecimal(d.pDifMun),
    pDifCBS: formatDecimal(d.pDifCBS),
  };
}

function buildSignature(s: Signature): object {
  return {
    [`${ATTR_PREFIX}xmlns`]: DSIG_NS,
    SignedInfo: {
      Reference: {
        [`${ATTR_PREFIX}URI`]: s.referenceUri,
        DigestValue: s.digestValue,
      },
    },
    SignatureValue: s.signatureValue,
    KeyInfo: {
      X509Data: { X509Certificate: s.x509Certificate },
    },
  };
}

function formatDateTime(d: Date): string {
  return d.toISOString();
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formats a decimal per RTC v1.01 TSDec*V2 pattern: either the integer form
 * (`"0"`, `"42"`) or exactly two fraction digits (`"0.50"`, `"51.60"`).
 */
function formatDecimal(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

function formatOptionalDecimal(n: number | undefined): string | undefined {
  return n === undefined ? undefined : formatDecimal(n);
}

function onlyDefined<K extends string, V>(key: K, value: V | undefined): { readonly [P in K]?: V } {
  return value === undefined
    ? ({} as { readonly [P in K]?: V })
    : ({ [key]: value } as { readonly [P in K]: V });
}
