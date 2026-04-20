import { describe, expect, it } from 'vitest';
import { type BuildDpsParams, buildDps } from './build-dps.js';
import { buildDpsXml } from './build-xml.js';
import { OpcaoSimplesNacional, RegimeEspecialTributacao, TipoAmbienteDps } from './enums.js';
import { validateDpsXml } from './validate-xml.js';

function baseParams(): BuildDpsParams {
  return {
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    nDPS: '1',
    servico: {
      cTribNac: '250101',
      cNBS: '123456789',
      descricao: 'Serviço de teste',
    },
    valores: { vServ: 100 },
  };
}

describe('buildDps', () => {
  it('produces a DPS with versao 1.01 and a well-formed Id', () => {
    const dps = buildDps(baseParams());
    expect(dps.versao).toBe('1.01');
    expect(dps.infDPS.Id).toMatch(/^DPS\d{42}$/);
    expect(dps.infDPS.Id).toBe('DPS211130010057475300010000001000000000000001');
  });

  it('fills defaults: tpAmb=2, tpEmit=1, dhEmi=now, dCompet=today, verAplic', () => {
    const before = Date.now();
    const dps = buildDps(baseParams());
    const after = Date.now();

    expect(dps.infDPS.tpAmb).toBe(TipoAmbienteDps.Homologacao);
    expect(dps.infDPS.tpEmit).toBe('1');
    expect(dps.infDPS.verAplic).toMatch(/^open-nfse\/\d+\.\d+\.\d+$/);
    expect(dps.infDPS.dhEmi.getTime()).toBeGreaterThanOrEqual(before);
    expect(dps.infDPS.dhEmi.getTime()).toBeLessThanOrEqual(after);
    expect(dps.infDPS.dCompet).toBeInstanceOf(Date);
  });

  it('honors explicit tpAmb, dhEmi, dCompet and verAplic', () => {
    const dhEmi = new Date('2026-04-17T14:30:00Z');
    const dCompet = new Date('2026-04-01T00:00:00Z');
    const dps = buildDps({
      ...baseParams(),
      tpAmb: TipoAmbienteDps.Producao,
      dhEmi,
      dCompet,
      verAplic: 'acme-app-1.2.3',
    });

    expect(dps.infDPS.tpAmb).toBe(TipoAmbienteDps.Producao);
    expect(dps.infDPS.dhEmi).toBe(dhEmi);
    expect(dps.infDPS.dCompet).toBe(dCompet);
    expect(dps.infDPS.verAplic).toBe('acme-app-1.2.3');
  });

  it('mirrors emitente.codMunicipio into locPrest.cLocPrestacao when not overridden', () => {
    const dps = buildDps(baseParams());
    const loc = dps.infDPS.serv.locPrest;
    expect('cLocPrestacao' in loc && loc.cLocPrestacao).toBe('2111300');
  });

  it('honors explicit codMunicipioPrestacao when service is performed elsewhere', () => {
    const dps = buildDps({
      ...baseParams(),
      servico: { ...baseParams().servico, codMunicipioPrestacao: '3550308' },
    });
    const loc = dps.infDPS.serv.locPrest;
    expect('cLocPrestacao' in loc && loc.cLocPrestacao).toBe('3550308');
  });

  it('omits the toma group when no tomador is supplied', () => {
    const dps = buildDps(baseParams());
    expect(dps.infDPS.toma).toBeUndefined();
  });

  it('builds a CNPJ tomador with address when provided', () => {
    const dps = buildDps({
      ...baseParams(),
      tomador: {
        documento: { CNPJ: '11222333000181' },
        nome: 'Tomador Ltda',
        email: 'contato@tomador.test',
        endereco: {
          codMunicipio: '3550308',
          cep: '01310100',
          logradouro: 'Avenida Paulista',
          numero: '1578',
          bairro: 'Bela Vista',
          complemento: 'conj 12',
        },
      },
    });
    expect(dps.infDPS.toma?.identificador).toEqual({ CNPJ: '11222333000181' });
    expect(dps.infDPS.toma?.xNome).toBe('Tomador Ltda');
    expect(dps.infDPS.toma?.email).toBe('contato@tomador.test');
    const end = dps.infDPS.toma?.end;
    expect(end && 'endNac' in end.localidade && end.localidade.endNac.CEP).toBe('01310100');
    expect(end?.xLgr).toBe('Avenida Paulista');
    expect(end?.xCpl).toBe('conj 12');
  });

  it('builds a CPF tomador (discriminated union on documento)', () => {
    const dps = buildDps({
      ...baseParams(),
      tomador: { documento: { CPF: '01075595363' }, nome: 'Pessoa Física' },
    });
    expect(dps.infDPS.toma?.identificador).toEqual({ CPF: '01075595363' });
  });

  it('applies defaults for tribISSQN, tpRetISSQN, indTotTrib when not provided', () => {
    const dps = buildDps(baseParams());
    const trib = dps.infDPS.valores.trib;
    expect(trib.tribMun.tribISSQN).toBe('1');
    expect(trib.tribMun.tpRetISSQN).toBe('1');
    expect('indTotTrib' in trib.totTrib && trib.totTrib.indTotTrib).toBe('0');
    expect(trib.tribMun.pAliq).toBeUndefined();
  });

  it('includes pAliq only when aliqIss is supplied', () => {
    const dps = buildDps({
      ...baseParams(),
      valores: { vServ: 100, aliqIss: 2.5 },
    });
    expect(dps.infDPS.valores.trib.tribMun.pAliq).toBe(2.5);
  });

  it('includes regApTribSN on RegTrib only when provided', () => {
    const noOverride = buildDps(baseParams());
    expect(noOverride.infDPS.prest.regTrib.regApTribSN).toBeUndefined();

    const withOverride = buildDps({
      ...baseParams(),
      emitente: {
        ...baseParams().emitente,
        regime: {
          opSimpNac: OpcaoSimplesNacional.MeEpp,
          regApTribSN: '1' as never,
          regEspTrib: RegimeEspecialTributacao.Nenhum,
        },
      },
    });
    expect(withOverride.infDPS.prest.regTrib.regApTribSN).toBe('1');
  });

  it('passes XSD validation for a minimal-valid DPS', async () => {
    const xml = buildDpsXml(buildDps(baseParams()));
    await expect(validateDpsXml(xml)).resolves.toBeUndefined();
  });

  it('passes XSD validation with tomador + addresses', async () => {
    const xml = buildDpsXml(
      buildDps({
        ...baseParams(),
        emitente: {
          ...baseParams().emitente,
          inscricaoMunicipal: '6123007',
          nome: 'Voga LTDA',
          endereco: {
            codMunicipio: '2111300',
            cep: '65045215',
            logradouro: 'Rua Antônio Raposo',
            numero: '210',
            bairro: 'Cutim',
          },
        },
        tomador: {
          documento: { CPF: '01075595363' },
          nome: 'Maria Ferreira',
          endereco: {
            codMunicipio: '2111201',
            cep: '65117026',
            logradouro: 'Rua Nossa Sra de Fátima',
            numero: '233',
            bairro: 'Vila Conceição',
          },
        },
        valores: { vServ: 51.6, aliqIss: 5 },
      }),
    );
    await expect(validateDpsXml(xml)).resolves.toBeUndefined();
  });
});
