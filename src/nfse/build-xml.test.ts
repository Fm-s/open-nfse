import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATTR_PREFIX, parseXml } from '../xml/parser.js';
import { dpsNt009ComArraysVazios, dpsNt009Completa } from './__fixtures__/dps-nt009.js';
import { buildDpsXml } from './build-xml.js';
import type { DPS, DpsNt009, InfDPSNt004 } from './domain.js';
import { parseNfseXml } from './parse-xml.js';
import { validateDpsXml } from './validate-xml.js';

const SAMPLE_PATH = join(
  __dirname,
  '..',
  '..',
  'specs',
  'samples',
  '21113002200574753000100000000000146726037032711025.xml',
);

function minimalInfDPS(overrides: Partial<InfDPSNt004> = {}): InfDPSNt004 {
  return {
    Id: 'DPS211130010057475300010000001000000000000001',
    tpAmb: '2' as InfDPSNt004['tpAmb'],
    dhEmi: new Date('2026-04-17T14:30:00Z'),
    verAplic: 'test-1.0.0',
    serie: '1',
    nDPS: '1',
    dCompet: new Date('2026-04-17T00:00:00Z'),
    tpEmit: '1' as InfDPSNt004['tpEmit'],
    cLocEmi: '2111300',
    prest: {
      identificador: { CNPJ: '00574753000100' },
      IM: '6123007',
      regTrib: {
        opSimpNac: '3' as never,
        regEspTrib: '0' as never,
      },
    },
    serv: {
      locPrest: { cLocPrestacao: '2111300' },
      cServ: {
        cTribNac: '250101',
        xDescServ: 'Prestação de serviços',
      },
    },
    valores: {
      vServPrest: { vServ: 100 },
      trib: {
        tribMun: {
          tribISSQN: '1' as InfDPSNt004['valores']['trib']['tribMun']['tribISSQN'],
          tpRetISSQN: '1' as InfDPSNt004['valores']['trib']['tribMun']['tpRetISSQN'],
        },
        totTrib: { indTotTrib: '0' as never },
      },
    },
    ...overrides,
  };
}

function minimalDps(overrides: Partial<InfDPSNt004> = {}): DPS {
  return { layout: 'nt004', versao: '1.01', infDPS: minimalInfDPS(overrides) };
}

