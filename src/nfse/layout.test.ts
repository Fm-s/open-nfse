import { describe, expect, it } from 'vitest';
import {
  InvalidLayoutError,
  LayoutMismatchError,
  RuleViolationError,
  ValidationError,
} from '../errors/validation.js';
import { ATTR_PREFIX, parseXml, type XmlNode, type XmlObject } from '../xml/parser.js';
import { dpsNt009Completa } from './__fixtures__/dps-nt009.js';
import { RTC_SCHEMAS } from './_rtc-schemas.generated.js';
import { buildDps } from './build-dps.js';
import { buildDpsXml } from './build-xml.js';
import { collectCepsFromDps, collectIdentifiersFromDps } from './collect-from-dps.js';
import {
  MotivoEmissaoTomadorIntermediario,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
  TipoEmitenteDps,
} from './enums.js';
import {
  assertLayout,
  assertNoForeignLayoutFields,
  assertSameLayout,
  FOREIGN_LAYOUT_FIELDS,
  LAYOUTS,
  type Layout,
  unknownLayout,
} from './layout.js';

describe('assertLayout', () => {
  it('aceita os ids conhecidos', () => {
    expect(assertLayout('nt004')).toBe('nt004');
    expect(assertLayout('nt009')).toBe('nt009');
    expect(LAYOUTS).toEqual(['nt004', 'nt009']);
  });

  it.each(['NT009', 'nt010', undefined, 9])('rejeita %s', (v) => {
    expect(() => assertLayout(v)).toThrow(InvalidLayoutError);
  });

  it('expõe o valor recebido e lista os válidos na mensagem', () => {
    try {
      assertLayout('nt010');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidLayoutError);
      expect((e as InvalidLayoutError).received).toBe('nt010');
      expect((e as Error).message).toContain('nt004');
      expect((e as Error).message).toContain('nt009');
      // A lista de válidos vem de LAYOUTS (não hard-coded).
      expect((e as Error).message).toContain(LAYOUTS.map((l) => `"${l}"`).join(', '));
    }
  });
});

describe('unknownLayout', () => {
  it('lança InvalidLayoutError com o layout de um objeto (switch (dps.layout))', () => {
    expect(() => unknownLayout({ layout: 'nt010' } as never)).toThrow(
      expect.objectContaining({ received: 'nt010' }),
    );
  });

  it('lança InvalidLayoutError com o próprio layout (switch (layout))', () => {
    expect(() => unknownLayout('nt010' as never)).toThrow(InvalidLayoutError);
    expect(() => unknownLayout('nt010' as never)).toThrow(
      expect.objectContaining({ received: 'nt010' }),
    );
  });
});

describe('assertSameLayout', () => {
  it('aceita DPS do mesmo layout', () => {
    expect(() => assertSameLayout('nt009', dpsNt009Completa())).not.toThrow();
  });

  it('lança LayoutMismatchError com expected/received para DPS de outro layout', () => {
    try {
      assertSameLayout('nt004', dpsNt009Completa());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LayoutMismatchError);
      expect(e).toBeInstanceOf(ValidationError);
      expect(e).toMatchObject({ expected: 'nt004', received: 'nt009' });
      expect((e as LayoutMismatchError).field).toBeUndefined();
    }
  });

  it('DPS com layout desconhecido → InvalidLayoutError', () => {
    const dps = { ...dpsNt009Completa(), layout: 'nt010' } as never;
    expect(() => assertSameLayout('nt009', dps)).toThrow(InvalidLayoutError);
  });
});

