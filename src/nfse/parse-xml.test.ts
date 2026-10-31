import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { InvalidXmlError } from '../errors/validation.js';
import { noopLogger } from '../logging.js';
import { dpsNt009Completa } from './__fixtures__/dps-nt009.js';
import { dpsNt009Max } from './__fixtures__/dps-nt009-max.js';
import { comDatasBrt } from './__fixtures__/normalize-dto.js';
import { RTC_SCHEMAS } from './_rtc-schemas.generated.js';
import { buildDpsXml } from './build-xml.js';
import type { NfseNt004 } from './domain.js';
import {
  AmbienteGerador,
  FinalidadeNFSe,
  MotivoEmissaoTomadorIntermediario,
  OpcaoSimplesNacional,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAmbienteDps,
  TipoBeneficioMunicipal,
  TipoEmissao,
  TipoEmitenteDps,
  TipoRetISSQN,
  TipoTribISSQN,
  UF,
} from './enums.js';
import { FOREIGN_LAYOUT_FIELDS, LAYOUTS, type Layout } from './layout.js';
import { parseNfseXml } from './parse-xml.js';

/** Os XMLs deste arquivo são todos nt004 — estreita o `NFSe` (union) para os asserts. */
function parseNt004(xml: string): NfseNt004 {
  const nfse = parseNfseXml(xml);
  if (nfse.layout !== 'nt004') throw new Error(`esperado layout nt004, veio ${nfse.layout}`);
  return nfse;
}

const SAMPLE_PATH = join(
  __dirname,
  '..',
  '..',
  'specs',
  'samples',
  '21113002200574753000100000000000146726037032711025.xml',
);

describe('parseNfseXml — captured Simples Nacional sample', () => {
  const xml = readFileSync(SAMPLE_PATH, 'utf-8');
  const nfse = parseNt004(xml);

  it('marca NFS-e do layout atual como nt004', () => {
    expect(nfse.layout).toBe('nt004');
    expect(nfse.infNFSe.DPS.layout).toBe('nt004');
  });

  it('reads NFSe envelope attributes', () => {
    expect(nfse.versao).toBe('1.01');
  });

  it('extracts chaveAcesso by stripping the "NFS" prefix from Id', () => {
    expect(nfse.infNFSe.Id).toBe('NFS21113002200574753000100000000000146726037032711025');
    expect(nfse.infNFSe.chaveAcesso).toBe('21113002200574753000100000000000146726037032711025');
    expect(nfse.infNFSe.chaveAcesso).toHaveLength(50);
  });

  it('parses top-level NFS-e header fields', () => {
    expect(nfse.infNFSe.xLocEmi).toBe('São Luís');
    expect(nfse.infNFSe.nNFSe).toBe('1467');
    expect(nfse.infNFSe.cLocIncid).toBe('2111300');
    expect(nfse.infNFSe.ambGer).toBe(AmbienteGerador.SefinNacional);
    expect(nfse.infNFSe.tpEmis).toBe(TipoEmissao.Normal);
    expect(nfse.infNFSe.cStat).toBe('100');
    expect(nfse.infNFSe.dhProc).toBeInstanceOf(Date);
    expect(nfse.infNFSe.nDFSe).toBe('2369908');
  });

  it('parses the emitente as CNPJ identifier', () => {
    const emit = nfse.infNFSe.emit;
    expect(emit.identificador).toEqual({ CNPJ: '00574753000100' });
    expect(emit.IM).toBe('6123007');
    expect(emit.xNome).toBe('VOGA LTDA');
    expect(emit.enderNac.UF).toBe(UF.MA);
    expect(emit.enderNac.cMun).toBe('2111300');
    expect(emit.enderNac.CEP).toBe('65045215');
  });

  it('parses valores: vLiq = 51.60', () => {
    expect(nfse.infNFSe.valores.vLiq).toBe(51.6);
  });

  it('parses DPS envelope + infDPS top-level', () => {
    expect(nfse.infNFSe.DPS.versao).toBe('1.01');
    const inf = nfse.infNFSe.DPS.infDPS;
    expect(inf.Id).toBe('DPS211130020057475300010000003000000000005306');
    expect(inf.tpAmb).toBe(TipoAmbienteDps.Producao);
    expect(inf.serie).toBe('3');
    expect(inf.nDPS).toBe('5306');
    expect(inf.tpEmit).toBe(TipoEmitenteDps.Prestador);
    expect(inf.cLocEmi).toBe('2111300');
  });

  it('parses prestador with regTrib = Simples Nacional ME/EPP', () => {
    const prest = nfse.infNFSe.DPS.infDPS.prest;
    expect(prest.identificador).toEqual({ CNPJ: '00574753000100' });
    expect(prest.IM).toBe('6123007');
    expect(prest.regTrib.opSimpNac).toBe(OpcaoSimplesNacional.MeEpp);
    expect(prest.regTrib.regApTribSN).toBe(RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN);
    expect(prest.regTrib.regEspTrib).toBe(RegimeEspecialTributacao.Nenhum);
  });

  it('parses tomador as CPF identifier with endereço nacional', () => {
    const toma = nfse.infNFSe.DPS.infDPS.toma;
    expect(toma).toBeDefined();
    expect(toma?.identificador).toEqual({ CPF: '01075595363' });
    expect(toma?.xNome).toBe('Maria Ferreira dos Santos de Jesus');
    expect(toma?.end?.localidade).toEqual({
      endNac: { cMun: '2111201', CEP: '65117026' },
    });
    expect(toma?.end?.xBairro).toBe('Vila conceição Matinha');
  });

  it('parses serv: locPrest (municipal) + cServ (tribNac + descrição)', () => {
    const serv = nfse.infNFSe.DPS.infDPS.serv;
    expect(serv.locPrest).toEqual({ cLocPrestacao: '2111300' });
    expect(serv.cServ.cTribNac).toBe('250101');
    expect(serv.cServ.xDescServ).toContain('Pagamento de mensalidade plano');
    expect(serv.cServ.cIntContrib).toBe('530000');
  });

  it('parses infoValores.vServPrest.vServ', () => {
    expect(nfse.infNFSe.DPS.infDPS.valores.vServPrest.vServ).toBe(51.6);
  });

  it('parses tributação municipal (ISSQN tributável, não retido)', () => {
    const trib = nfse.infNFSe.DPS.infDPS.valores.trib;
    expect(trib.tribMun.tribISSQN).toBe(TipoTribISSQN.OperacaoTributavel);
    expect(trib.tribMun.tpRetISSQN).toBe(TipoRetISSQN.NaoRetido);
  });

  it('parses totTrib as the Simples Nacional percent variant', () => {
    const totTrib = nfse.infNFSe.DPS.infDPS.valores.trib.totTrib;
    expect(totTrib).toEqual({ pTotTribSN: 0 });
  });

  it('Simples Nacional sample has no tribFed and no IBSCBS block', () => {
    expect(nfse.infNFSe.DPS.infDPS.valores.trib.tribFed).toBeUndefined();
    expect(nfse.infNFSe.IBSCBS).toBeUndefined();
    expect(nfse.infNFSe.DPS.infDPS.valores.vDescCondIncond).toBeUndefined();
    expect(nfse.infNFSe.DPS.infDPS.valores.vDedRed).toBeUndefined();
  });

  it('parses the outer (SEFIN) signature with referenceUri pointing to infNFSe Id', () => {
    expect(nfse.signature.referenceUri).toBe(
      '#NFS21113002200574753000100000000000146726037032711025',
    );
    expect(nfse.signature.digestValue.length).toBeGreaterThan(0);
    expect(nfse.signature.signatureValue.length).toBeGreaterThan(0);
    expect(nfse.signature.x509Certificate.length).toBeGreaterThan(0);
  });

  it('parses the inner (DPS) signature', () => {
    const dpsSig = nfse.infNFSe.DPS.signature;
    expect(dpsSig).toBeDefined();
    expect(dpsSig?.referenceUri).toBe('#DPS211130020057475300010000003000000000005306');
  });
});

