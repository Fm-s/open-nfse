import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  InvalidCnpjError,
  InvalidCpfError,
  InvalidLayoutError,
  LayoutMismatchError,
  RuleViolationError,
} from '../errors/validation.js';
import { NfseClientFake } from '../testing/index.js';
import { dpsNt009Completa } from './__fixtures__/dps-nt009.js';
import {
  type BuildDpsParamsNt004,
  type BuildDpsParamsNt009,
  buildDps,
  type DocumentoAjusteBCInput,
} from './build-dps.js';
import { buildDpsXml } from './build-xml.js';
import type { DPS } from './domain.js';
import type { EmitirParams } from './emit.js';
import {
  FinalidadeNFSe,
  IndicadorDestinatario,
  IndicadorFinal,
  IndicadorTotalTributos,
  OpcaoSimplesNacional,
  RegimeApuracaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoAjusteBC,
  TipoAjusteBCLocImoveis,
  TipoAmbienteDps,
  TipoChaveDFe,
  TipoEnteGovernamental,
  TipoOperacao,
  TipoRetISSQN,
  TipoTribISSQN,
} from './enums.js';
import { parseNfseXml } from './parse-xml.js';
import { validateDpsXml } from './validate-xml.js';

function baseParams(): BuildDpsParamsNt004 {
  return {
    layout: 'nt004',
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.NaoOptante,
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
    // Não Optante exige vTotTrib/pTotTrib no choice totTrib (E0713).
    valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
  };
}

describe('buildDps', () => {
  it('produces a DPS with versao 1.01 and a well-formed Id', () => {
    const dps = buildDps(baseParams());
    expect(dps.versao).toBe('1.01');
    expect(dps.infDPS.Id).toMatch(/^DPS\d{42}$/);
    expect(dps.infDPS.Id).toBe('DPS211130020057475300010000001000000000000001');
  });

  it('fills defaults: tpAmb=2, tpEmit=1, dhEmi=now, dCompet=today, verAplic', () => {
    const before = Date.now();
    const dps = buildDps(baseParams());
    const after = Date.now();

    expect(dps.infDPS.tpAmb).toBe(TipoAmbienteDps.Homologacao);
    expect(dps.infDPS.tpEmit).toBe('1');
    expect(dps.infDPS.verAplic).toMatch(/^open-nfse\/\d+\.\d+\.\d+(rc\d+)?$/);
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

  it('applies defaults for tribISSQN, tpRetISSQN when not provided', () => {
    const dps = buildDps(baseParams());
    const trib = dps.infDPS.valores.trib;
    expect(trib.tribMun.tribISSQN).toBe('1');
    expect(trib.tribMun.tpRetISSQN).toBe('1');
    expect(trib.tribMun.pAliq).toBeUndefined();
  });

  // (a seleção de totTrib por regime — indTotTrib/pTotTribSN/vTotTrib/pTotTrib —
  // é coberta no describe "totTrib conforme regime" abaixo.)

  it('includes pAliq only when aliqIss is supplied', () => {
    const dps = buildDps({
      ...baseParams(),
      valores: { ...baseParams().valores, aliqIss: 2.5 },
    });
    expect(dps.infDPS.valores.trib.tribMun.pAliq).toBe(2.5);
  });

  it('includes regApTribSN on RegTrib only when provided', () => {
    // baseParams = NaoOptante → regApTribSN não se aplica e fica undefined.
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

  // Per TCRegTrib (RTC v1.01) — regApTribSN é obrigatório quando MeEpp.
  it('throws RuleViolationError when opSimpNac=MeEpp without regApTribSN', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        emitente: {
          ...baseParams().emitente,
          regime: {
            opSimpNac: OpcaoSimplesNacional.MeEpp,
            regEspTrib: RegimeEspecialTributacao.Nenhum,
          },
        },
      }),
    ).toThrow(RuleViolationError);
  });

  // aliqIss = 0.025 é quase sempre erro de fração-vs-percentual (passariam 2,5%
  // como `0.025` em vez de `2.5`). O formatter rebaixaria a "0.03" e a nota
  // sairia com 0,03% — fail-fast local em vez de emitir tributo errado.
  it('throws RuleViolationError on aliqIss in the fraction-mistake range', () => {
    expect(() => buildDps({ ...baseParams(), valores: { vServ: 100, aliqIss: 0.025 } })).toThrow(
      RuleViolationError,
    );
    expect(() => buildDps({ ...baseParams(), valores: { vServ: 100, aliqIss: 0.05 } })).toThrow(
      RuleViolationError,
    );
  });

  it('accepts aliqIss=0 (alíquota zero legítima) and típicas (2.5, 5)', () => {
    const v = baseParams().valores;
    expect(() => buildDps({ ...baseParams(), valores: { ...v, aliqIss: 0 } })).not.toThrow();
    expect(() => buildDps({ ...baseParams(), valores: { ...v, aliqIss: 2.5 } })).not.toThrow();
    expect(() => buildDps({ ...baseParams(), valores: { ...v, aliqIss: 5 } })).not.toThrow();
  });

  it('passes XSD validation for a minimal-valid DPS', async () => {
    const xml = buildDpsXml(buildDps(baseParams()));
    await expect(validateDpsXml(xml, { layout: 'nt004' })).resolves.toBeUndefined();
  });

  // tpEmit='1' — SEFIN rejeita xNome/end no prest porque preenche do cadastro.
  it('never includes xNome or end on the prestador block', () => {
    const dps = buildDps({
      ...baseParams(),
      emitente: {
        ...baseParams().emitente,
        inscricaoMunicipal: '6123007',
        email: 'fiscal@voga.test',
        fone: '11999990000',
      },
    });
    expect(dps.infDPS.prest.xNome).toBeUndefined();
    expect(dps.infDPS.prest.end).toBeUndefined();
    expect(dps.infDPS.prest.IM).toBe('6123007');
    expect(dps.infDPS.prest.email).toBe('fiscal@voga.test');
  });

  it('passes XSD validation with tomador + addresses', async () => {
    const xml = buildDpsXml(
      buildDps({
        ...baseParams(),
        emitente: {
          ...baseParams().emitente,
          inscricaoMunicipal: '6123007',
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
        valores: { ...baseParams().valores, vServ: 51.6, aliqIss: 5 },
      }),
    );
    await expect(validateDpsXml(xml, { layout: 'nt004' })).resolves.toBeUndefined();
  });

  // --- Guardas de conformidade fail-fast (auditoria 2026-05-29) ---
  // Regras de rejeição fechadas, checáveis offline: evitam queimar nDPS num
  // round-trip que a SEFIN rejeitaria. Cada teste cita o codErro da regra.

  it('throws RuleViolationError (E0595) when aliqIss exceeds the 5% ISSQN ceiling', () => {
    expect(() => buildDps({ ...baseParams(), valores: { vServ: 100, aliqIss: 6 } })).toThrow(
      RuleViolationError,
    );
  });

  it('throws RuleViolationError (E0600) when a MEI emitter informs aliqIss', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        emitente: {
          ...baseParams().emitente,
          regime: {
            opSimpNac: OpcaoSimplesNacional.Mei,
            regEspTrib: RegimeEspecialTributacao.Nenhum,
          },
        },
        valores: { vServ: 100, aliqIss: 2.5 },
      }),
    ).toThrow(RuleViolationError);
  });

  it('throws RuleViolationError (E0162) when regApTribSN is set for a Não Optante', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        emitente: {
          ...baseParams().emitente,
          regime: {
            opSimpNac: OpcaoSimplesNacional.NaoOptante,
            regEspTrib: RegimeEspecialTributacao.Nenhum,
            regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN,
          },
        },
      }),
    ).toThrow(RuleViolationError);
  });

  it("throws RuleViolationError (E0315) when cTribMun is '000'", () => {
    expect(() =>
      buildDps({ ...baseParams(), servico: { ...baseParams().servico, cTribMun: '000' } }),
    ).toThrow(RuleViolationError);
  });

  it("throws RuleViolationError (E1402) when cTribNac=200101 and cLocPrestacao='0000000'", () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        servico: {
          ...baseParams().servico,
          cTribNac: '200101',
          codMunicipioPrestacao: '0000000',
        },
      }),
    ).toThrow(RuleViolationError);
  });

  it('throws RuleViolationError (E0602) when aliqIss is informed with tribISSQN imune/exportação/não-incidência', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        valores: { vServ: 100, aliqIss: 2.5, tribISSQN: TipoTribISSQN.Imunidade },
      }),
    ).toThrow(RuleViolationError);
  });

  it('throws RuleViolationError (E0580) when tpRetISSQN is retido with tribISSQN imune/exportação/não-incidência', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        valores: {
          vServ: 100,
          tribISSQN: TipoTribISSQN.ExportacaoServico,
          tpRetISSQN: TipoRetISSQN.RetidoPeloTomador,
        },
      }),
    ).toThrow(RuleViolationError);
  });

  it('accepts a tributável line at the 5% ceiling without tripping the new guards', () => {
    expect(() =>
      buildDps({ ...baseParams(), valores: { ...baseParams().valores, aliqIss: 5 } }),
    ).not.toThrow();
  });

  // E0424 — vReceb não deve ser informado quando o emitente é prestador ou tomador
  // (nt004, Anexo I 20260209: tpEmit 1 ou 2) ou também intermediário (nt009,
  // Anexo I 20261020: tpEmit 1, 2 ou 3); buildDps usa tpEmit=1.
  it('throws RuleViolationError (E0424) when vReceb is set (buildDps is always tpEmit=1)', () => {
    expect(() => buildDps({ ...baseParams(), valores: { vServ: 100, vReceb: 50 } })).toThrow(
      RuleViolationError,
    );
  });

  it('E0424 message follows the layout Anexo I (nt004: tpEmit 1 ou 2; nt009: 1, 2 ou 3)', () => {
    const valores = { ...baseParams().valores, vReceb: 50 };
    expect(() => buildDps({ ...baseParams(), layout: 'nt004', valores })).toThrow(
      expect.objectContaining({
        rule: 'E0424',
        message: expect.stringMatching(/prestador ou tomador .*\(tpEmit 1 ou 2\)/),
      }),
    );
    expect(() => buildDps({ ...baseParams(), layout: 'nt009', valores })).toThrow(
      expect.objectContaining({
        rule: 'E0424',
        message: expect.stringMatching(
          /prestador, tomador ou intermediário .*\(tpEmit 1, 2 ou 3\)/,
        ),
      }),
    );
  });

  // E0080/E0096/E0188/E0206 — DV de CPF/CNPJ. O path offline buildDps+buildDpsXml
  // (dry-run/preview) também deve rejeitar DV inválido, não só o emitSeguro.
  it('throws InvalidCnpjError when the emitente CNPJ has an invalid check digit', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        emitente: { ...baseParams().emitente, cnpj: '00574753000199' },
      }),
    ).toThrow(InvalidCnpjError);
  });

  it('skips CPF/CNPJ DV validation when skipCpfCnpjValidation is set', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        skipCpfCnpjValidation: true,
        emitente: { ...baseParams().emitente, cnpj: '00574753000199' },
      }),
    ).not.toThrow();
  });
});