describe('assertNoForeignLayoutFields', () => {
  const nt009 = dpsNt009Completa();
  const nt004 = dpsNt004Minima();

  it.each([
    [
      'infDPS.valores.vDedRed',
      { ...nt009, infDPS: { ...nt009.infDPS, valores: { ...nt009.infDPS.valores, vDedRed: {} } } },
    ],
    [
      'infDPS.IBSCBS.finNFSe',
      { ...nt009, infDPS: { ...nt009.infDPS, IBSCBS: { ...nt009.infDPS.IBSCBS, finNFSe: '0' } } },
    ],
    [
      'infDPS.IBSCBS.valores.gReeRepRes',
      {
        ...nt009,
        infDPS: {
          ...nt009.infDPS,
          IBSCBS: {
            ...nt009.infDPS.IBSCBS,
            valores: { ...nt009.infDPS.IBSCBS?.valores, gReeRepRes: { documentos: [] } },
          },
        },
      },
    ],
  ])('DPS nt009 com %s (do nt004) → LayoutMismatchError', (field, dps) => {
    expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
      expect.objectContaining({ name: 'LayoutMismatchError', field, expected: 'nt009' }),
    );
  });

  it.each([
    ['infDPS.finNFSe', { ...nt004, infDPS: { ...nt004.infDPS, finNFSe: '0' } }],
    [
      'infDPS.valores.vAjusteBC',
      {
        ...nt004,
        infDPS: { ...nt004.infDPS, valores: { ...nt004.infDPS.valores, vAjusteBC: {} } },
      },
    ],
    [
      'infDPS.IBSCBS.bensMoveis',
      { ...nt004, infDPS: { ...nt004.infDPS, IBSCBS: { bensMoveis: [] } } },
    ],
  ])('DPS nt004 com %s (do nt009) → LayoutMismatchError', (field, dps) => {
    expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
      expect.objectContaining({ field, expected: 'nt004', received: 'nt004' }),
    );
  });

  // Grupos reestruturados entre os XSDs (TCRTCInfoImovel, TCRTCInfoTributosSitClas /
  // TCRTCInfoTribIBSCBS): a chave existe nos dois layouts, mas os filhos não.
  const nt009Ibscbs = nt009.infDPS.IBSCBS;
  if (!nt009Ibscbs) throw new Error('fixture nt009 sem IBSCBS');
  const nt009ComImovel = (imovel: object) => ({
    ...nt009,
    infDPS: { ...nt009.infDPS, IBSCBS: { ...nt009Ibscbs, imovel } },
  });
  const nt009ComTrib = (trib: object) => ({
    ...nt009,
    infDPS: { ...nt009.infDPS, IBSCBS: { ...nt009Ibscbs, valores: { trib } } },
  });
  const nt004ComIbscbs = (ibscbs: object) => ({
    ...nt004,
    infDPS: {
      ...nt004.infDPS,
      IBSCBS: {
        finNFSe: '0',
        cIndOp: '100301',
        indDest: '0',
        valores: { trib: { gIBSCBS: { CST: '000', cClassTrib: '000001' } } },
        ...ibscbs,
      },
    },
  });

  it.each([
    ['infDPS.IBSCBS.imovel.inscImobFisc', nt009ComImovel({ cMun: '2111300', inscImobFisc: '123' })],
    [
      'infDPS.IBSCBS.imovel.identificacao',
      nt009ComImovel({ cMun: '2111300', identificacao: { cCIB: '12345678' } }),
    ],
    [
      'infDPS.IBSCBS.valores.trib.gIBSCBS.CST',
      nt009ComTrib({ CST: '000', cClassTrib: '000001', gIBSCBS: { CST: '200' } }),
    ],
    [
      'infDPS.IBSCBS.valores.trib.gIBSCBS.cClassTrib',
      nt009ComTrib({ CST: '000', cClassTrib: '000001', gIBSCBS: { cClassTrib: '200001' } }),
    ],
  ])('DPS nt009 com %s (forma do nt004) → LayoutMismatchError', (field, dps) => {
    expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
      expect.objectContaining({ name: 'LayoutMismatchError', field, expected: 'nt009' }),
    );
    // O serializer também recusa — não emite `<imovel/>` nem descarta o campo.
    expect(() => buildDpsXml(dps as never)).toThrow(LayoutMismatchError);
  });

  it.each([
    ['infDPS.IBSCBS.imovel.cMun', nt004ComIbscbs({ imovel: { cMun: '2111300' } })],
    [
      'infDPS.IBSCBS.imovel.gLocacao',
      nt004ComIbscbs({
        imovel: { identificacao: { cCIB: '1' }, gLocacao: { pCopropriedade: 1, vTotOper: 1 } },
      }),
    ],
    [
      'infDPS.IBSCBS.imovel.gUnidImob',
      nt004ComIbscbs({ imovel: { identificacao: { cCIB: '1' }, gUnidImob: [] } }),
    ],
    [
      'infDPS.IBSCBS.valores.trib.CST',
      nt004ComIbscbs({ valores: { trib: { CST: '000', gIBSCBS: { CST: '000' } } } }),
    ],
    [
      'infDPS.IBSCBS.valores.trib.cClassTrib',
      nt004ComIbscbs({ valores: { trib: { cClassTrib: '000001', gIBSCBS: { CST: '000' } } } }),
    ],
  ])('DPS nt004 com %s (forma do nt009) → LayoutMismatchError', (field, dps) => {
    expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
      expect.objectContaining({ name: 'LayoutMismatchError', field, expected: 'nt004' }),
    );
    // Antes: TypeError cru de `'cCIB' in undefined` no serializer.
    expect(() => buildDpsXml(dps as never)).toThrow(LayoutMismatchError);
  });

  it('campo do outro layout com valor null conta como ausente', () => {
    const dps = {
      ...nt009,
      infDPS: { ...nt009.infDPS, valores: { ...nt009.infDPS.valores, vDedRed: null } },
    };
    expect(() => assertNoForeignLayoutFields(dps as never)).not.toThrow();
  });

  it('aceita DPS limpas dos dois layouts', () => {
    expect(() => assertNoForeignLayoutFields(nt009)).not.toThrow();
    expect(() => assertNoForeignLayoutFields(nt004)).not.toThrow();
  });

  it('layout desconhecido → InvalidLayoutError', () => {
    expect(() => assertNoForeignLayoutFields({ ...nt004, layout: 'nt010' } as never)).toThrow(
      InvalidLayoutError,
    );
  });
});