describe('parseNfseXml — IBS/CBS branch (synthetic)', () => {
  const base = readFileSync(SAMPLE_PATH, 'utf-8');

  const ibscbsBlock =
    '<IBSCBS><cLocalidadeIncid>2111300</cLocalidadeIncid><xLocalidadeIncid>São Luís</xLocalidadeIncid><pRedutor>0</pRedutor><valores><vBC>100</vBC><uf><pIBSUF>10</pIBSUF><pAliqEfetUF>10</pAliqEfetUF></uf><mun><pIBSMun>5</pIBSMun><pAliqEfetMun>5</pAliqEfetMun></mun><fed><pCBS>1</pCBS><pAliqEfetCBS>1</pAliqEfetCBS></fed></valores><totCIBS><vTotNF>51.60</vTotNF><gIBS><vIBSTot>15</vIBSTot><gIBSUFTot><vDifUF>0</vDifUF><vIBSUF>10</vIBSUF></gIBSUFTot><gIBSMunTot><vDifMun>0</vDifMun><vIBSMun>5</vIBSMun></gIBSMunTot></gIBS><gCBS><vDifCBS>0</vDifCBS><vCBS>1</vCBS></gCBS></totCIBS></IBSCBS>';
  const withIbscbs = base.replace('<DPS versao=', `${ibscbsBlock}<DPS versao=`);
  const nfse = parseNt004(withIbscbs);

  it('exposes cLocalidadeIncid and pRedutor', () => {
    expect(nfse.infNFSe.IBSCBS?.cLocalidadeIncid).toBe('2111300');
    expect(nfse.infNFSe.IBSCBS?.pRedutor).toBe(0);
  });

  it('parses valores tree with uf/mun/fed branches', () => {
    const v = nfse.infNFSe.IBSCBS?.valores;
    expect(v?.vBC).toBe(100);
    expect(v?.uf.pIBSUF).toBe(10);
    expect(v?.mun.pIBSMun).toBe(5);
    expect(v?.fed.pCBS).toBe(1);
  });

  it('parses totCIBS totals', () => {
    const t = nfse.infNFSe.IBSCBS?.totCIBS;
    expect(t?.vTotNF).toBe(51.6);
    expect(t?.gIBS.vIBSTot).toBe(15);
    expect(t?.gIBS.gIBSUFTot.vIBSUF).toBe(10);
    expect(t?.gIBS.gIBSMunTot.vIBSMun).toBe(5);
    expect(t?.gCBS.vCBS).toBe(1);
  });

  it('leaves optional sub-groups (credPres, tribRegular, tribCompraGov) undefined when absent', () => {
    const t = nfse.infNFSe.IBSCBS?.totCIBS;
    expect(t?.gTribRegular).toBeUndefined();
    expect(t?.gTribCompraGov).toBeUndefined();
    expect(t?.gIBS.gIBSCredPres).toBeUndefined();
    expect(t?.gCBS.gCBSCredPres).toBeUndefined();
  });
});