// B1 — o membro válido do choice totTrib depende da situação do emitente perante
// o Simples Nacional (E0710 MEI≠pTotTribSN, E0712 ME/EPP≠indTotTrib, E0713 Não
// Optante≠indTotTrib/pTotTribSN → deve usar vTotTrib/pTotTrib).
describe('buildDps — totTrib conforme regime (B1, auditoria 2026-05-29)', () => {
  const meiEmitente = () => ({
    ...baseParams().emitente,
    regime: {
      opSimpNac: OpcaoSimplesNacional.Mei,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    },
  });
  const meEppEmitente = () => ({
    ...baseParams().emitente,
    regime: {
      opSimpNac: OpcaoSimplesNacional.MeEpp,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
      regApTribSN: RegimeApuracaoSimplesNacional.FederalEMunicipalPeloSN,
    },
  });

  it('Não Optante sem totTrib lança (E0713) — exige vTotTrib/pTotTrib', () => {
    expect(() => buildDps({ ...baseParams(), valores: { vServ: 100 } })).toThrow(
      RuleViolationError,
    );
  });

  it('Não Optante com pTotTribSN lança (E0713)', () => {
    expect(() => buildDps({ ...baseParams(), valores: { vServ: 100, pTotTribSN: 6 } })).toThrow(
      RuleViolationError,
    );
  });

  it('Não Optante com pTotTrib é aceito', () => {
    const dps = buildDps({
      ...baseParams(),
      valores: { vServ: 100, pTotTrib: { pTotTribFed: 1, pTotTribEst: 0, pTotTribMun: 2 } },
    });
    const tot = dps.infDPS.valores.trib.totTrib;
    expect('pTotTrib' in tot && tot.pTotTrib.pTotTribFed).toBe(1);
  });

  it('Não Optante com vTotTrib é aceito', () => {
    const dps = buildDps({
      ...baseParams(),
      valores: { vServ: 100, vTotTrib: { vTotTribFed: 1, vTotTribEst: 0, vTotTribMun: 2 } },
    });
    const tot = dps.infDPS.valores.trib.totTrib;
    expect('vTotTrib' in tot && tot.vTotTrib.vTotTribFed).toBe(1);
  });

  it('MEI sem totTrib usa indTotTrib=0 (default válido para MEI)', () => {
    const dps = buildDps({ ...baseParams(), emitente: meiEmitente(), valores: { vServ: 100 } });
    const tot = dps.infDPS.valores.trib.totTrib;
    expect('indTotTrib' in tot && tot.indTotTrib).toBe('0');
  });

  it('MEI com pTotTribSN lança (E0710)', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        emitente: meiEmitente(),
        valores: { vServ: 100, pTotTribSN: 6 },
      }),
    ).toThrow(RuleViolationError);
  });

  it('ME/EPP com pTotTribSN é aceito', () => {
    const dps = buildDps({
      ...baseParams(),
      emitente: meEppEmitente(),
      valores: { vServ: 100, pTotTribSN: 6 },
    });
    const tot = dps.infDPS.valores.trib.totTrib;
    expect('pTotTribSN' in tot && tot.pTotTribSN).toBe(6);
  });

  it('ME/EPP sem totTrib lança (E0712) — exige pTotTribSN/vTotTrib/pTotTrib', () => {
    expect(() =>
      buildDps({ ...baseParams(), emitente: meEppEmitente(), valores: { vServ: 100 } }),
    ).toThrow(RuleViolationError);
  });

  it('ME/EPP com indTotTrib lança (E0712)', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        emitente: meEppEmitente(),
        valores: { vServ: 100, indTotTrib: IndicadorTotalTributos.Nao },
      }),
    ).toThrow(RuleViolationError);
  });
});

// E0532 — o serviço 99.01.01 (sem incidência de ISSQN) exige tribISSQN=4.
describe('buildDps — incidência por serviço (E0532)', () => {
  it('lança quando cTribNac=990101 e tribISSQN ≠ 4 (não-incidência)', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        servico: { ...baseParams().servico, cTribNac: '990101' },
        // tribISSQN default = '1' (tributável) → inválido para 99.01.01.
      }),
    ).toThrow(RuleViolationError);
  });

  it('aceita cTribNac=990101 com tribISSQN=4 (não-incidência)', () => {
    expect(() =>
      buildDps({
        ...baseParams(),
        servico: { ...baseParams().servico, cTribNac: '990101' },
        valores: { ...baseParams().valores, tribISSQN: TipoTribISSQN.NaoIncidencia },
      }),
    ).not.toThrow();
  });

  it('nt004: E0532 cobre só o 99.01.01 (Anexo I 20260209) — 99.03.01 com tribISSQN default passa', () => {
    expect(() =>
      buildDps({ ...baseParams(), servico: { ...baseParams().servico, cTribNac: '990301' } }),
    ).not.toThrow();
  });

  it('nt009: E0532 cobre todo 99.XX.XX (Anexo I 20261020)', () => {
    for (const cTribNac of ['990101', '990301', '990401']) {
      const params: BuildDpsParamsNt009 = {
        ...baseParams(),
        layout: 'nt009',
        servico: { ...baseParams().servico, cTribNac },
      };
      expect(() => buildDps(params)).toThrow(expect.objectContaining({ rule: 'E0532' }));
      expect(() => buildDps(params)).toThrow(/99\.XX\.XX.*per E0532$/);
      expect(() =>
        buildDps({
          ...params,
          valores: { ...params.valores, tribISSQN: TipoTribISSQN.NaoIncidencia },
        }),
      ).not.toThrow();
    }
  });
});