describe('FOREIGN_LAYOUT_FIELDS × XSDs', () => {
  /** Filhos diretos (nome → tipo ou tipo anônimo) de cada complexType de `tiposComplexos`. */
  function childrenByType(layout: Layout): Map<string, Map<string, XmlNode | undefined>> {
    const xsd = RTC_SCHEMAS[layout].find((s) => s.fileName === 'tiposComplexos_v1.01.xsd');
    if (!xsd) throw new Error('tiposComplexos ausente');
    const schema = parseXml(xsd.contents).schema as XmlObject;
    const out = new Map<string, Map<string, XmlNode | undefined>>();
    for (const ct of asList(schema.complexType)) {
      const obj = ct as XmlObject;
      out.set(String(obj[`${ATTR_PREFIX}name`]), directChildren(obj));
    }
    return out;
  }
  function asList(v: XmlNode | undefined): XmlNode[] {
    return v === undefined ? [] : Array.isArray(v) ? v : [v];
  }
  /** `xs:element` sob sequence/choice (sem entrar no tipo de cada elemento). */
  function directChildren(node: XmlObject): Map<string, XmlNode | undefined> {
    const out = new Map<string, XmlNode | undefined>();
    const visit = (n: XmlObject) => {
      for (const el of asList(n.element)) {
        const e = el as XmlObject;
        const name = e[`${ATTR_PREFIX}name`];
        if (typeof name === 'string') out.set(name, e[`${ATTR_PREFIX}type`] ?? e.complexType);
      }
      for (const key of ['sequence', 'choice', 'complexType', 'complexContent', 'extension']) {
        for (const sub of asList(n[key])) visit(sub as XmlObject);
      }
    };
    visit(node);
    return out;
  }
  /** Todos os caminhos de elementos a partir de `TCInfNFSe`. */
  function paths(layout: Layout): Set<string> {
    const types = childrenByType(layout);
    const out = new Set<string>();
    const walk = (children: Map<string, XmlNode | undefined> | undefined, prefix: string) => {
      for (const [name, type] of children ?? []) {
        const path = prefix ? `${prefix}/${name}` : name;
        out.add(path);
        walk(
          typeof type === 'string' ? types.get(type) : type && directChildren(type as XmlObject),
          path,
        );
      }
    };
    walk(types.get('TCInfNFSe'), '');
    return out;
  }

  it.each(LAYOUTS)(
    '%s: a tabela lista exatamente os elementos do outro layout cujo pai existe neste',
    (layout) => {
      const proprio = paths(layout);
      const outro = paths(layout === 'nt004' ? 'nt009' : 'nt004');
      const esperado = [...outro].filter((p) => {
        const pai = p.slice(0, p.lastIndexOf('/'));
        return !proprio.has(p) && proprio.has(pai);
      });
      expect(proprio.has('DPS/infDPS/valores')).toBe(true);
      expect(FOREIGN_LAYOUT_FIELDS[layout].map((f) => f.xmlPath.join('/')).sort()).toEqual(
        esperado.sort(),
      );
    },
  );
});