describe('parseNfseXml — phase 4 service variants (synthetic)', () => {
  const base = readFileSync(SAMPLE_PATH, 'utf-8');

  function injectIntoServ(extra: string): string {
    return base.replace('</serv>', `${extra}</serv>`);
  }

  it('parses comExterior service variant', () => {
    const xml = injectIntoServ(
      '<comExt><mdPrestacao>1</mdPrestacao><vincPrest>0</vincPrest><tpMoeda>USD</tpMoeda><vServMoeda>1000</vServMoeda><mecAFComexP>01</mecAFComexP><mecAFComexT>01</mecAFComexT><movTempBens>1</movTempBens><mdic>0</mdic></comExt>',
    );
    const parsed = parseNt004(xml);
    const serv = parsed.infNFSe.DPS.infDPS.serv;
    expect(serv.comExt?.mdPrestacao).toBe('1');
    expect(serv.comExt?.tpMoeda).toBe('USD');
    expect(serv.comExt?.vServMoeda).toBe(1000);
  });

  it('parses obra service variant with cObra identification', () => {
    const xml = injectIntoServ('<obra><cObra>123456789012</cObra></obra>');
    const parsed = parseNt004(xml);
    const obra = parsed.infNFSe.DPS.infDPS.serv.obra;
    expect(obra).toBeDefined();
    expect(obra?.identificacao).toEqual({ cObra: '123456789012' });
  });

  it('parses infoCompl with gItemPed array', () => {
    const xml = injectIntoServ(
      '<infoCompl><xPed>PED-42</xPed><gItemPed><xItemPed>1</xItemPed><xItemPed>2</xItemPed></gItemPed></infoCompl>',
    );
    const parsed = parseNt004(xml);
    const infoCompl = parsed.infNFSe.DPS.infDPS.serv.infoCompl;
    expect(infoCompl?.xPed).toBe('PED-42');
    expect(infoCompl?.gItemPed?.xItemPed).toEqual(['1', '2']);
  });

  it('Simples Nacional sample has none of the service variants', () => {
    const parsed = parseNt004(base);
    const serv = parsed.infNFSe.DPS.infDPS.serv;
    expect(serv.comExt).toBeUndefined();
    expect(serv.obra).toBeUndefined();
    expect(serv.atvEvento).toBeUndefined();
    expect(serv.infoCompl).toBeUndefined();
  });
});

describe('parseNfseXml — phase 4 substituição (synthetic)', () => {
  const base = readFileSync(SAMPLE_PATH, 'utf-8');

  it('parses subst block on InfDPSNt004 when present', () => {
    const xml = base.replace(
      '<prest>',
      '<subst><chSubstda>00000000000000000000000000000000000000000000000001</chSubstda><cMotivo>01</cMotivo><xMotivo>motivo</xMotivo></subst><prest>',
    );
    const parsed = parseNt004(xml);
    const subst = parsed.infNFSe.DPS.infDPS.subst;
    expect(subst?.chSubstda).toHaveLength(50);
    expect(subst?.cMotivo).toBe('01');
    expect(subst?.xMotivo).toBe('motivo');
  });

  it('leaves subst undefined in the Simples Nacional sample', () => {
    const parsed = parseNt004(base);
    expect(parsed.infNFSe.DPS.infDPS.subst).toBeUndefined();
  });
});

describe('parseNfseXml — phase 4 DPS-side IBS/CBS (synthetic)', () => {
  const base = readFileSync(SAMPLE_PATH, 'utf-8');

  const ibscbsDps =
    '<IBSCBS><finNFSe>0</finNFSe><indFinal>0</indFinal><cIndOp>010101</cIndOp><indDest>1</indDest><valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>';

  it('parses declared IBS/CBS block with CST and cClassTrib', () => {
    const xml = base.replace('</valores></infDPS>', `</valores>${ibscbsDps}</infDPS>`);
    const parsed = parseNt004(xml);
    const ibscbs = parsed.infNFSe.DPS.infDPS.IBSCBS;
    expect(ibscbs?.finNFSe).toBe('0');
    expect(ibscbs?.cIndOp).toBe('010101');
    expect(ibscbs?.indDest).toBe('1');
    expect(ibscbs?.valores.trib.gIBSCBS.CST).toBe('000');
    expect(ibscbs?.valores.trib.gIBSCBS.cClassTrib).toBe('000001');
  });

  it('Simples Nacional sample has no declared IBS/CBS', () => {
    const parsed = parseNt004(base);
    expect(parsed.infNFSe.DPS.infDPS.IBSCBS).toBeUndefined();
  });
});