// E0313 — só existe no Anexo I 20261020 (nt009): MEI não informa cTribMun.
describe('buildDps — cTribMun de MEI (E0313)', () => {
  const mei = (layout: 'nt004' | 'nt009') =>
    ({
      ...baseParams(),
      layout,
      emitente: {
        ...baseParams().emitente,
        regime: {
          opSimpNac: OpcaoSimplesNacional.Mei,
          regEspTrib: RegimeEspecialTributacao.Nenhum,
        },
      },
      servico: { ...baseParams().servico, cTribMun: '001' },
    }) as const;

  it('nt009: MEI com cTribMun → E0313', () => {
    expect(() => buildDps(mei('nt009'))).toThrow(expect.objectContaining({ rule: 'E0313' }));
    expect(() => buildDps(mei('nt009'))).toThrow(/per E0313$/);
  });

  it('nt009: MEI sem cTribMun e não-MEI com cTribMun passam', () => {
    const { cTribMun: _, ...servicoSemCTribMun } = mei('nt009').servico;
    expect(() => buildDps({ ...mei('nt009'), servico: servicoSemCTribMun })).not.toThrow();
    expect(() => buildDps({ ...mei('nt009'), emitente: baseParams().emitente })).not.toThrow();
  });

  it('nt004: a regra não existe no Anexo I 20260209 — MEI com cTribMun passa', () => {
    expect(() => buildDps(mei('nt004'))).not.toThrow();
  });
});

describe('buildDps — layout', () => {
  it("layout 'nt009' produz InfDPSNt009 com finNFSe Regular e XML válido no XSD nt009", async () => {
    const dps = buildDps({ ...baseParams(), layout: 'nt009' });
    expect(dps.layout).toBe('nt009');
    expect(dps.versao).toBe('1.01');
    expect(dps.infDPS.finNFSe).toBe(FinalidadeNFSe.Regular);
    const xml = buildDpsXml(dps);
    expect(xml).toContain('<finNFSe>0</finNFSe>');
    await expect(validateDpsXml(xml, { layout: 'nt009' })).resolves.toBeUndefined();
  });

  it("layout 'nt004' não carrega finNFSe", () => {
    const dps = buildDps(baseParams());
    expect(dps.layout).toBe('nt004');
    expect('finNFSe' in dps.infDPS).toBe(false);
  });

  it.each([undefined, 'NT004', 'nt010'])('layout %s → InvalidLayoutError', (layout) => {
    expect(() => buildDps({ ...baseParams(), layout } as never)).toThrow(InvalidLayoutError);
  });
});