describe('assertNoForeignLayoutFields — campos que o XSD nt009 aceita mas o Anexo I rejeita', () => {
  const nt009 = dpsNt009Completa();
  const comInf = (inf: object) => ({ ...nt009, infDPS: { ...nt009.infDPS, ...inf } });

  it('nt009 com chNFSeRej → RuleViolationError E0034 (também no buildDpsXml)', () => {
    const dps = comInf({
      tpEmit: TipoEmitenteDps.Tomador,
      cMotivoEmisTI: MotivoEmissaoTomadorIntermediario.ImportacaoServico,
      chNFSeRej: '21113002200574753000100000000000146726037032711025',
    });
    expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
      expect.objectContaining({ name: 'RuleViolationError', rule: 'E0034' }),
    );
    expect(() => buildDpsXml(dps as never)).toThrow(RuleViolationError);
  });

  it.each([
    MotivoEmissaoTomadorIntermediario.TomadorObrigadoEmitir,
    MotivoEmissaoTomadorIntermediario.RecusaEmissaoPrestador,
    MotivoEmissaoTomadorIntermediario.RejeicaoNfsePrestador,
  ])('nt009 com tpEmit 2/3 e cMotivoEmisTI=%s → RuleViolationError E0031', (motivo) => {
    for (const tpEmit of [TipoEmitenteDps.Tomador, TipoEmitenteDps.Intermediario]) {
      const dps = comInf({ tpEmit, cMotivoEmisTI: motivo });
      expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
        expect.objectContaining({ name: 'RuleViolationError', rule: 'E0031' }),
      );
    }
  });

  it('nt009 com tpEmit 2/3 sem cMotivoEmisTI → RuleViolationError E0031', () => {
    const dps = comInf({ tpEmit: TipoEmitenteDps.Intermediario });
    expect(() => assertNoForeignLayoutFields(dps as never)).toThrow(
      expect.objectContaining({ name: 'RuleViolationError', rule: 'E0031' }),
    );
  });

  it('nt009 com tpEmit 2 e cMotivoEmisTI=1 é aceita', () => {
    const dps = comInf({
      tpEmit: TipoEmitenteDps.Tomador,
      cMotivoEmisTI: MotivoEmissaoTomadorIntermediario.ImportacaoServico,
    });
    expect(() => assertNoForeignLayoutFields(dps as never)).not.toThrow();
  });

  it('nt004 continua aceitando chNFSeRej e cMotivoEmisTI=4 (E0034/E0031 do nt004 são outras regras)', () => {
    const base = dpsNt004Minima();
    const dps = {
      ...base,
      infDPS: {
        ...base.infDPS,
        tpEmit: TipoEmitenteDps.Tomador,
        cMotivoEmisTI: MotivoEmissaoTomadorIntermediario.RejeicaoNfsePrestador,
        chNFSeRej: '21113002200574753000100000000000146726037032711025',
      },
    };
    expect(() => assertNoForeignLayoutFields(dps)).not.toThrow();
  });
});

describe('layout desconhecido nos walkers da DPS', () => {
  const dps = { ...dpsNt004Minima(), layout: 'nt010' } as never;

  it('buildDpsXml lança InvalidLayoutError (não cai silenciosamente no nt004)', () => {
    expect(() => buildDpsXml(dps)).toThrow(InvalidLayoutError);
  });

  it('collectCepsFromDps / collectIdentifiersFromDps lançam InvalidLayoutError', () => {
    expect(() => collectCepsFromDps(dps)).toThrow(InvalidLayoutError);
    expect(() => collectIdentifiersFromDps(dps)).toThrow(InvalidLayoutError);
  });
});

function dpsNt004Minima() {
  return buildDps({
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
    servico: { cTribNac: '250101', descricao: 'Teste' },
    valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
  });
}