/** NFS-e nt004 sintética com todos os grupos (inclusive IBSCBS da NFS-e e do DPS). */
const KITCHEN_SINK_NT004 =
  '<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse">' +
  '<infNFSe Id="NFS11111111111111111111111111111111111111111111119999">' +
  '<xLocEmi>A</xLocEmi><xLocPrestacao>B</xLocPrestacao><nNFSe>1</nNFSe>' +
  '<cLocIncid>3550308</cLocIncid><xLocIncid>São Paulo</xLocIncid>' +
  '<xTribNac>desc</xTribNac><xTribMun>m</xTribMun><xNBS>n</xNBS>' +
  '<verAplic>v</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi>' +
  '<cStat>100</cStat><dhProc>2026-04-16T10:00:00-03:00</dhProc><nDFSe>1</nDFSe>' +
  '<emit><CNPJ>11111111111111</CNPJ><IM>1</IM><xNome>E</xNome><xFant>F</xFant>' +
  '<enderNac><xLgr>L</xLgr><nro>1</nro><xCpl>c</xCpl><xBairro>B</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01000000</CEP></enderNac>' +
  '<fone>11999999999</fone><email>e@x.com</email></emit>' +
  '<valores><vCalcDR>1</vCalcDR><tpBM>2</tpBM><vCalcBM>1</vCalcBM><vBC>100</vBC><pAliqAplic>5</pAliqAplic><vISSQN>5</vISSQN><vTotalRet>0</vTotalRet><vLiq>95</vLiq><xOutInf>x</xOutInf></valores>' +
  '<IBSCBS><cLocalidadeIncid>3550308</cLocalidadeIncid><xLocalidadeIncid>SP</xLocalidadeIncid><pRedutor>0</pRedutor>' +
  '<valores><vBC>100</vBC><vCalcReeRepRes>0</vCalcReeRepRes><uf><pIBSUF>10</pIBSUF><pRedAliqUF>0</pRedAliqUF><pAliqEfetUF>10</pAliqEfetUF></uf><mun><pIBSMun>5</pIBSMun><pRedAliqMun>0</pRedAliqMun><pAliqEfetMun>5</pAliqEfetMun></mun><fed><pCBS>1</pCBS><pRedAliqCBS>0</pRedAliqCBS><pAliqEfetCBS>1</pAliqEfetCBS></fed></valores>' +
  '<totCIBS><vTotNF>100</vTotNF><gIBS><vIBSTot>15</vIBSTot><gIBSCredPres><pCredPresIBS>0</pCredPresIBS><vCredPresIBS>0</vCredPresIBS></gIBSCredPres><gIBSUFTot><vDifUF>0</vDifUF><vIBSUF>10</vIBSUF></gIBSUFTot><gIBSMunTot><vDifMun>0</vDifMun><vIBSMun>5</vIBSMun></gIBSMunTot></gIBS>' +
  '<gCBS><gCBSCredPres><pCredPresCBS>0</pCredPresCBS><vCredPresCBS>0</vCredPresCBS></gCBSCredPres><vDifCBS>0</vDifCBS><vCBS>1</vCBS></gCBS>' +
  '<gTribRegular><pAliqEfeRegIBSUF>10</pAliqEfeRegIBSUF><vTribRegIBSUF>10</vTribRegIBSUF><pAliqEfeRegIBSMun>5</pAliqEfeRegIBSMun><vTribRegIBSMun>5</vTribRegIBSMun><pAliqEfeRegCBS>1</pAliqEfeRegCBS><vTribRegCBS>1</vTribRegCBS></gTribRegular>' +
  '<gTribCompraGov><pIBSUF>10</pIBSUF><vIBSUF>10</vIBSUF><pIBSMun>5</pIBSMun><vIBSMun>5</vIBSMun><pCBS>1</pCBS><vCBS>1</vCBS></gTribCompraGov></totCIBS></IBSCBS>' +
  '<DPS versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse">' +
  '<infDPS Id="DPSXYZ">' +
  '<tpAmb>2</tpAmb><dhEmi>2026-04-16T10:00:00-03:00</dhEmi><verAplic>v</verAplic><serie>1</serie><nDPS>1</nDPS><dCompet>2026-04-16</dCompet><tpEmit>2</tpEmit><cMotivoEmisTI>1</cMotivoEmisTI><chNFSeRej>00000000000000000000000000000000000000000000000001</chNFSeRej>' +
  '<cLocEmi>3550308</cLocEmi>' +
  '<subst><chSubstda>00000000000000000000000000000000000000000000000002</chSubstda><cMotivo>99</cMotivo><xMotivo>m</xMotivo></subst>' +
  '<prest><NIF>INT-1</NIF><CAEPF>1</CAEPF><IM>1</IM><xNome>P</xNome><fone>1</fone><email>p@x</email><regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest>' +
  '<toma><cNaoNIF>1</cNaoNIF><CAEPF>1</CAEPF><IM>1</IM><xNome>T</xNome><end><endExt><cPais>US</cPais><cEndPost>12345</cEndPost><xCidade>NY</xCidade><xEstProvReg>NY</xEstProvReg></endExt><xLgr>L</xLgr><nro>1</nro><xCpl>c</xCpl><xBairro>B</xBairro></end><fone>1</fone><email>t@x</email></toma>' +
  '<interm><CPF>00000000000</CPF><xNome>I</xNome></interm>' +
  '<serv>' +
  '<locPrest><cPaisPrestacao>US</cPaisPrestacao></locPrest>' +
  '<cServ><cTribNac>100101</cTribNac><xDescServ>s</xDescServ></cServ>' +
  '<comExt><mdPrestacao>1</mdPrestacao><vincPrest>0</vincPrest><tpMoeda>USD</tpMoeda><vServMoeda>100</vServMoeda><mecAFComexP>01</mecAFComexP><mecAFComexT>01</mecAFComexT><movTempBens>1</movTempBens><nDI>di1</nDI><nRE>re1</nRE><mdic>0</mdic></comExt>' +
  '<obra><cCIB>99999</cCIB></obra>' +
  '<atvEvento><xNome>E</xNome><dtIni>2026-04-16</dtIni><dtFim>2026-04-17</dtFim><end><CEP>01000000</CEP><xLgr>L</xLgr><nro>1</nro><xBairro>B</xBairro></end></atvEvento>' +
  '<infoCompl><idDocTec>art1</idDocTec><docRef>c1</docRef><xPed>P1</xPed><gItemPed><xItemPed>1</xItemPed></gItemPed><xInfComp>info</xInfComp></infoCompl>' +
  '</serv>' +
  '<valores>' +
  '<vServPrest><vReceb>50</vReceb><vServ>100</vServ></vServPrest>' +
  '<vDescCondIncond><vDescIncond>1</vDescIncond><vDescCond>2</vDescCond></vDescCondIncond>' +
  '<vDedRed><documentos><docDedRed><chNFSe>x</chNFSe><tpDedRed>99</tpDedRed><xDescOutDed>o</xDescOutDed><dtEmiDoc>2026-04-16</dtEmiDoc><vDedutivelRedutivel>10</vDedutivelRedutivel><vDeducaoReducao>5</vDeducaoReducao></docDedRed><docDedRed><NFSeMun><cMunNFSeMun>3550308</cMunNFSeMun><nNFSeMun>1</nNFSeMun><cVerifNFSeMun>abc</cVerifNFSeMun></NFSeMun><tpDedRed>1</tpDedRed><dtEmiDoc>2026-04-16</dtEmiDoc><vDedutivelRedutivel>5</vDedutivelRedutivel><vDeducaoReducao>5</vDeducaoReducao></docDedRed><docDedRed><NFNFS><nNFS>1</nNFS><modNFS>55</modNFS><serieNFS>1</serieNFS></NFNFS><tpDedRed>2</tpDedRed><dtEmiDoc>2026-04-16</dtEmiDoc><vDedutivelRedutivel>5</vDedutivelRedutivel><vDeducaoReducao>5</vDeducaoReducao></docDedRed><docDedRed><nDocFisc>abc</nDocFisc><tpDedRed>5</tpDedRed><dtEmiDoc>2026-04-16</dtEmiDoc><vDedutivelRedutivel>5</vDedutivelRedutivel><vDeducaoReducao>5</vDeducaoReducao></docDedRed><docDedRed><nDoc>xyz</nDoc><tpDedRed>6</tpDedRed><dtEmiDoc>2026-04-16</dtEmiDoc><vDedutivelRedutivel>5</vDedutivelRedutivel><vDeducaoReducao>5</vDeducaoReducao></docDedRed><docDedRed><chNFe>y</chNFe><tpDedRed>7</tpDedRed><dtEmiDoc>2026-04-16</dtEmiDoc><vDedutivelRedutivel>5</vDedutivelRedutivel><vDeducaoReducao>5</vDeducaoReducao></docDedRed></documentos></vDedRed>' +
  '<trib><tribMun><tribISSQN>2</tribISSQN><cPaisResult>BR</cPaisResult><tpImunidade>1</tpImunidade><exigSusp><tpSusp>1</tpSusp><nProcesso>123</nProcesso></exigSusp><BM><nBM>35503080100001</nBM><vRedBCBM>10</vRedBCBM></BM><tpRetISSQN>1</tpRetISSQN><pAliq>5</pAliq></tribMun><tribFed><piscofins><CST>01</CST><vBCPisCofins>100</vBCPisCofins><pAliqPis>1</pAliqPis><pAliqCofins>2</pAliqCofins><vPis>1</vPis><vCofins>2</vCofins><tpRetPisCofins>2</tpRetPisCofins></piscofins><vRetCP>1</vRetCP><vRetIRRF>2</vRetIRRF><vRetCSLL>3</vRetCSLL></tribFed><totTrib><vTotTrib><vTotTribFed>5</vTotTribFed><vTotTribEst>1</vTotTribEst><vTotTribMun>2</vTotTribMun></vTotTrib></totTrib></trib>' +
  '</valores>' +
  '<IBSCBS><finNFSe>0</finNFSe><indFinal>1</indFinal><cIndOp>010101</cIndOp><tpOper>1</tpOper><gRefNFSe><refNFSe>00000000000000000000000000000000000000000000000003</refNFSe></gRefNFSe><tpEnteGov>1</tpEnteGov><indDest>1</indDest><dest><NIF>N1</NIF><xNome>D</xNome><fone>1</fone><email>d@x</email></dest>' +
  '<imovel><inscImobFisc>1</inscImobFisc><cCIB>99999</cCIB></imovel>' +
  '<valores><gReeRepRes><documentos><dFeNacional><tipoChaveDFe>1</tipoChaveDFe><xTipoChaveDFe>x</xTipoChaveDFe><chaveDFe>00000000000000000000000000000000000000000000000004</chaveDFe></dFeNacional><fornec><CPF>00000000000</CPF><xNome>F</xNome></fornec><dtEmiDoc>2026-04-16</dtEmiDoc><dtCompDoc>2026-04-16</dtCompDoc><tpReeRepRes>1</tpReeRepRes><xTpReeRepRes>x</xTpReeRepRes><vlrReeRepRes>10</vlrReeRepRes></documentos><documentos><docFiscalOutro><cMunDocFiscal>3550308</cMunDocFiscal><nDocFiscal>1</nDocFiscal><xDocFiscal>x</xDocFiscal></docFiscalOutro><dtEmiDoc>2026-04-16</dtEmiDoc><dtCompDoc>2026-04-16</dtCompDoc><tpReeRepRes>1</tpReeRepRes><vlrReeRepRes>5</vlrReeRepRes></documentos><documentos><docOutro><nDoc>1</nDoc><xDoc>x</xDoc></docOutro><dtEmiDoc>2026-04-16</dtEmiDoc><dtCompDoc>2026-04-16</dtCompDoc><tpReeRepRes>1</tpReeRepRes><vlrReeRepRes>5</vlrReeRepRes></documentos></gReeRepRes>' +
  '<trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><cCredPres>0</cCredPres><gTribRegular><CSTReg>000</CSTReg><cClassTribReg>000001</cClassTribReg></gTribRegular><gDif><pDifUF>0</pDifUF><pDifMun>0</pDifMun><pDifCBS>0</pDifCBS></gDif></gIBSCBS></trib></valores></IBSCBS>' +
  '</infDPS>' +
  '</DPS></infNFSe>' +
  '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="x"/><SignatureMethod Algorithm="x"/><Reference URI="#NFS11111111111111111111111111111111111111111111119999"><Transforms><Transform Algorithm="x"/></Transforms><DigestMethod Algorithm="x"/><DigestValue>d</DigestValue></Reference></SignedInfo><SignatureValue>s</SignatureValue><KeyInfo><X509Data><X509Certificate>c</X509Certificate></X509Data></KeyInfo></Signature>' +
  '</NFSe>';