describe('buildDpsXml', () => {
  it('emits XML declaration and DPS root with xmlns + versao', () => {
    const xml = buildDpsXml(minimalDps());
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">');
  });

  it('omits the XML declaration when includeXmlDeclaration=false', () => {
    const xml = buildDpsXml(minimalDps(), { includeXmlDeclaration: false });
    expect(xml.startsWith('<?xml')).toBe(false);
    expect(xml.startsWith('<DPS ')).toBe(true);
  });

  it('formats decimals per TSDec*V2: integers bare, fractionals with 2 digits', () => {
    const dps = minimalDps({
      valores: {
        vServPrest: { vServ: 100 },
        trib: {
          tribMun: {
            tribISSQN: '1' as never,
            tpRetISSQN: '1' as never,
            pAliq: 2.5,
          },
          totTrib: { indTotTrib: '0' as never },
        },
      },
    });
    const xml = buildDpsXml(dps);
    expect(xml).toContain('<vServ>100</vServ>');
    expect(xml).toContain('<pAliq>2.50</pAliq>');
  });

  it('formats dCompet as date-only (YYYY-MM-DD) and dhEmi as ISO UTC', () => {
    const xml = buildDpsXml(
      minimalDps({
        dhEmi: new Date('2026-04-17T14:30:00Z'),
        dCompet: new Date('2026-04-17T12:00:00Z'),
      }),
    );
    expect(xml).toContain('<dhEmi>2026-04-17T11:30:00-03:00</dhEmi>');
    expect(xml).toContain('<dCompet>2026-04-17</dCompet>');
  });

  it('places Id as an attribute on <infDPS>, not as a child element', () => {
    const xml = buildDpsXml(minimalDps({ Id: 'DPS211130010057475300010000001000000000000001' }));
    expect(xml).toContain('<infDPS Id="DPS211130010057475300010000001000000000000001">');
    expect(xml).not.toContain('<Id>');
  });

  it('escapes XML special characters in text content', () => {
    const xml = buildDpsXml(
      minimalDps({
        serv: {
          locPrest: { cLocPrestacao: '2111300' },
          cServ: {
            cTribNac: '250101',
            cNBS: '123456789',
            xDescServ: 'A & B <tag> "quoted"',
          },
        },
      }),
    );
    expect(xml).toContain('<xDescServ>A &amp; B &lt;tag&gt; &quot;quoted&quot;</xDescServ>');
    // the parser must recover the original string
    const tree = parseXml(xml);
    const descServ = (
      (
        ((tree.DPS as Record<string, unknown>).infDPS as Record<string, unknown>).serv as Record<
          string,
          unknown
        >
      ).cServ as Record<string, unknown>
    ).xDescServ;
    expect(descServ).toBe('A & B <tag> "quoted"');
  });

  it('omits undefined optional fields entirely', () => {
    const xml = buildDpsXml(minimalDps());
    expect(xml).not.toContain('<cMotivoEmisTI');
    expect(xml).not.toContain('<subst');
    expect(xml).not.toContain('<toma');
    expect(xml).not.toContain('<interm');
    expect(xml).not.toContain('<IBSCBS');
    expect(xml).not.toContain('<comExt');
  });

  it('emits discriminated union CNPJ vs CPF correctly on prest', () => {
    const cnpjXml = buildDpsXml(
      minimalDps({
        prest: {
          identificador: { CNPJ: '00574753000100' },
          regTrib: { opSimpNac: '1' as never, regEspTrib: '0' as never },
        },
      }),
    );
    expect(cnpjXml).toContain('<CNPJ>00574753000100</CNPJ>');
    expect(cnpjXml).not.toContain('<CPF>');

    const cpfXml = buildDpsXml(
      minimalDps({
        prest: {
          identificador: { CPF: '12345678901' },
          regTrib: { opSimpNac: '1' as never, regEspTrib: '0' as never },
        },
      }),
    );
    expect(cpfXml).toContain('<CPF>12345678901</CPF>');
    expect(cpfXml).not.toContain('<CNPJ>');
  });

  it('emits LocPrest as either cLocPrestacao or cPaisPrestacao (not both)', () => {
    const national = buildDpsXml(
      minimalDps({
        serv: {
          locPrest: { cLocPrestacao: '2111300' },
          cServ: { cTribNac: '250101', xDescServ: 'x' },
        },
      }),
    );
    expect(national).toContain('<cLocPrestacao>2111300</cLocPrestacao>');
    expect(national).not.toContain('<cPaisPrestacao>');

    const exterior = buildDpsXml(
      minimalDps({
        serv: {
          locPrest: { cPaisPrestacao: 'US' },
          cServ: { cTribNac: '250101', xDescServ: 'x' },
        },
      }),
    );
    expect(exterior).toContain('<cPaisPrestacao>US</cPaisPrestacao>');
    expect(exterior).not.toContain('<cLocPrestacao>');
  });

  it('preserves leading zeros in string identifiers (CNPJ, IBGE)', () => {
    const xml = buildDpsXml(
      minimalDps({
        cLocEmi: '0000001',
        prest: {
          identificador: { CNPJ: '00000000000100' },
          regTrib: { opSimpNac: '1' as never, regEspTrib: '0' as never },
        },
      }),
    );
    expect(xml).toContain('<cLocEmi>0000001</cLocEmi>');
    expect(xml).toContain('<CNPJ>00000000000100</CNPJ>');
  });

  it('includes xmldsig Signature with ds namespace when signature is provided', () => {
    const xml = buildDpsXml({
      ...minimalDps(),
      signature: {
        signatureValue: 'SIGVAL',
        digestValue: 'DIGEST',
        x509Certificate: 'CERT',
        referenceUri: '#DPS123',
      },
    });
    expect(xml).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    expect(xml).toContain('<Reference URI="#DPS123">');
    expect(xml).toContain('<DigestValue>DIGEST</DigestValue>');
    expect(xml).toContain('<SignatureValue>SIGVAL</SignatureValue>');
    expect(xml).toContain('<X509Certificate>CERT</X509Certificate>');
  });

  it('roundtrips a fully-populated DPS extracted from the NFS-e sample fixture', () => {
    const sample = readFileSync(SAMPLE_PATH, 'utf-8');
    const dpsDto = parseNfseXml(sample).infNFSe.DPS;

    const built = buildDpsXml(dpsDto, { includeXmlDeclaration: false });
    const tree = parseXml(built);
    const reparsedDps = tree.DPS as Record<string, unknown>;

    expect(reparsedDps[`${ATTR_PREFIX}versao`]).toBe(dpsDto.versao);
    expect(built).toContain('xmlns="http://www.sped.fazenda.gov.br/nfse"');

    const infDps = reparsedDps.infDPS as Record<string, unknown>;
    expect(infDps[`${ATTR_PREFIX}Id`]).toBe(dpsDto.infDPS.Id);
    expect(infDps.tpAmb).toBe(dpsDto.infDPS.tpAmb);
    expect(infDps.serie).toBe(dpsDto.infDPS.serie);
    expect(infDps.nDPS).toBe(dpsDto.infDPS.nDPS);
    expect(infDps.cLocEmi).toBe(dpsDto.infDPS.cLocEmi);

    const prest = infDps.prest as Record<string, unknown>;
    expect(prest.CNPJ).toBe('00574753000100');
    expect(prest.IM).toBe('6123007');

    const toma = infDps.toma as Record<string, unknown>;
    expect(toma.CPF).toBe('01075595363');

    const serv = infDps.serv as Record<string, unknown>;
    const locPrest = serv.locPrest as Record<string, unknown>;
    expect(locPrest.cLocPrestacao).toBe('2111300');
    const cServ = serv.cServ as Record<string, unknown>;
    expect(cServ.cTribNac).toBe('250101');
  });

  it('round-trip via parseNfseXml: build(dps) → wrap with NFSe tree → parse equals the original DPS DTO', () => {
    const sample = readFileSync(SAMPLE_PATH, 'utf-8');
    const originalNfse = parseNfseXml(sample);
    const originalDps = originalNfse.infNFSe.DPS;

    const dpsXml = buildDpsXml(originalDps, { includeXmlDeclaration: false });
    const reparsed = parseXml(dpsXml) as unknown as { DPS: Record<string, unknown> };

    const infDps = reparsed.DPS.infDPS as Record<string, unknown>;

    expect(infDps.tpAmb).toBe(originalDps.infDPS.tpAmb);
    expect(infDps.tpEmit).toBe(originalDps.infDPS.tpEmit);
    expect(infDps.verAplic).toBe(originalDps.infDPS.verAplic);
    expect(infDps.cLocEmi).toBe(originalDps.infDPS.cLocEmi);

    // decimals are formatted per TSDec*V2 — integer vServ=51.6 becomes "51.60"
    const valores = infDps.valores as Record<string, unknown>;
    const vServPrest = valores.vServPrest as Record<string, unknown>;
    expect(Number(vServPrest.vServ)).toBeCloseTo(originalDps.infDPS.valores.vServPrest.vServ);
  });
});