describe('nt009 inputs de alto nível', () => {
  // Emitente/tomador com DV válido; vServ 1000 é o teto de E0467 nos testes.
  function paramsNt009Minimos(): BuildDpsParamsNt009 {
    return {
      layout: 'nt009',
      emitente: {
        cnpj: '00574753000100',
        codMunicipio: '2111300',
        regime: {
          opSimpNac: OpcaoSimplesNacional.NaoOptante,
          regEspTrib: RegimeEspecialTributacao.Nenhum,
        },
      },
      serie: '1',
      nDPS: '1',
      dhEmi: new Date('2026-12-01T14:30:00Z'),
      dCompet: new Date('2026-12-01T12:00:00Z'),
      servico: { cTribNac: '250101', cNBS: '123456789', descricao: 'Locação de imóvel' },
      valores: { vServ: 1000, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
    };
  }

  const CHAVE_NFSE = '21113002200574753000100000000000146726037032711025';
  const ENDERECO_FORNECEDOR = {
    codMunicipio: '2111300',
    cep: '65020000',
    logradouro: 'Rua F',
    numero: '5',
    bairro: 'Centro',
  } as const;

  /**
   * Locação de imóvel (99.03.01) mínima e válida pelas regras fechadas do
   * Anexo I 20261020: tribISSQN=4 (E0532), cNBS (E0322), gLocacao (E0937),
   * cIndOp 02XXXX (E0902) com gUnidImob (E0938).
   */
  function paramsNt009Locacao(): BuildDpsParamsNt009 {
    const base = paramsNt009Minimos();
    return {
      ...base,
      servico: { ...base.servico, cTribNac: '990301' },
      valores: { ...base.valores, tribISSQN: TipoTribISSQN.NaoIncidencia },
      ibsCbs: {
        classificacao: { CST: '000', cClassTrib: '000001' },
        cIndOp: '020101',
        imovel: {
          codMunicipio: '2111300',
          locacao: { pCopropriedade: 100, vTotOper: 1000 },
          unidades: [{ identificacao: { cCIB: 'ABC12345' } }],
        },
      },
    };
  }

  /** Locação de bens móveis (99.04.01): bensMoveis obrigatório (E0963) e só aqui (E0967). */
  function paramsNt009BensMoveis(): BuildDpsParamsNt009 {
    const base = paramsNt009Minimos();
    return {
      ...base,
      servico: { ...base.servico, cTribNac: '990401', descricao: 'Locação de bens móveis' },
      valores: { ...base.valores, tribISSQN: TipoTribISSQN.NaoIncidencia },
      ibsCbs: {
        classificacao: { CST: '000', cClassTrib: '000001' },
        bensMoveis: [
          { ncm: '94036000', descricao: 'Móveis de madeira', quantidade: '3' },
          { ncm: '84183000', descricao: 'Congelador', quantidade: '1' },
        ],
      },
    };
  }

  /**
   * Todos os inputs de alto nível do nt009 que cabem numa mesma DPS, sem violar
   * nenhuma regra fechada do Anexo I 20261020 (bensMoveis exige 99.04.01 e
   * gLocacao exige 99.03 — por isso bens móveis ficam em
   * {@link paramsNt009BensMoveis}).
   */
  function paramsNt009Completos(): BuildDpsParamsNt009 {
    const locacao = paramsNt009Locacao();
    return {
      ...locacao,
      tomador: { documento: { CPF: '01075595363' }, nome: 'Tomador de Teste' },
      ajusteBC: {
        issqn: { percentual: 10 },
        documentos: [
          {
            // 102: fora da lista do E0462 (convive com pAjusteBCISSQN) e do
            // E0479 (admite docOutro); dispensa o E0435 com tribISSQN=4.
            tipo: TipoAjusteBC.RepasseFornecedorAgenciaTurismo,
            valorTotal: 200,
            valorAplicado: 100.5,
            dataEmissao: new Date('2026-11-20T12:00:00Z'),
            documento: { docOutro: { nDoc: 'REC-41', xDoc: 'Recibo' } },
            fornecedor: {
              documento: { CNPJ: '11222333000181' },
              nome: 'Fornecedor de Teste',
              endereco: ENDERECO_FORNECEDOR,
            },
          },
          {
            // 199 exige documento fiscal (E0479).
            tipo: TipoAjusteBC.OutrosReembolsos,
            descricao: 'Reembolso de despesas',
            valorTotal: 50,
            valorAplicado: 50,
            dataEmissao: new Date('2026-11-25T12:00:00Z'),
            dataCompetencia: new Date('2026-11-25T12:00:00Z'),
            documento: {
              dFeNacional: { tipoChaveDFe: TipoChaveDFe.Nfse, chaveDFe: CHAVE_NFSE },
            },
          },
        ],
      },
      ibsCbs: {
        classificacao: {
          CST: '000',
          cClassTrib: '000001',
          cCredPres: '01',
          tributacaoRegular: { CSTReg: '000', cClassTribReg: '000001' },
          diferimento: { pDifUF: 10, pDifMun: 10, pDifCBS: 10 },
        },
        indFinal: IndicadorFinal.Sim,
        cIndOp: '020101',
        // tpEnteGov exige tpOper (E0903); tpOper 3 exige gRefNFSe (E0905).
        tpOper: TipoOperacao.FornecimentoComPagamentoJaRealizado,
        nfseReferenciadas: [CHAVE_NFSE],
        tpEnteGov: TipoEnteGovernamental.Municipio,
        destinatario: {
          documento: { CNPJ: '11222333000181' },
          nome: 'Destinatário Ltda',
          email: 'dest@example.test',
          endereco: {
            codMunicipio: '2111300',
            cep: '65000000',
            logradouro: 'Rua D',
            numero: '4',
            bairro: 'Centro',
          },
        },
        imovel: {
          codMunicipio: '2111300',
          locacao: {
            pCopropriedade: 50,
            vTotOper: 1000,
            vDescIncondTot: 10,
            vDescCondTot: 30,
            dVencOrig: new Date('2026-12-10T12:00:00Z'),
          },
          unidades: [
            {
              inscricaoImobiliaria: 'IMOB-1',
              identificacao: { cCIB: 'ABC12345' },
              ajustesBC: [
                { tipo: TipoAjusteBCLocImoveis.Condominio, valor: 150 },
                { tipo: TipoAjusteBCLocImoveis.Outras, descricao: 'Fundo de reserva', valor: 30 },
              ],
            },
            {
              identificacao: {
                endereco: {
                  cep: '65010000',
                  logradouro: 'Av. B',
                  numero: '200',
                  complemento: 'Apto 3',
                  bairro: 'Jardim',
                },
              },
            },
          ],
        },
      },
    };
  }

  /** Dia de Brasília à meia-noite — como o parser ancora os campos date-only (`TSData`). */
  function meiaNoiteBrt(d: Date): Date {
    const dia = new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    return new Date(`${dia}T03:00:00.000Z`);
  }

  /**
   * Substitui a `<DPS>` do envelope NFS-e sintético do nt009 pela DPS dada e
   * parseia (não há entry point só de DPS).
   */
  function parseViaEnvelope(dps: DPS): DPS {
    const envelope = readFileSync(
      join(__dirname, '__fixtures__', 'nfse-nt009-sintetica.xml'),
      'utf-8',
    );
    expect(envelope).toMatch(/<DPS[\s\S]*<\/DPS>/);
    const dpsXml = buildDpsXml(dps, { includeXmlDeclaration: false });
    const nfse = parseNfseXml(envelope.replace(/<DPS[\s\S]*<\/DPS>/, () => dpsXml));
    return nfse.infNFSe.DPS;
  }

  type DocPatch = { [K in keyof DocumentoAjusteBCInput]?: DocumentoAjusteBCInput[K] | undefined };
  function docCom(patch: DocPatch): {
    readonly ajusteBC: { readonly documentos: readonly DocumentoAjusteBCInput[] };
  } {
    const merged: Record<string, unknown> = {
      tipo: TipoAjusteBC.Materiais,
      valorTotal: 500,
      valorAplicado: 100,
      documento: { docOutro: { nDoc: '1', xDoc: 'Recibo' } },
      ...patch,
    };
    for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
    return { ajusteBC: { documentos: [merged as unknown as DocumentoAjusteBCInput] } };
  }

  /** Campos `TSData` (date-only) do DTO da DPS nt009. */
  const CAMPOS_DATA = new Set(['dCompet', 'dtEmiDoc', 'dtCompDoc', 'dVencOrig']);

  /** Cópia profunda com os campos date-only ancorados à meia-noite de Brasília. */
  function comDatasDoParser<T>(v: T, chave = ''): T {
    if (v instanceof Date) return (CAMPOS_DATA.has(chave) ? meiaNoiteBrt(v) : v) as T;
    if (Array.isArray(v)) return v.map((x) => comDatasDoParser(x)) as T;
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, comDatasDoParser(x, k)]),
      ) as T;
    }
    return v;
  }

  it.each([
    ['completos (99.03)', paramsNt009Completos],
    ['bens móveis (99.04.01)', paramsNt009BensMoveis],
  ] as const)(
    'round-trip %s: inputs → DPS → XML válido nt009 → parse igual no DTO',
    async (_, params) => {
      const dps = buildDps(params());
      const xml = buildDpsXml(dps);
      const result = await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false });
      expect(result.violations).toEqual([]);
      expect(result.valid).toBe(true);

      // Igualdade no nível do DTO (não XML × XML re-serializado): um campo que o
      // serializer deixe de emitir some do parse e quebra a comparação.
      expect(parseViaEnvelope(dps)).toEqual(comDatasDoParser(dps));
    },
  );

  it('buildDps mapeia os inputs completos exatamente nos grupos da RTC', () => {
    const dps = buildDps(paramsNt009Completos());
    expect(dps.infDPS.serv.cServ).toEqual({
      cTribNac: '990301',
      xDescServ: 'Locação de imóvel',
      cNBS: '123456789',
    });
    expect(dps.infDPS.valores.trib.tribMun.tribISSQN).toBe(TipoTribISSQN.NaoIncidencia);
    // E0434/E0443: vDescIncond/vDescCond = pCopropriedade × vDesc*Tot (50% de 10 e de 30).
    expect(dps.infDPS.valores.vDescCondIncond).toEqual({ vDescIncond: 5, vDescCond: 15 });
    expect(dps.infDPS.valores.vAjusteBC).toEqual({
      ajusteIssqn: { pAjusteBCISSQN: 10 },
      documentos: {
        docAjusteBC: [
          {
            tpAjusteBC: TipoAjusteBC.RepasseFornecedorAgenciaTurismo,
            vTotDoc: 200,
            vAjusteAplic: 100.5,
            dtEmiDoc: new Date('2026-11-20T12:00:00Z'),
            documento: { docOutro: { nDoc: 'REC-41', xDoc: 'Recibo' } },
            fornec: {
              identificador: { CNPJ: '11222333000181' },
              xNome: 'Fornecedor de Teste',
              end: {
                localidade: { endNac: { cMun: '2111300', CEP: '65020000' } },
                xLgr: 'Rua F',
                nro: '5',
                xBairro: 'Centro',
              },
            },
          },
          {
            tpAjusteBC: TipoAjusteBC.OutrosReembolsos,
            xTpAjusteBC: 'Reembolso de despesas',
            vTotDoc: 50,
            vAjusteAplic: 50,
            dtEmiDoc: new Date('2026-11-25T12:00:00Z'),
            dtCompDoc: new Date('2026-11-25T12:00:00Z'),
            documento: { dFeNacional: { tipoChaveDFe: TipoChaveDFe.Nfse, chaveDFe: CHAVE_NFSE } },
          },
        ],
      },
    });
    expect(dps.infDPS.IBSCBS).toEqual({
      indFinal: IndicadorFinal.Sim,
      cIndOp: '020101',
      tpOper: TipoOperacao.FornecimentoComPagamentoJaRealizado,
      gRefNFSe: { refNFSe: [CHAVE_NFSE] },
      tpEnteGov: TipoEnteGovernamental.Municipio,
      indDest: IndicadorDestinatario.DestinatarioDistinto,
      dest: {
        identificador: { CNPJ: '11222333000181' },
        xNome: 'Destinatário Ltda',
        end: {
          localidade: { endNac: { cMun: '2111300', CEP: '65000000' } },
          xLgr: 'Rua D',
          nro: '4',
          xBairro: 'Centro',
        },
        email: 'dest@example.test',
      },
      imovel: {
        cMun: '2111300',
        gLocacao: {
          pCopropriedade: 50,
          vTotOper: 1000,
          vDescIncondTot: 10,
          vDescCondTot: 30,
          dVencOrig: new Date('2026-12-10T12:00:00Z'),
        },
        gUnidImob: [
          {
            inscImobFisc: 'IMOB-1',
            identificacao: { cCIB: 'ABC12345' },
            gAjusteBCLocImoveis: [
              { tpAjusteBCLocImoveis: TipoAjusteBCLocImoveis.Condominio, vAjusteBCLocImoveis: 150 },
              {
                tpAjusteBCLocImoveis: TipoAjusteBCLocImoveis.Outras,
                xTpAjusteBCLocImoveis: 'Fundo de reserva',
                vAjusteBCLocImoveis: 30,
              },
            ],
          },
          {
            identificacao: {
              end: {
                CEP: '65010000',
                xLgr: 'Av. B',
                nro: '200',
                xCpl: 'Apto 3',
                xBairro: 'Jardim',
              },
            },
          },
        ],
      },
      valores: {
        trib: {
          CST: '000',
          cClassTrib: '000001',
          gIBSCBS: {
            cCredPres: '01',
            gTribRegular: { CSTReg: '000', cClassTribReg: '000001' },
            gDif: { pDifUF: 10, pDifMun: 10, pDifCBS: 10 },
          },
        },
      },
    });
  });

  it('fixture dpsNt009Completa é a DPS que buildDps (com os guards) produz — exceto bensMoveis', () => {
    // A fixture cobre todos os grupos do nt009; gLocacao (só 99.03, E0936/E0937)
    // e bensMoveis (só 99.04.01, E0963/E0967) não cabem na mesma DPS válida,
    // então bensMoveis é a única regra fechada que ela viola, de propósito.
    const fixture = dpsNt009Completa();
    const { bensMoveis, ...ibsCbsSemBens } = fixture.infDPS.IBSCBS ?? {};
    expect(bensMoveis).toHaveLength(2);
    const params: BuildDpsParamsNt009 = {
      layout: 'nt009',
      emitente: {
        cnpj: '00574753000100',
        codMunicipio: '2111300',
        inscricaoMunicipal: '6123007',
        regime: {
          opSimpNac: OpcaoSimplesNacional.NaoOptante,
          regEspTrib: RegimeEspecialTributacao.Nenhum,
        },
      },
      serie: '1',
      nDPS: '1',
      tpAmb: TipoAmbienteDps.Homologacao,
      dhEmi: new Date('2026-12-01T14:30:00Z'),
      dCompet: new Date('2026-12-01T12:00:00Z'),
      verAplic: 'test-1.0.0',
      servico: {
        cTribNac: '990301',
        cNBS: '123456789',
        descricao: 'Locação de imóvel',
        codigoInterno: 'INT001',
      },
      valores: {
        vServ: 1000,
        tribISSQN: TipoTribISSQN.NaoIncidencia,
        pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 },
      },
      tomador: {
        documento: { CPF: '12345678909' },
        nome: 'Tomador de Teste',
        endereco: {
          codMunicipio: '2111300',
          cep: '65000000',
          logradouro: 'Rua A',
          numero: '10',
          bairro: 'Centro',
        },
      },
      ajusteBC: {
        issqn: { percentual: 10 },
        documentos: [
          {
            tipo: TipoAjusteBC.RepasseFornecedorAgenciaTurismo,
            valorTotal: 200,
            valorAplicado: 100.5,
            dataEmissao: new Date('2026-11-20T12:00:00Z'),
            documento: { docOutro: { nDoc: 'REC-41', xDoc: 'Recibo' } },
            fornecedor: {
              documento: { CNPJ: '11222333000181' },
              nome: 'Fornecedor de Teste',
              endereco: ENDERECO_FORNECEDOR,
            },
          },
          {
            tipo: TipoAjusteBC.OutrosReembolsos,
            descricao: 'Reembolso de despesas',
            valorTotal: 50,
            valorAplicado: 50,
            dataCompetencia: new Date('2026-11-25T12:00:00Z'),
            documento: {
              dFeNacional: { tipoChaveDFe: TipoChaveDFe.Nfse, chaveDFe: CHAVE_NFSE },
            },
          },
        ],
      },
      ibsCbs: {
        classificacao: { CST: '000', cClassTrib: '000001' },
        cIndOp: '020101',
        imovel: {
          codMunicipio: '2111300',
          locacao: {
            pCopropriedade: 100,
            vTotOper: 1000,
            vDescIncondTot: 10,
            dVencOrig: new Date('2026-12-10T12:00:00Z'),
          },
          unidades: [
            {
              inscricaoImobiliaria: 'IMOB-1',
              identificacao: { cCIB: 'ABC12345' },
              ajustesBC: [{ tipo: TipoAjusteBCLocImoveis.Condominio, valor: 150 }],
            },
            {
              identificacao: {
                endereco: {
                  cep: '65010000',
                  logradouro: 'Av. B',
                  numero: '200',
                  complemento: 'Apto 3',
                  bairro: 'Jardim',
                },
              },
            },
          ],
        },
      },
    };
    expect(buildDps(params)).toEqual({
      ...fixture,
      infDPS: { ...fixture.infDPS, IBSCBS: ibsCbsSemBens },
    });
    expect(() =>
      buildDps({
        ...params,
        ibsCbs: {
          ...params.ibsCbs,
          classificacao: { CST: '000', cClassTrib: '000001' },
          bensMoveis: [{ ncm: '94036000', descricao: 'Móveis de madeira', quantidade: '3' }],
        },
      }),
    ).toThrow(expect.objectContaining({ rule: 'E0967' }));
  });

  it('bens móveis: buildDps mapeia bensMoveis', () => {
    expect(buildDps(paramsNt009BensMoveis()).infDPS.IBSCBS?.bensMoveis).toEqual([
      { cNCMBemMovel: '94036000', xNCMBemMovel: 'Móveis de madeira', qtdNCMBemMovel: '3' },
      { cNCMBemMovel: '84183000', xNCMBemMovel: 'Congelador', qtdNCMBemMovel: '1' },
    ]);
  });

  it('XML dos inputs completos traz os elementos opcionais do IBSCBS e o desconto derivado', () => {
    const xml = buildDpsXml(buildDps(paramsNt009Completos()));
    expect(xml).toContain('<indFinal>1</indFinal>');
    expect(xml).toContain('<tpOper>3</tpOper>');
    expect(xml).toContain(
      '<vDescCondIncond><vDescIncond>5</vDescIncond><vDescCond>15</vDescCond></vDescCondIncond>',
    );
  });

  it('sem destinatario → indDest TomadorEhDestinatario e sem dest', async () => {
    const dps = buildDps({
      ...paramsNt009Minimos(),
      ibsCbs: { classificacao: { CST: '000', cClassTrib: '000001' } },
    });
    expect(dps.infDPS.IBSCBS?.indDest).toBe(IndicadorDestinatario.TomadorEhDestinatario);
    expect(dps.infDPS.IBSCBS && 'dest' in dps.infDPS.IBSCBS).toBe(false);
    // Sem nenhum opcional da classificação, gIBSCBS não é gerado.
    expect(dps.infDPS.IBSCBS?.valores).toEqual({ trib: { CST: '000', cClassTrib: '000001' } });
    const xml = buildDpsXml(dps);
    expect((await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false })).valid).toBe(
      true,
    );
  });

  it('sem ajusteBC/ibsCbs → sem vAjusteBC e sem IBSCBS', () => {
    const dps = buildDps(paramsNt009Minimos());
    expect('vAjusteBC' in dps.infDPS.valores).toBe(false);
    expect('IBSCBS' in dps.infDPS).toBe(false);
  });

  it('issqn.valor → vAjusteBCISSQN; listas vazias são omitidas', () => {
    const dps = buildDps({
      ...paramsNt009Minimos(),
      ajusteBC: { issqn: { valor: 25 }, documentos: [] },
      ibsCbs: {
        classificacao: { CST: '000', cClassTrib: '000001' },
        nfseReferenciadas: [],
        bensMoveis: [],
        imovel: { codMunicipio: '2111300', unidades: [] },
      },
    });
    expect(dps.infDPS.valores.vAjusteBC).toEqual({ ajusteIssqn: { vAjusteBCISSQN: 25 } });
    expect(dps.infDPS.IBSCBS).toEqual({
      indDest: IndicadorDestinatario.TomadorEhDestinatario,
      imovel: { cMun: '2111300' },
      valores: { trib: { CST: '000', cClassTrib: '000001' } },
    });
  });

  it.each([
    ['E0453', { ajusteBC: { issqn: { percentual: 0 } } }],
    ['E0453', { ajusteBC: { issqn: { percentual: 100.01 } } }],
    ['E0464', docCom({ tipo: TipoAjusteBC.Materiais, descricao: 'x' })],
    ['E0465', docCom({ tipo: TipoAjusteBC.OutrosReembolsos, descricao: undefined })],
    [
      'E0472',
      docCom({ dataEmissao: new Date('2026-10-01'), dataCompetencia: new Date('2026-10-02') }),
    ],
    ['E0467', docCom({ valorAplicado: 1001, valorTotal: 2000 })], // vServ 1000
    ['E0469', docCom({ valorAplicado: 600, valorTotal: 500 })],
  ] as const)('guard %s', (code, patch) => {
    expect(() => buildDps({ ...paramsNt009Minimos(), ...patch })).toThrow(
      expect.objectContaining({ rule: code }),
    );
    expect(() => buildDps({ ...paramsNt009Minimos(), ...patch })).toThrow(
      new RegExp(`per ${code}$`),
    );
  });

  it('limites aceitos: percentual 100, datas iguais, valorAplicado = valorTotal = vServ', () => {
    expect(() =>
      buildDps({ ...paramsNt009Minimos(), ajusteBC: { issqn: { percentual: 100 } } }),
    ).not.toThrow();
    expect(() =>
      buildDps({
        ...paramsNt009Minimos(),
        ...docCom({
          tipo: TipoAjusteBC.OutrasDeducoesIssqn,
          descricao: 'Outras',
          valorTotal: 1000,
          valorAplicado: 1000,
          dataEmissao: new Date('2026-10-02T15:00:00Z'),
          dataCompetencia: new Date('2026-10-02T10:00:00Z'),
        }),
      }),
    ).not.toThrow();
  });

  it('E0472 compara a data (dia de Brasília), não o instante', () => {
    // Mesmo dia BRT, horários diferentes: aceito (TSData é só data).
    expect(() =>
      buildDps({
        ...paramsNt009Minimos(),
        ...docCom({
          dataEmissao: new Date('2026-10-02T10:00:00Z'),
          dataCompetencia: new Date('2026-10-02T15:00:00Z'),
        }),
      }),
    ).not.toThrow();
  });

  it('E0472 usa o dia de Brasília, não o de UTC', () => {
    // dtEmiDoc 2026-11-19 (23:00 BRT) < dtCompDoc 2026-11-20: rejeita — em UTC
    // os dois cairiam em 2026-11-20 e passariam.
    expect(() =>
      buildDps({
        ...paramsNt009Minimos(),
        ...docCom({
          dataEmissao: new Date('2026-11-20T02:00:00Z'),
          dataCompetencia: new Date('2026-11-20T12:00:00Z'),
        }),
      }),
    ).toThrow(expect.objectContaining({ rule: 'E0472' }));
    // Mesmo dia BRT (2026-11-20), dias UTC diferentes (20 × 21): aceito.
    expect(() =>
      buildDps({
        ...paramsNt009Minimos(),
        ...docCom({
          dataEmissao: new Date('2026-11-20T12:00:00Z'),
          dataCompetencia: new Date('2026-11-21T01:00:00Z'),
        }),
      }),
    ).not.toThrow();
  });

  describe('regras fechadas do Anexo I 20261020 (só nt009)', () => {
    const MEI = {
      opSimpNac: OpcaoSimplesNacional.Mei,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    };
    const comRegime = (
      p: BuildDpsParamsNt009,
      regime: BuildDpsParamsNt009['emitente']['regime'],
    ): BuildDpsParamsNt009 => ({ ...p, emitente: { ...p.emitente, regime } });
    const comServico = (
      p: BuildDpsParamsNt009,
      servico: Partial<BuildDpsParamsNt009['servico']>,
    ): BuildDpsParamsNt009 => ({ ...p, servico: { ...p.servico, ...servico } });
    const comTribIssqn = (p: BuildDpsParamsNt009, tribISSQN: TipoTribISSQN) => ({
      ...p,
      valores: { ...p.valores, tribISSQN },
    });
    const comIbsCbs = (
      p: BuildDpsParamsNt009,
      patch: Partial<NonNullable<BuildDpsParamsNt009['ibsCbs']>>,
    ): BuildDpsParamsNt009 => ({
      ...p,
      ibsCbs: {
        classificacao: { CST: '000', cClassTrib: '000001' },
        ...p.ibsCbs,
        ...patch,
      },
    });
    const locacaoCom = (
      locacao: Partial<
        NonNullable<NonNullable<BuildDpsParamsNt009['ibsCbs']>['imovel']>['locacao']
      >,
      ajustesBC?: NonNullable<
        NonNullable<NonNullable<BuildDpsParamsNt009['ibsCbs']>['imovel']>['unidades']
      >[number]['ajustesBC'],
    ): BuildDpsParamsNt009 => {
      const p = paramsNt009Locacao();
      return comIbsCbs(p, {
        imovel: {
          codMunicipio: '2111300',
          locacao: { pCopropriedade: 100, vTotOper: 1000, ...locacao },
          unidades: [{ identificacao: { cCIB: 'ABC12345' }, ...(ajustesBC ? { ajustesBC } : {}) }],
        },
      });
    };
    const docDFe = (tipoChaveDFe: TipoChaveDFe, xTipoChaveDFe?: string) => ({
      dFeNacional: {
        tipoChaveDFe,
        chaveDFe: CHAVE_NFSE,
        ...(xTipoChaveDFe !== undefined ? { xTipoChaveDFe } : {}),
      },
    });
    /** Doc 199 com documento fiscal: dispensa E0435/E0445. */
    const doc199 = (): DocumentoAjusteBCInput => ({
      tipo: TipoAjusteBC.OutrosReembolsos,
      descricao: 'Reembolso',
      valorTotal: 50,
      valorAplicado: 50,
      documento: docDFe(TipoChaveDFe.Nfse),
    });

    it.each<[string, string, () => BuildDpsParamsNt009]>([
      [
        'E0322',
        'ibsCbs sem servico.cNBS',
        () => {
          const { cNBS: _, ...servico } = paramsNt009Minimos().servico;
          return comIbsCbs({ ...paramsNt009Minimos(), servico }, {});
        },
      ],
      [
        'E0436',
        'MEI com ajusteBC',
        () => ({
          ...comRegime(paramsNt009Minimos(), MEI),
          ajusteBC: { issqn: { percentual: 10 } },
        }),
      ],
      [
        'E0435',
        'tribISSQN=4 com ajusteBC sem doc 101–105/199',
        () => ({
          ...comTribIssqn(paramsNt009Minimos(), TipoTribISSQN.NaoIncidencia),
          ajusteBC: { issqn: { valor: 10 } },
        }),
      ],
      [
        'E0445',
        'regEspTrib≠0 com ajusteBC sem doc 101–105/199',
        () => ({
          ...comRegime(paramsNt009Minimos(), {
            opSimpNac: OpcaoSimplesNacional.NaoOptante,
            regEspTrib: RegimeEspecialTributacao.AtoCooperado,
          }),
          ...docCom({}),
        }),
      ],
      [
        'E0462',
        'issqn + doc tipo 2',
        () => ({
          ...paramsNt009Minimos(),
          ajusteBC: { issqn: { percentual: 10 }, documentos: docCom({}).ajusteBC.documentos },
        }),
      ],
      [
        'E0463',
        'cTribNac 06.01 com doc tipo 2',
        () => ({ ...comServico(paramsNt009Minimos(), { cTribNac: '060101' }), ...docCom({}) }),
      ],
      [
        'E0470',
        'dFeNacional tipo Outro sem xTipoChaveDFe',
        () => ({ ...paramsNt009Minimos(), ...docCom({ documento: docDFe(TipoChaveDFe.Outro) }) }),
      ],
      [
        'E0476',
        'docFiscalOutro com dtCompDoc ≥ 2026-01-01 (BRT)',
        () => ({
          ...paramsNt009Minimos(),
          ...docCom({
            documento: {
              docFiscalOutro: { cMunDocFiscal: '2111300', nDocFiscal: '1', xDocFiscal: 'NF' },
            },
            dataCompetencia: new Date('2026-01-01T12:00:00Z'),
          }),
        }),
      ],
      [
        'E0479',
        'tipo 199 com docOutro',
        () => ({
          ...paramsNt009Minimos(),
          ...docCom({ tipo: TipoAjusteBC.OutrosReembolsos, descricao: 'Reembolso' }),
        }),
      ],
      [
        'E0492',
        'fornecedor sem endereço',
        () => ({
          ...paramsNt009Minimos(),
          ...docCom({
            fornecedor: {
              documento: { CNPJ: '11222333000181' },
              nome: 'F',
            } as unknown as DocumentoAjusteBCInput['fornecedor'],
          }),
        }),
      ],
      [
        'E0453',
        'percentual que serializa como 0.00',
        () => ({ ...paramsNt009Minimos(), ajusteBC: { issqn: { percentual: 0.004 } } }),
      ],
      [
        'E0959',
        'cClassTrib fora do grupo do CST',
        () =>
          comIbsCbs(paramsNt009Minimos(), { classificacao: { CST: '000', cClassTrib: '200001' } }),
      ],
      [
        'E0970',
        'cClassTribReg fora do grupo do CSTReg',
        () =>
          comIbsCbs(paramsNt009Minimos(), {
            classificacao: {
              CST: '000',
              cClassTrib: '000001',
              tributacaoRegular: { CSTReg: '000', cClassTribReg: '200001' },
            },
          }),
      ],
      [
        'E0903',
        'tpEnteGov sem tpOper',
        () => comIbsCbs(paramsNt009Minimos(), { tpEnteGov: TipoEnteGovernamental.Uniao }),
      ],
      [
        'E0903',
        'cTribNac 25.05 sem tpOper',
        () => comIbsCbs(comServico(paramsNt009Minimos(), { cTribNac: '250501' }), {}),
      ],
      [
        'E0905',
        'tpOper 2 sem gRefNFSe',
        () =>
          comIbsCbs(paramsNt009Minimos(), {
            tpEnteGov: TipoEnteGovernamental.Uniao,
            tpOper: TipoOperacao.RecebimentoPagamentoFornecimentoRealizado,
          }),
      ],
      [
        'E0906',
        'gRefNFSe com tpOper 1',
        () =>
          comIbsCbs(paramsNt009Minimos(), {
            tpEnteGov: TipoEnteGovernamental.Uniao,
            tpOper: TipoOperacao.FornecimentoComPagamentoPosterior,
            nfseReferenciadas: [CHAVE_NFSE],
          }),
      ],
      [
        'E0906',
        'gRefNFSe sem tpOper',
        () => comIbsCbs(paramsNt009Minimos(), { nfseReferenciadas: [CHAVE_NFSE] }),
      ],
      [
        'E0936',
        'gLocacao fora do 99.03',
        () =>
          comIbsCbs(paramsNt009Minimos(), {
            imovel: { codMunicipio: '2111300', locacao: { pCopropriedade: 100, vTotOper: 1000 } },
          }),
      ],
      [
        'E0937',
        '99.03 sem gLocacao',
        () =>
          comIbsCbs(paramsNt009Locacao(), {
            imovel: {
              codMunicipio: '2111300',
              unidades: [{ identificacao: { cCIB: 'ABC12345' } }],
            },
          }),
      ],
      [
        'E0939',
        'gAjusteBCLocImoveis fora do 99.03',
        () =>
          comIbsCbs(paramsNt009Minimos(), {
            imovel: {
              codMunicipio: '2111300',
              unidades: [
                {
                  identificacao: { cCIB: 'ABC12345' },
                  ajustesBC: [{ tipo: TipoAjusteBCLocImoveis.Condominio, valor: 10 }],
                },
              ],
            },
          }),
      ],
      ['E0940', 'pCopropriedade > 100', () => locacaoCom({ pCopropriedade: 150 })],
      [
        'E0949',
        'ajuste de locação tipo 99 sem descrição',
        () => locacaoCom({}, [{ tipo: TipoAjusteBCLocImoveis.Outras, valor: 10 }]),
      ],
      [
        'E0949',
        'ajuste de locação tipo ≠ 99 com descrição',
        () =>
          locacaoCom({}, [{ tipo: TipoAjusteBCLocImoveis.Condominio, descricao: 'x', valor: 10 }]),
      ],
      [
        'E0966',
        'ajuste de locação > vTotOper',
        () => locacaoCom({}, [{ tipo: TipoAjusteBCLocImoveis.Condominio, valor: 1000.01 }]),
      ],
      ['E0431', 'vDescIncond derivado ≥ vServ', () => locacaoCom({ vDescIncondTot: 1000 })],
      ['E0432', 'vDescCond derivado ≥ vServ', () => locacaoCom({ vDescCondTot: 1200 })],
      [
        'E0963',
        '99.04.01 sem bensMoveis',
        () => comIbsCbs(paramsNt009BensMoveis(), { bensMoveis: [] }),
      ],
      [
        'E0967',
        'bensMoveis fora do 99.04.01',
        () =>
          comIbsCbs(paramsNt009Minimos(), {
            bensMoveis: [{ ncm: '94036000', descricao: 'Mesa', quantidade: '1' }],
          }),
      ],
      [
        'E0974',
        'quantidade de bem móvel zero',
        () =>
          comIbsCbs(paramsNt009BensMoveis(), {
            bensMoveis: [{ ncm: '94036000', descricao: 'Mesa', quantidade: '000' }],
          }),
      ],
    ])('%s — %s', (code, _, params) => {
      expect(() => buildDps(params())).toThrow(expect.objectContaining({ rule: code }));
      expect(() => buildDps(params())).toThrow(new RegExp(`per ${code}$`));
    });

    it('bases válidas: locação (99.03.01) e bens móveis (99.04.01) passam e validam no XSD', async () => {
      for (const params of [paramsNt009Locacao(), paramsNt009BensMoveis()]) {
        const xml = buildDpsXml(buildDps(params));
        const r = await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false });
        expect(r.violations).toEqual([]);
      }
    });

    it('E0435/E0445: doc 101–105/199 dispensa as regras', () => {
      const base = paramsNt009Minimos();
      const ajusteBC = { issqn: { valor: 10 }, documentos: [doc199()] };
      expect(() =>
        buildDps({ ...comTribIssqn(base, TipoTribISSQN.NaoIncidencia), ajusteBC }),
      ).not.toThrow();
      expect(() =>
        buildDps({
          ...comRegime(base, {
            opSimpNac: OpcaoSimplesNacional.NaoOptante,
            regEspTrib: RegimeEspecialTributacao.AtoCooperado,
          }),
          ajusteBC,
        }),
      ).not.toThrow();
      // E0436 (MEI) não tem exceção.
      expect(() => buildDps({ ...comRegime(base, MEI), ajusteBC })).toThrow(
        expect.objectContaining({ rule: 'E0436' }),
      );
    });

    it('E0462/E0463/E0470/E0476/E0479: combinações aceitas', () => {
      const base = paramsNt009Minimos();
      // issqn + doc 102 (fora da lista do E0462).
      expect(() =>
        buildDps({
          ...base,
          ajusteBC: {
            issqn: { percentual: 10 },
            documentos: docCom({ tipo: TipoAjusteBC.RepasseFornecedorAgenciaTurismo }).ajusteBC
              .documentos,
          },
        }),
      ).not.toThrow();
      // 06.01 com doc 9 (Profissional Parceiro).
      expect(() =>
        buildDps({
          ...comServico(base, { cTribNac: '060101' }),
          ...docCom({ tipo: TipoAjusteBC.ProfissionalParceiro }),
        }),
      ).not.toThrow();
      // dFeNacional Outro com descrição; 199 com docFiscalOutro de competência 2025
      // (2026-01-01T02:00Z ainda é 2025-12-31 em Brasília).
      expect(() =>
        buildDps({ ...base, ...docCom({ documento: docDFe(TipoChaveDFe.Outro, 'MDF-e') }) }),
      ).not.toThrow();
      expect(() =>
        buildDps({
          ...base,
          ...docCom({
            tipo: TipoAjusteBC.OutrosReembolsos,
            descricao: 'Reembolso',
            documento: {
              docFiscalOutro: { cMunDocFiscal: '2111300', nDocFiscal: '1', xDocFiscal: 'NF' },
            },
            dataEmissao: new Date('2026-01-01T02:00:00Z'),
            dataCompetencia: new Date('2026-01-01T02:00:00Z'),
          }),
        }),
      ).not.toThrow();
    });

    it('E0905/E0906/E0903: combinações aceitas', () => {
      const base = paramsNt009Minimos();
      expect(() =>
        buildDps(
          comIbsCbs(base, {
            tpEnteGov: TipoEnteGovernamental.Uniao,
            tpOper: TipoOperacao.FornecimentoComPagamentoJaRealizado,
            nfseReferenciadas: [CHAVE_NFSE],
          }),
        ),
      ).not.toThrow();
      expect(() =>
        buildDps(
          comIbsCbs(comServico(base, { cTribNac: '250501' }), {
            tpOper: TipoOperacao.FornecimentoRecebimentoConcomitantes,
          }),
        ),
      ).not.toThrow();
    });

    it('E0937/E0963 só valem com ibsCbs (E0855 não é aplicado — tolerância CGNFS-e até 31/12/2026)', () => {
      const { ibsCbs: _l, ...locacaoSemIbsCbs } = paramsNt009Locacao();
      const { ibsCbs: _b, ...bensSemIbsCbs } = paramsNt009BensMoveis();
      expect(() => buildDps(locacaoSemIbsCbs)).not.toThrow();
      expect(() => buildDps(bensSemIbsCbs)).not.toThrow();
    });

    it('arredondamento: os guards avaliam o valor como será serializado (2 casas)', () => {
      const base = paramsNt009Minimos(); // vServ 1000
      // 100.004 → "100.00" (E0453 aceita).
      expect(() =>
        buildDps({ ...base, ajusteBC: { issqn: { percentual: 100.004 } } }),
      ).not.toThrow();
      // 1000.001 → "1000.00" = vServ (E0467) e = vTotDoc (E0469).
      expect(() =>
        buildDps({ ...base, ...docCom({ valorAplicado: 1000.001, valorTotal: 1000 }) }),
      ).not.toThrow();
      // pCopropriedade 100.004 → "100.00"; ajuste 1000.004 → "1000.00" = vTotOper.
      expect(() =>
        buildDps(
          locacaoCom({ pCopropriedade: 100.004 }, [
            { tipo: TipoAjusteBCLocImoveis.Condominio, valor: 1000.004 },
          ]),
        ),
      ).not.toThrow();
    });

    it('E0434/E0443: vDescIncond/vDescCond derivados de pCopropriedade × vDesc*Tot (2 casas)', async () => {
      const dps = buildDps(
        locacaoCom({ pCopropriedade: 33.33, vDescIncondTot: 100, vDescCondTot: 10.01 }),
      );
      // 33,33% × 100 = 33,33; 33,33% × 10,01 = 3,336333 → 3,34.
      expect(dps.infDPS.valores.vDescCondIncond).toEqual({ vDescIncond: 33.33, vDescCond: 3.34 });
      const xml = buildDpsXml(dps);
      expect(xml).toContain(
        '<vServPrest><vServ>1000</vServ></vServPrest><vDescCondIncond><vDescIncond>33.33</vDescIncond><vDescCond>3.34</vDescCond></vDescCondIncond>',
      );
      expect(
        (await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false })).violations,
      ).toEqual([]);

      // Meio centavo arredonda para cima: 50% × 10,01 = 5,005 → 5,01.
      expect(
        buildDps(locacaoCom({ pCopropriedade: 50, vDescIncondTot: 10.01 })).infDPS.valores
          .vDescCondIncond,
      ).toEqual({ vDescIncond: 5.01 });
      // Sem *Tot, ou derivado zero (vDesc* tem de ser > 0 — E0431/E0432), o grupo é omitido.
      for (const locacao of [{}, { pCopropriedade: 0, vDescIncondTot: 100 }, { vDescCondTot: 0 }]) {
        const v = buildDps(locacaoCom(locacao)).infDPS.valores;
        expect('vDescCondIncond' in v).toBe(false);
      }
    });
  });

  it('ajusteBC/ibsCbs num params nt004 (fora do sistema de tipos) → LayoutMismatchError', () => {
    expect(() =>
      buildDps({ ...baseParams(), ajusteBC: { issqn: { percentual: 10 } } } as never),
    ).toThrow(LayoutMismatchError);
    expect(() =>
      buildDps({
        ...baseParams(),
        ibsCbs: { classificacao: { CST: '000', cClassTrib: '000001' } },
      } as never),
    ).toThrow(LayoutMismatchError);
  });

  it('DV inválido do fornecedor de ajusteBC → InvalidCnpjError (salvo skipCpfCnpjValidation)', () => {
    const params = (cnpj: string): BuildDpsParamsNt009 => ({
      ...paramsNt009Minimos(),
      ajusteBC: {
        documentos: [
          {
            tipo: TipoAjusteBC.Materiais,
            valorTotal: 100,
            valorAplicado: 50,
            documento: { docOutro: { nDoc: '1', xDoc: 'Recibo' } },
            fornecedor: {
              documento: { CNPJ: cnpj },
              nome: 'Fornecedor',
              endereco: ENDERECO_FORNECEDOR,
            },
          },
        ],
      },
    });
    expect(() => buildDps(params('11222333000181'))).not.toThrow();
    expect(() => buildDps(params('11222333000199'))).toThrow(InvalidCnpjError);
    expect(() =>
      buildDps({ ...params('11222333000199'), skipCpfCnpjValidation: true }),
    ).not.toThrow();
  });

  it('DV inválido do destinatário de ibsCbs → InvalidCpfError (salvo skipCpfCnpjValidation)', () => {
    const params = (cpf: string): BuildDpsParamsNt009 => ({
      ...paramsNt009Minimos(),
      ibsCbs: {
        classificacao: { CST: '000', cClassTrib: '000001' },
        destinatario: { documento: { CPF: cpf }, nome: 'Destinatário' },
      },
    });
    expect(() => buildDps(params('01075595363'))).not.toThrow();
    expect(() => buildDps(params('01075595300'))).toThrow(InvalidCpfError);
    expect(() => buildDps({ ...params('01075595300'), skipCpfCnpjValidation: true })).not.toThrow();
  });

  it('existing guards keep running for nt009 (E0532)', () => {
    expect(() =>
      buildDps({
        ...paramsNt009Minimos(),
        servico: { ...paramsNt009Minimos().servico, cTribNac: '990101' },
      }),
    ).toThrow(expect.objectContaining({ rule: 'E0532' }));
  });

  it('emitir no client nt009 aceita os mesmos inputs', async () => {
    const client = new NfseClientFake({ layout: 'nt009' });
    const { nDPS: _nDPS, layout: _layout, ...emitirParams } = paramsNt009Completos();
    const params: EmitirParams<'nt009'> & { dryRun?: false } = { ...emitirParams, nDPS: '7' };

    const dry = await client.emitir({ ...params, dryRun: true });
    expect(dry.dryRun).toBe(true);

    const r = await client.emitir(params);
    if (r.status !== 'ok') throw new Error('esperava ok');
    const nfse = r.nfse.nfse;
    if (nfse.layout !== 'nt009') throw new Error('esperava nt009');
    expect(nfse.infNFSe.DPS.infDPS.valores.vAjusteBC?.ajusteIssqn).toEqual({ pAjusteBCISSQN: 10 });
    expect(nfse.infNFSe.DPS.infDPS.IBSCBS?.indDest).toBe(
      IndicadorDestinatario.DestinatarioDistinto,
    );

    // Os guards também rodam no caminho do client.
    await expect(
      client.emitir({ ...params, ajusteBC: { ...params.ajusteBC, issqn: { percentual: 0 } } }),
    ).rejects.toMatchObject({ rule: 'E0453' });
  });
});