describe('parseNfseXml — kitchen-sink synthetic covering phase 3+4 branches', () => {
  const parsed = parseNt004(KITCHEN_SINK_NT004);

  it('parses exterior tomador endExt', () => {
    const end = parsed.infNFSe.DPS.infDPS.toma?.end;
    expect(end?.localidade).toEqual({
      endExt: { cPais: 'US', cEndPost: '12345', xCidade: 'NY', xEstProvReg: 'NY' },
    });
  });

  it('parses intermediário via CPF', () => {
    expect(parsed.infNFSe.DPS.infDPS.interm?.identificador).toEqual({ CPF: '00000000000' });
  });

  it('parses date-only fields (dCompet) anchored at Brazil-local midnight, no off-by-one', () => {
    // <dCompet>2026-04-16</dCompet> → meia-noite de Brasília (-03:00) = 03:00Z.
    // `new Date('2026-04-16')` cairia em 00:00Z e, lido em fuso BR, voltaria dia 15.
    expect(parsed.infNFSe.DPS.infDPS.dCompet.toISOString()).toBe('2026-04-16T03:00:00.000Z');
  });

  it('parses locPrest as país (cPaisPrestacao)', () => {
    expect(parsed.infNFSe.DPS.infDPS.serv.locPrest).toEqual({ cPaisPrestacao: 'US' });
  });

  it('parses service variants (comExt, obra, atvEvento, infoCompl)', () => {
    const s = parsed.infNFSe.DPS.infDPS.serv;
    expect(s.comExt?.nDI).toBe('di1');
    expect(s.obra?.identificacao).toEqual({ cCIB: '99999' });
    expect(s.atvEvento?.identificacao).toHaveProperty('end');
    expect(s.infoCompl?.gItemPed?.xItemPed).toEqual(['1']);
  });

  it('parses tribMun with ExigSuspensa and BM', () => {
    const m = parsed.infNFSe.DPS.infDPS.valores.trib.tribMun;
    expect(m.exigSusp?.nProcesso).toBe('123');
    expect(m.BM?.nBM).toBe('35503080100001');
  });

  it('parses tribFed with piscofins and retenções', () => {
    const f = parsed.infNFSe.DPS.infDPS.valores.trib.tribFed;
    expect(f?.piscofins?.CST).toBe('01');
    expect(f?.vRetCP).toBe(1);
  });

  it('parses totTrib as vTotTrib (monetário) variant', () => {
    const t = parsed.infNFSe.DPS.infDPS.valores.trib.totTrib;
    expect(t).toHaveProperty('vTotTrib');
    if ('vTotTrib' in t) expect(t.vTotTrib.vTotTribFed).toBe(5);
  });

  it('parses all 6 dedução/redução document reference variants', () => {
    const ded = parsed.infNFSe.DPS.infDPS.valores.vDedRed;
    if (!ded || !('documentos' in ded)) throw new Error('expected documentos');
    const refs = ded.documentos.docDedRed.map((d) => Object.keys(d.referencia)[0]);
    expect(refs).toEqual(['chNFSe', 'NFSeMun', 'NFNFS', 'nDocFisc', 'nDoc', 'chNFe']);
  });

  it('parses NFSe-side IBSCBS with all optional totalizadores', () => {
    const i = parsed.infNFSe.IBSCBS;
    expect(i?.valores.vCalcReeRepRes).toBe(0);
    expect(i?.totCIBS.gIBS.gIBSCredPres?.vCredPresIBS).toBe(0);
    expect(i?.totCIBS.gCBS.gCBSCredPres?.vCredPresCBS).toBe(0);
    expect(i?.totCIBS.gTribRegular?.vTribRegCBS).toBe(1);
    expect(i?.totCIBS.gTribCompraGov?.vCBS).toBe(1);
  });

  it('parses DPS-side IBSCBS with dest + imovel + gReeRepRes (all 3 doc variants)', () => {
    const d = parsed.infNFSe.DPS.infDPS.IBSCBS;
    expect(d?.dest?.identificador).toEqual({ NIF: 'N1' });
    expect(d?.imovel?.identificacao).toEqual({ cCIB: '99999' });
    expect(d?.gRefNFSe?.refNFSe).toHaveLength(1);

    const docs = d?.valores.gReeRepRes?.documentos ?? [];
    expect(docs).toHaveLength(3);
    expect(Object.keys(docs[0]?.documento ?? {})[0]).toBe('dFeNacional');
    expect(Object.keys(docs[1]?.documento ?? {})[0]).toBe('docFiscalOutro');
    expect(Object.keys(docs[2]?.documento ?? {})[0]).toBe('docOutro');
    expect(docs[0]?.fornec?.identificador).toEqual({ CPF: '00000000000' });
  });

  it('parses IBSCBS gIBSCBS with gTribRegular and gDif', () => {
    const t = parsed.infNFSe.DPS.infDPS.IBSCBS?.valores.trib.gIBSCBS;
    expect(t?.cCredPres).toBe('0');
    expect(t?.gTribRegular?.CSTReg).toBe('000');
    expect(t?.gDif?.pDifUF).toBe(0);
  });

  it('parses prest via NIF (not CNPJ/CPF)', () => {
    expect(parsed.infNFSe.DPS.infDPS.prest.identificador).toEqual({ NIF: 'INT-1' });
  });

  it('parses toma via cNaoNIF', () => {
    expect(parsed.infNFSe.DPS.infDPS.toma?.identificador).toEqual({ cNaoNIF: '1' });
  });
});