describe('buildDpsXml — layout nt009', () => {
  it('DPS nt009 completa serializa e valida no XSD nt009', async () => {
    const xml = buildDpsXml(dpsNt009Completa());
    const result = await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false });
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('DPS nt009 completa é inválida no XSD nt004', async () => {
    const xml = buildDpsXml(dpsNt009Completa());
    expect((await validateDpsXml(xml, { layout: 'nt004', throwOnInvalid: false })).valid).toBe(
      false,
    );
  });

  it('nt009 põe finNFSe após cMotivoEmisTI e xDescServ após cIntContrib', () => {
    const xml = buildDpsXml(dpsNt009Completa());
    expect(xml.indexOf('<finNFSe>')).toBeGreaterThan(xml.indexOf('</tpEmit>'));
    expect(xml.indexOf('<finNFSe>')).toBeLessThan(xml.indexOf('<cLocEmi>'));
    expect(xml.indexOf('<xDescServ>')).toBeGreaterThan(xml.indexOf('</cIntContrib>'));
    expect(xml).not.toContain('<vDedRed>');
    expect(xml).not.toContain('<layout>');
  });

  it('serializa os grupos novos (vAjusteBC, imovel, bensMoveis, trib)', () => {
    const xml = buildDpsXml(dpsNt009Completa());
    expect(xml).toContain('<pAjusteBCISSQN>10</pAjusteBCISSQN>');
    expect(xml.match(/<docAjusteBC>/g)).toHaveLength(2);
    expect(xml).toContain('<tpAjusteBC>199</tpAjusteBC>');
    expect(xml).toContain('<xTpAjusteBC>Reembolso de despesas</xTpAjusteBC>');
    expect(xml).toContain('<vAjusteAplic>100.50</vAjusteAplic>');
    expect(xml).toContain('<dtEmiDoc>2026-11-20</dtEmiDoc>');
    expect(xml.match(/<gUnidImob>/g)).toHaveLength(2);
    expect(xml).toContain('<cCIB>ABC12345</cCIB>');
    expect(xml).toContain('<tpAjusteBCLocImoveis>03</tpAjusteBCLocImoveis>');
    expect(xml).toContain('<dVencOrig>2026-12-10</dVencOrig>');
    expect(xml.match(/<bensMoveis>/g)).toHaveLength(2);
    expect(xml).toContain('<qtdNCMBemMovel>3</qtdNCMBemMovel>');
    expect(xml).toContain('<trib><CST>000</CST><cClassTrib>000001</cClassTrib></trib>');
  });

  it('arrays vazios são omitidos (bensMoveis, gUnidImob, gAjusteBCLocImoveis)', async () => {
    const xml = buildDpsXml(dpsNt009ComArraysVazios());
    expect(xml).not.toMatch(/<bensMoveis|<gUnidImob|<gAjusteBCLocImoveis/);
    expect((await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false })).valid).toBe(
      true,
    );
  });

  it('gAjusteBCLocImoveis vazio dentro de um gUnidImob é omitido', async () => {
    const base = dpsNt009Completa();
    const ibscbs = base.infDPS.IBSCBS;
    if (!ibscbs?.imovel) throw new Error('fixture sem imovel');
    const dps: DpsNt009 = {
      ...base,
      infDPS: {
        ...base.infDPS,
        IBSCBS: {
          ...ibscbs,
          imovel: {
            cMun: ibscbs.imovel.cMun,
            gUnidImob: [{ identificacao: { cCIB: 'ABC12345' }, gAjusteBCLocImoveis: [] }],
          },
        },
      },
    };
    const xml = buildDpsXml(dps);
    expect(xml).toContain('<gUnidImob><cCIB>ABC12345</cCIB></gUnidImob>');
    expect(xml).not.toContain('<gAjusteBCLocImoveis');
    expect((await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false })).valid).toBe(
      true,
    );
  });

  it('InfoPessoa nt009 sem xNome é serializada sem o elemento', async () => {
    const base = dpsNt009Completa();
    const dps: DpsNt009 = {
      ...base,
      infDPS: { ...base.infDPS, toma: { identificador: { CPF: '12345678909' } } },
    };
    const xml = buildDpsXml(dps);
    expect(xml).toContain('<toma><CPF>12345678909</CPF></toma>');
    expect((await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false })).valid).toBe(
      true,
    );
  });

  it('DPS nt004 continua no layout antigo (finNFSe dentro de IBSCBS, xDescServ antes de cNBS)', () => {
    const xml = buildDpsXml(
      minimalDps({
        serv: {
          locPrest: { cLocPrestacao: '2111300' },
          cServ: { cTribNac: '250101', xDescServ: 'x', cNBS: '123456789' },
        },
      }),
    );
    expect(xml.indexOf('<xDescServ>')).toBeLessThan(xml.indexOf('<cNBS>'));
    expect(xml.indexOf('<finNFSe>')).toBe(-1);
  });
});
