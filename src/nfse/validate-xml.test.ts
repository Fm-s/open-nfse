import { describe, expect, it } from 'vitest';
import { InvalidLayoutError, XsdValidationError } from '../errors/validation.js';
import { buildDpsXml } from './build-xml.js';
import type { DPS, InfDPSNt004 } from './domain.js';
import { validateDpsXml } from './validate-xml.js';

function minimalDps(overrides: Partial<InfDPSNt004> = {}): DPS {
  const infDPS: InfDPSNt004 = {
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
      regTrib: { opSimpNac: '1' as never, regEspTrib: '0' as never },
    },
    serv: {
      locPrest: { cLocPrestacao: '2111300' },
      cServ: { cTribNac: '250101', cNBS: '123456789', xDescServ: 'Serviço de teste' },
    },
    valores: {
      vServPrest: { vServ: 100 },
      trib: {
        tribMun: { tribISSQN: '1' as never, tpRetISSQN: '1' as never },
        totTrib: { indTotTrib: '0' as never },
      },
    },
    ...overrides,
  };
  return { layout: 'nt004', versao: '1.01', infDPS };
}

describe('validateDpsXml', () => {
  it('passes for a well-formed DPS matching RTC v1.01', async () => {
    const xml = buildDpsXml(minimalDps());
    await expect(validateDpsXml(xml, { layout: 'nt004' })).resolves.toBeUndefined();
  });

  it('returns { valid: true, violations: [] } when throwOnInvalid=false and valid', async () => {
    const xml = buildDpsXml(minimalDps());
    const r = await validateDpsXml(xml, { layout: 'nt004', throwOnInvalid: false });
    expect(r.valid).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('throws XsdValidationError with violations[] when invalid and throwOnInvalid is default', async () => {
    // Invalid Id (length 48 instead of 45): easy way to trigger validation
    const bad = buildDpsXml(minimalDps({ Id: 'DPS211130010057475300010000000010000000000000001' }));
    await expect(validateDpsXml(bad, { layout: 'nt004' })).rejects.toBeInstanceOf(
      XsdValidationError,
    );
  });

  it('returns { valid: false, violations: [...] } when throwOnInvalid=false and invalid', async () => {
    const bad = buildDpsXml(minimalDps({ Id: 'DPS211130010057475300010000000010000000000000001' }));
    const r = await validateDpsXml(bad, { layout: 'nt004', throwOnInvalid: false });
    expect(r.valid).toBe(false);
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.violations[0]?.message).toMatch(/maxLength|pattern/);
  });

  it('rejects nDPS starting with 0 (XSD pattern [1-9][0-9]{0,14})', async () => {
    const bad = buildDpsXml(minimalDps({ nDPS: '01' }));
    const r = await validateDpsXml(bad, { layout: 'nt004', throwOnInvalid: false });
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => /nDPS/.test(v.message))).toBe(true);
  });

  it('accepts DPS without cNBS — optional in practice despite NT04 declaring it without minOccurs', async () => {
    const dps = minimalDps();
    const { cNBS: _omit, ...cServSemNBS } = dps.infDPS.serv.cServ;
    void _omit;
    const xml = buildDpsXml({
      ...dps,
      infDPS: {
        ...dps.infDPS,
        serv: { ...dps.infDPS.serv, cServ: cServSemNBS as typeof dps.infDPS.serv.cServ },
      },
    });
    const r = await validateDpsXml(xml, { layout: 'nt004', throwOnInvalid: false });
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('rejects dhEmi with milliseconds or Z suffix (pattern requires ±HH:00)', async () => {
    // Hand-craft an XML with the old ISO format to ensure validator catches it
    const xml = buildDpsXml(minimalDps()).replace(
      /<dhEmi>[^<]+<\/dhEmi>/,
      '<dhEmi>2026-04-17T14:30:00.000Z</dhEmi>',
    );
    const r = await validateDpsXml(xml, { layout: 'nt004', throwOnInvalid: false });
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => /dhEmi/.test(v.message))).toBe(true);
  });

  it('attaches line numbers to violations when the parser can locate them', async () => {
    const bad = buildDpsXml(
      minimalDps({ Id: 'DPS211130010057475300010000000010000000000000001' }),
      { includeXmlDeclaration: false },
    );
    const r = await validateDpsXml(bad, { layout: 'nt004', throwOnInvalid: false });
    const withLine = r.violations.find((v) => typeof v.line === 'number');
    expect(withLine).toBeDefined();
  });

  it('XsdValidationError surfaces the first violation in the message', async () => {
    const bad = buildDpsXml(minimalDps({ Id: 'DPS211130010057475300010000000010000000000000001' }));
    try {
      await validateDpsXml(bad, { layout: 'nt004' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(XsdValidationError);
      const e = err as XsdValidationError;
      expect(e.message).toMatch(/Validação XSD falhou/);
      expect(e.violations.length).toBeGreaterThan(0);
    }
  });

  describe('layouts', () => {
    const xmlNt004 = buildDpsXml(minimalDps());
    // nt009: finNFSe obrigatório após tpEmit e cNBS ainda é aceito, mas a ordem mudou (cNBS/cIntContrib antes de xDescServ).
    const xmlNt009 = xmlNt004
      .replace('</tpEmit>', '</tpEmit><finNFSe>0</finNFSe>')
      .replace(/<cNBS>[^<]*<\/cNBS>/, '');

    it('DPS nt009 é válida no bundle nt009 e inválida no nt004', async () => {
      expect(xmlNt009).toContain('<finNFSe>');
      expect(xmlNt009).not.toContain('<cNBS>');
      expect(
        (await validateDpsXml(xmlNt009, { layout: 'nt009', throwOnInvalid: false })).valid,
      ).toBe(true);
      expect(
        (await validateDpsXml(xmlNt009, { layout: 'nt004', throwOnInvalid: false })).valid,
      ).toBe(false);
    });

    it('DPS nt004 é inválida no bundle nt009 (finNFSe obrigatório)', async () => {
      expect(
        (await validateDpsXml(xmlNt004, { layout: 'nt009', throwOnInvalid: false })).valid,
      ).toBe(false);
    });

    it('rejeita layout desconhecido (chamadores JS)', async () => {
      await expect(validateDpsXml(xmlNt004, { layout: 'nt010' as never })).rejects.toBeInstanceOf(
        InvalidLayoutError,
      );
    });
  });
});