describe('parseNfseXml — error surfaces', () => {
  it('throws InvalidXmlError on completely invalid XML', () => {
    expect(() => parseNfseXml('not xml at all')).toThrow(InvalidXmlError);
  });

  it('throws InvalidXmlError when root element is missing', () => {
    expect(() => parseNfseXml('<foo/>')).toThrow(InvalidXmlError);
  });

  it('throws InvalidXmlError when a required child is missing', () => {
    expect(() => parseNfseXml('<NFSe versao="1.01"><infNFSe Id="x"/></NFSe>')).toThrow(
      InvalidXmlError,
    );
  });
});

describe('parseNfseXml — detecção de layout nt004/nt009', () => {
  const fixtureNt009 = () =>
    readFileSync(join(__dirname, '__fixtures__', 'nfse-nt009-sintetica.xml'), 'utf-8');

  it('detecta nt009 pela presença de infDPS/finNFSe', () => {
    const nfse = parseNfseXml(fixtureNt009());
    expect(nfse.layout).toBe('nt009');
    if (nfse.layout !== 'nt009') throw new Error('narrow');
    expect(nfse.infNFSe.DPS.layout).toBe('nt009');
    expect(nfse.infNFSe.DPS.infDPS.finNFSe).toBe(FinalidadeNFSe.Regular);
    expect(nfse.infNFSe.valores.vCalcAjusteBCISSQN).toBeTypeOf('number');
    expect(nfse.infNFSe.IBSCBS?.valores).toBeUndefined();
    expect(nfse.infNFSe.IBSCBS?.cLocalidadeIncid).toBeUndefined();
    expect(nfse.infNFSe.IBSCBS?.totCIBS.gIBS).toBeUndefined();
    expect(nfse.infNFSe.IBSCBS?.totCIBS.vTotNF).toBe(1000);
  });

  it('round-trip DTO nt009 → XML → parse preserva vAjusteBC, imovel, bensMoveis e trib', () => {
    const nfse = parseNfseXml(fixtureNt009());
    if (nfse.layout !== 'nt009') throw new Error('narrow');
    // Igualdade no nível do DTO (não build(parse(xml)) × build(dto), que não vê o
    // que o serializer descarta); date-only volta na meia-noite de Brasília.
    expect(nfse.infNFSe.DPS).toEqual(comDatasBrt(dpsNt009Completa()));
    expect(buildDpsXml(nfse.infNFSe.DPS)).toBe(buildDpsXml(dpsNt009Completa()));
    const { valores, IBSCBS } = nfse.infNFSe.DPS.infDPS;
    expect(valores.vAjusteBC?.ajusteIssqn).toEqual({ pAjusteBCISSQN: 10 });
    expect(valores.vAjusteBC?.documentos?.docAjusteBC).toHaveLength(2);
    expect(IBSCBS?.imovel?.gUnidImob).toHaveLength(2);
    expect(IBSCBS?.bensMoveis).toHaveLength(2);
    expect(IBSCBS?.valores.trib).toEqual({ CST: '000', cClassTrib: '000001' });
  });

  it('NFS-e nt004 real segue parseando sem perda (vDedRed/gReeRepRes)', () => {
    const nfse = parseNfseXml(readFileSync(SAMPLE_PATH, 'utf-8'));
    expect(nfse.layout).toBe('nt004');
    expect(nfse.infNFSe.DPS.layout).toBe('nt004');
  });

  it('campo de outro layout é ignorado e gera warn', () => {
    const warn = vi.fn();
    const xml = fixtureNt009().replace(
      '</vServPrest>',
      '</vServPrest><vDedRed><pDR>1.00</pDR></vDedRed>',
    );
    const nfse = parseNfseXml(xml, { logger: { ...noopLogger, warn } });
    expect(nfse.layout).toBe('nt009');
    expect(warn).toHaveBeenCalledWith(
      'nfse.parse.unexpected_field',
      expect.objectContaining({ layout: 'nt009', field: 'vDedRed' }),
    );
  });

  it('nt004 com marcador do nt009 ignora e avisa, sem lançar', () => {
    const warn = vi.fn();
    const xml = readFileSync(SAMPLE_PATH, 'utf-8').replace(
      '</vServPrest>',
      '</vServPrest><vAjusteBC><pAjusteBCISSQN>1.00</pAjusteBCISSQN></vAjusteBC>',
    );
    const nfse = parseNfseXml(xml, { logger: { ...noopLogger, warn } });
    expect(nfse.layout).toBe('nt004');
    expect(warn).toHaveBeenCalledWith(
      'nfse.parse.unexpected_field',
      expect.objectContaining({ layout: 'nt004', field: 'vAjusteBC' }),
    );
  });

  it('não avisa quando o documento não tem campos de outro layout', () => {
    const warn = vi.fn();
    parseNfseXml(fixtureNt009(), { logger: { ...noopLogger, warn } });
    parseNfseXml(fixtureNt009Max(), { logger: { ...noopLogger, warn } });
    parseNfseXml(KITCHEN_SINK_NT004, { logger: { ...noopLogger, warn } });
    expect(warn).not.toHaveBeenCalled();
  });
});

