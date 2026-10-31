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
import {
  type BuildDpsParamsNt004,
  type BuildDpsParamsNt009,
  buildDps,
  type DocumentoAjusteBCInput,
} from './build-dps.js';
import { buildDpsXml } from './build-xml.js';
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

  // E0424 (Anexo I 20261020) — vReceb não deve ser informado quando o emitente é
  // prestador, tomador ou intermediário (tpEmit 1, 2 ou 3); buildDps usa tpEmit=1.
  it('throws RuleViolationError (E0424) when vReceb is set (buildDps is always tpEmit=1)', () => {
    expect(() => buildDps({ ...baseParams(), valores: { vServ: 100, vReceb: 50 } })).toThrow(
      RuleViolationError,
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

  function paramsNt009Completos(): BuildDpsParamsNt009 {
    return {
      ...paramsNt009Minimos(),
      tomador: { documento: { CPF: '01075595363' }, nome: 'Tomador de Teste' },
      ajusteBC: {
        issqn: { percentual: 10 },
        documentos: [
          {
            tipo: TipoAjusteBC.Materiais,
            valorTotal: 200,
            valorAplicado: 100.5,
            dataEmissao: new Date('2026-11-20T12:00:00Z'),
            documento: {
              dFeNacional: {
                tipoChaveDFe: TipoChaveDFe.Nfse,
                chaveDFe: '21113002200574753000100000000000146726037032711025',
              },
            },
            fornecedor: { documento: { CNPJ: '11222333000181' }, nome: 'Fornecedor de Teste' },
          },
          {
            tipo: TipoAjusteBC.OutrosReembolsos,
            descricao: 'Reembolso de despesas',
            valorTotal: 50,
            valorAplicado: 50,
            dataEmissao: new Date('2026-11-25T12:00:00Z'),
            dataCompetencia: new Date('2026-11-25T12:00:00Z'),
            documento: { docOutro: { nDoc: 'REC-42', xDoc: 'Recibo' } },
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
        cIndOp: '100301',
        tpOper: TipoOperacao.FornecimentoComPagamentoPosterior,
        nfseReferenciadas: ['21113002200574753000100000000000146726037032711025'],
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
        bensMoveis: [
          { ncm: '94036000', descricao: 'Móveis de madeira', quantidade: '3' },
          { ncm: '84183000', descricao: 'Congelador', quantidade: '1' },
        ],
      },
    };
  }

  type DocPatch = { [K in keyof DocumentoAjusteBCInput]?: DocumentoAjusteBCInput[K] | undefined };
  function docCom(patch: DocPatch): Pick<BuildDpsParamsNt009, 'ajusteBC'> {
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

  it('round-trip: inputs → DPS → XML válido nt009 → parse igual', async () => {
    const dps = buildDps(paramsNt009Completos());
    const xml = buildDpsXml(dps);
    const result = await validateDpsXml(xml, { layout: 'nt009', throwOnInvalid: false });
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
    expect(dps.infDPS.IBSCBS?.indDest).toBe(IndicadorDestinatario.DestinatarioDistinto);
    expect(dps.infDPS.valores.vAjusteBC?.ajusteIssqn).toEqual({ pAjusteBCISSQN: 10 });

    // Parse de volta: a DPS gerada substitui a <DPS> do envelope NFS-e sintético
    // do nt009 e passa pelo parseNfseXml (não há entry point só de DPS).
    const envelope = readFileSync(
      join(__dirname, '__fixtures__', 'nfse-nt009-sintetica.xml'),
      'utf-8',
    );
    const dpsXmlSemDecl = buildDpsXml(dps, { includeXmlDeclaration: false });
    expect(envelope).toMatch(/<DPS[\s\S]*<\/DPS>/);
    const nfse = parseNfseXml(envelope.replace(/<DPS[\s\S]*<\/DPS>/, () => dpsXmlSemDecl));
    if (nfse.layout !== 'nt009') throw new Error('esperava nt009');
    const parsed = nfse.infNFSe.DPS;
    // Campos date-only voltam ancorados à meia-noite de Brasília; a igualdade
    // completa é verificada na forma serializada (estável).
    expect(buildDpsXml(parsed)).toBe(xml);
    const pv = parsed.infDPS.valores.vAjusteBC;
    expect(pv?.ajusteIssqn).toEqual({ pAjusteBCISSQN: 10 });
    expect(pv?.documentos?.docAjusteBC.map((d) => d.tpAjusteBC)).toEqual([
      TipoAjusteBC.Materiais,
      TipoAjusteBC.OutrosReembolsos,
    ]);
    expect(pv?.documentos?.docAjusteBC[1]?.xTpAjusteBC).toBe('Reembolso de despesas');
    const pIbs = parsed.infDPS.IBSCBS;
    expect(pIbs?.indDest).toBe(IndicadorDestinatario.DestinatarioDistinto);
    expect(pIbs?.dest?.identificador).toEqual({ CNPJ: '11222333000181' });
    expect(pIbs?.dest?.xNome).toBe('Destinatário Ltda');
    expect(pIbs?.imovel?.gUnidImob).toHaveLength(2);
    expect(pIbs?.imovel?.gUnidImob?.[0]?.identificacao).toEqual({ cCIB: 'ABC12345' });
    expect(pIbs?.bensMoveis).toEqual(dps.infDPS.IBSCBS?.bensMoveis);
    expect(pIbs?.valores.trib.CST).toBe('000');
    expect(pIbs?.valores.trib).toEqual(dps.infDPS.IBSCBS?.valores.trib);

    // Igualdade no nível do DTO: o mapeamento produz exatamente os grupos da RTC.
    expect(dps.infDPS.valores.vAjusteBC).toEqual({
      ajusteIssqn: { pAjusteBCISSQN: 10 },
      documentos: {
        docAjusteBC: [
          {
            tpAjusteBC: TipoAjusteBC.Materiais,
            vTotDoc: 200,
            vAjusteAplic: 100.5,
            dtEmiDoc: new Date('2026-11-20T12:00:00Z'),
            documento: {
              dFeNacional: {
                tipoChaveDFe: TipoChaveDFe.Nfse,
                chaveDFe: '21113002200574753000100000000000146726037032711025',
              },
            },
            fornec: { identificador: { CNPJ: '11222333000181' }, xNome: 'Fornecedor de Teste' },
          },
          {
            tpAjusteBC: TipoAjusteBC.OutrosReembolsos,
            xTpAjusteBC: 'Reembolso de despesas',
            vTotDoc: 50,
            vAjusteAplic: 50,
            dtEmiDoc: new Date('2026-11-25T12:00:00Z'),
            dtCompDoc: new Date('2026-11-25T12:00:00Z'),
            documento: { docOutro: { nDoc: 'REC-42', xDoc: 'Recibo' } },
          },
        ],
      },
    });
    expect(dps.infDPS.IBSCBS).toEqual({
      indFinal: IndicadorFinal.Sim,
      cIndOp: '100301',
      tpOper: TipoOperacao.FornecimentoComPagamentoPosterior,
      gRefNFSe: { refNFSe: ['21113002200574753000100000000000146726037032711025'] },
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
          pCopropriedade: 100,
          vTotOper: 1000,
          vDescIncondTot: 10,
          dVencOrig: new Date('2026-12-10T12:00:00Z'),
        },
        gUnidImob: [
          {
            inscImobFisc: 'IMOB-1',
            identificacao: { cCIB: 'ABC12345' },
            gAjusteBCLocImoveis: [
              { tpAjusteBCLocImoveis: TipoAjusteBCLocImoveis.Condominio, vAjusteBCLocImoveis: 150 },
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
      bensMoveis: [
        { cNCMBemMovel: '94036000', xNCMBemMovel: 'Móveis de madeira', qtdNCMBemMovel: '3' },
        { cNCMBemMovel: '84183000', xNCMBemMovel: 'Congelador', qtdNCMBemMovel: '1' },
      ],
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
            fornecedor: { documento: { CNPJ: cnpj }, nome: 'Fornecedor' },
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
      client.emitir({ ...params, ajusteBC: { issqn: { percentual: 0 } } }),
    ).rejects.toMatchObject({ rule: 'E0453' });
  });
});