const fixtureNt009Max = () =>
  readFileSync(join(__dirname, '__fixtures__', 'nfse-nt009-max.xml'), 'utf-8');

describe('parseNfseXml — NFS-e nt009 máxima (todos os opcionais)', () => {
  it('a fixture valida no XSD NFSe do nt009', async () => {
    const schemas = RTC_SCHEMAS.nt009;
    const main = schemas.find((s) => s.fileName === 'NFSe_v1.01.xsd');
    if (!main) throw new Error('NFSe_v1.01.xsd ausente');
    const { validateXML } = await import('xmllint-wasm');
    const out = await validateXML({
      xml: [{ fileName: 'nfse.xml', contents: fixtureNt009Max() }],
      schema: [main],
      preload: schemas.filter((s) => s !== main),
    });
    expect(out.errors).toEqual([]);
    expect(out.valid).toBe(true);
  });

  const nfse = parseNfseXml(fixtureNt009Max());
  if (nfse.layout !== 'nt009') throw new Error('esperava nt009');

  it('DPS embutido volta igual ao DTO de origem', () => {
    expect(nfse.infNFSe.DPS).toEqual(dpsNt009Max());
  });

  it('lê os valores da NFS-e (TCValoresNFSe do nt009)', () => {
    expect(nfse.infNFSe.valores).toEqual({
      vCalcAjusteBCISSQN: 30,
      tpBM: TipoBeneficioMunicipal.ReducaoPercentual,
      vCalcBM: 12.5,
      vBC: 947.5,
      pAliqAplic: 2,
      vISSQN: 18.95,
      vTotalRet: 7.25,
      vLiq: 973.8,
    });
  });

  it('lê o IBSCBS da NFS-e (TCRTCIBSCBS/TCRTCValoresIBSCBS/TCRTCTotalCIBS do nt009)', () => {
    expect(nfse.infNFSe.IBSCBS).toEqual({
      cLocalidadeIncid: '2111300',
      xLocalidadeIncid: 'São Luís',
      pRedutor: 12.5,
      valores: {
        vBC: 800,
        vCalcAjusteBCLocImoveis: 190,
        vCalcAjusteBCIBSCBS: 10,
        uf: { pIBSUF: 0.1, pRedAliqUF: 0.05, pAliqEfetUF: 0.09 },
        mun: { pIBSMun: 0.2, pRedAliqMun: 0.06, pAliqEfetMun: 0.18 },
        fed: { pCBS: 0.9, pRedAliqCBS: 0.07, pAliqEfetCBS: 0.83 },
      },
      totCIBS: {
        vTotNF: 1003.5,
        gIBS: {
          vIBSTot: 2.16,
          gIBSCredPres: { pCredPresIBS: 1, vCredPresIBS: 0.08 },
          gIBSUFTot: { vDifUF: 0.07, vIBSUF: 0.72 },
          gIBSMunTot: { vDifMun: 0.29, vIBSMun: 1.44 },
        },
        gCBS: {
          gCBSCredPres: { pCredPresCBS: 2, vCredPresCBS: 0.13 },
          vDifCBS: 1.99,
          vCBS: 6.64,
        },
        gTribRegular: {
          pAliqEfeRegIBSUF: 0.11,
          vTribRegIBSUF: 0.88,
          pAliqEfeRegIBSMun: 0.21,
          vTribRegIBSMun: 1.68,
          pAliqEfeRegCBS: 0.91,
          vTribRegCBS: 7.28,
        },
        gTribCompraGov: {
          pIBSUF: 0.12,
          vIBSUF: 0.96,
          pIBSMun: 0.22,
          vIBSMun: 1.76,
          pCBS: 0.92,
          vCBS: 7.36,
        },
      },
    });
  });
});

/**
 * Insere `<leaf>1</leaf>` como primeiro filho do elemento em `path` (a partir de
 * `infNFSe`, cada passo buscado após o anterior — a ordem do XSD garante que o
 * primeiro `<valores>` após `<infNFSe>` é o da NFS-e, o primeiro após `<IBSCBS>`
 * do DPS é o do DPS etc.).
 */
function injectChild(xml: string, path: readonly string[], leaf: string): string {
  let pos = xml.indexOf('<infNFSe');
  for (const name of path) {
    const re = new RegExp(`<${name}(?=[\\s>])[^>]*>`, 'g');
    re.lastIndex = pos;
    const m = re.exec(xml);
    if (!m) throw new Error(`elemento <${name}> não encontrado para injetar ${leaf}`);
    pos = m.index + m[0].length;
  }
  return `${xml.slice(0, pos)}<${leaf}>1</${leaf}>${xml.slice(pos)}`;
}

describe('parseNfseXml — campos de outro layout (FOREIGN_LAYOUT_FIELDS)', () => {
  const hosts: Record<Layout, string> = { nt009: fixtureNt009Max(), nt004: KITCHEN_SINK_NT004 };
  const casos = LAYOUTS.flatMap((layout) =>
    FOREIGN_LAYOUT_FIELDS[layout]
      // `infDPS/finNFSe` é o próprio marcador de detecção do nt009.
      .filter((f) => f.xmlPath.join('/') !== 'DPS/infDPS/finNFSe')
      .map((f) => [layout, f.xmlPath.join('/'), f.xmlPath] as const),
  );

  it.each(casos)('%s: %s é ignorado com warn, sem lançar', (layout, path, xmlPath) => {
    const host = hosts[layout];
    const leaf = xmlPath[xmlPath.length - 1] ?? '';
    const xml = injectChild(host, xmlPath.slice(0, -1), leaf);
    const warn = vi.fn();
    const nfse = parseNfseXml(xml, { logger: { ...noopLogger, warn } });
    expect(nfse.layout).toBe(layout);
    expect(warn).toHaveBeenCalledWith('nfse.parse.unexpected_field', {
      layout,
      field: leaf,
      path,
    });
    expect(nfse).toEqual(parseNfseXml(host));
  });
});

describe('parseNfseXml — nt009: campos que o Anexo I rejeita (E0034/E0031)', () => {
  it('chNFSeRej (E0034) é ignorado com warn', () => {
    const warn = vi.fn();
    const xml = fixtureNt009Max().replace(
      '<finNFSe>0</finNFSe>',
      '<finNFSe>0</finNFSe><chNFSeRej>21113002200574753000100000000000146726037032711025</chNFSeRej>',
    );
    const nfse = parseNfseXml(xml, { logger: { ...noopLogger, warn } });
    if (nfse.layout !== 'nt009') throw new Error('esperava nt009');
    expect(nfse.infNFSe.DPS.infDPS).not.toHaveProperty('chNFSeRej');
    expect(warn).toHaveBeenCalledWith('nfse.parse.unexpected_field', {
      layout: 'nt009',
      field: 'chNFSeRej',
      path: 'DPS/infDPS/chNFSeRej',
    });
  });

  it("cMotivoEmisTI diferente de '1' (E0031) é ignorado com warn; '1' é mantido", () => {
    const warn = vi.fn();
    const xml = fixtureNt009Max().replace(
      '<cMotivoEmisTI>1</cMotivoEmisTI>',
      '<cMotivoEmisTI>4</cMotivoEmisTI>',
    );
    expect(xml).not.toBe(fixtureNt009Max());
    const nfse = parseNfseXml(xml, { logger: { ...noopLogger, warn } });
    if (nfse.layout !== 'nt009') throw new Error('esperava nt009');
    expect(nfse.infNFSe.DPS.infDPS).not.toHaveProperty('cMotivoEmisTI');
    expect(warn).toHaveBeenCalledWith('nfse.parse.unexpected_field', {
      layout: 'nt009',
      field: 'cMotivoEmisTI',
      path: 'DPS/infDPS/cMotivoEmisTI',
      value: '4',
    });
    const ok = parseNfseXml(fixtureNt009Max());
    if (ok.layout !== 'nt009') throw new Error('esperava nt009');
    expect(ok.infNFSe.DPS.infDPS.cMotivoEmisTI).toBe(
      MotivoEmissaoTomadorIntermediario.ImportacaoServico,
    );
  });

  it('nt004 continua lendo chNFSeRej e cMotivoEmisTI', () => {
    const nfse = parseNt004(KITCHEN_SINK_NT004);
    expect(nfse.infNFSe.DPS.infDPS.chNFSeRej).toBe(
      '00000000000000000000000000000000000000000000000001',
    );
    expect(nfse.infNFSe.DPS.infDPS.cMotivoEmisTI).toBe(
      MotivoEmissaoTomadorIntermediario.ImportacaoServico,
    );
  });
});
