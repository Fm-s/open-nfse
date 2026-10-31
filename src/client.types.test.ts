// Testes de tipo do NfseClient genérico por layout. As expectativas de
// compilação (`@ts-expect-error`) são checadas por `npm run typecheck`; elas
// ficam dentro de arrows nunca invocadas para que o vitest não dispare
// emissões reais em runtime.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Ambiente } from './ambiente.js';
import { NfseClient } from './client.js';
import { type ParseNfseXmlOptions, parseNfseXml } from './index.js';
import { dpsNt009Completa } from './nfse/__fixtures__/dps-nt009.js';
import { type BuildDpsParams, buildDps } from './nfse/build-dps.js';
import type { DPS, DpsNt004, DpsNt009, NFSe, NfseNt004, NfseNt009 } from './nfse/domain.js';
import type { EmitirParams, EmitLoteResult, NfseEmitResult } from './nfse/emit.js';
import {
  JustificativaSubstituicao,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from './nfse/enums.js';
import { NfseClientFake, type NfseClientLike } from './testing/index.js';

const baseConfig = {
  ambiente: Ambiente.ProducaoRestrita,
  certificado: { pfx: Buffer.from('nao-usado'), password: 'x' },
};

const paramsBase = {
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
} as const;

describe('NfseClient<L> — tipos', () => {
  it('infere o layout do config e restringe a DPS aceita na emissão', () => {
    const dpsNt009 = dpsNt009Completa();
    const dpsNt004 = buildDps({ ...paramsBase, layout: 'nt004' });

    const c4 = new NfseClient({ ...baseConfig, layout: 'nt004' });
    expectTypeOf(c4).toEqualTypeOf<NfseClient<'nt004'>>();
    expectTypeOf(c4.layout).toEqualTypeOf<'nt004'>();
    expect(c4.layout).toBe('nt004');

    const c9 = new NfseClient({ ...baseConfig, layout: 'nt009' });
    expectTypeOf(c9).toEqualTypeOf<NfseClient<'nt009'>>();
    expect(c9.layout).toBe('nt009');

    const _naoCompila = () => {
      // @ts-expect-error nt009 DPS não é aceita por client nt004
      void c4.emitirDpsPronta(dpsNt009);
      // @ts-expect-error nt004 DPS não é aceita por client nt009
      void c9.emitirDpsPronta(dpsNt004);
      // @ts-expect-error lote nt004 não é aceito por client nt009
      void c9.emitirEmLote([dpsNt004]);
      // @ts-expect-error layout é obrigatório
      new NfseClient({ ...baseConfig });
    };
    void _naoCompila;

    const _compila = () => {
      void c4.emitirDpsPronta(dpsNt004);
      void c9.emitirDpsPronta(dpsNt009);
    };
    void _compila;
  });

  it('buildDps retorna a DPS do layout pedido', () => {
    const d9 = buildDps({ ...paramsBase, layout: 'nt009' });
    expectTypeOf(d9).toEqualTypeOf<DpsNt009>();
    expect(d9.layout).toBe('nt009');
    const d4 = buildDps({ ...paramsBase, layout: 'nt004' });
    expectTypeOf(d4).toEqualTypeOf<DpsNt004>();
    expect(d4.layout).toBe('nt004');
    // Sem layout literal (união), o retorno é a união `DPS`.
    const buildUniao = (p: BuildDpsParams) => buildDps(p);
    expectTypeOf(buildUniao).returns.toEqualTypeOf<DPS>();
    expect(buildUniao({ ...paramsBase, layout: 'nt004' }).layout).toBe('nt004');

    const _naoCompila = () => {
      // @ts-expect-error campo opcional com typo (dCompt ≠ dCompet) não compila
      void buildDps({ ...paramsBase, layout: 'nt004', dCompt: new Date() });
      // @ts-expect-error ajusteBC não existe no layout nt004
      void buildDps({ ...paramsBase, layout: 'nt004', ajusteBC: { issqn: { valor: 1 } } });
      // @ts-expect-error ibsCbs não existe no layout nt004
      void buildDps({
        ...paramsBase,
        layout: 'nt004',
        ibsCbs: { classificacao: { CST: '000', cClassTrib: '000001' } },
      });
      // @ts-expect-error destinatário (TCRTCInfoDest) não tem inscrição municipal
      void buildDps({
        ...paramsBase,
        layout: 'nt009',
        ibsCbs: {
          classificacao: { CST: '000', cClassTrib: '000001' },
          destinatario: {
            documento: { CNPJ: '00574753000100' },
            nome: 'Dest',
            inscricaoMunicipal: '123',
          },
        },
      });
    };
    void _naoCompila;
  });

  it('client sem layout literal aceita qualquer DPS; NfseClientLike aceita qualquer layout', () => {
    const c9 = new NfseClient({ ...baseConfig, layout: 'nt009' });
    const like: NfseClientLike = c9; // leitura aceita qualquer layout
    const fake: NfseClientLike = new NfseClientFake({ layout: 'nt004' });
    expect(like.layout).toBe('nt009');
    expect(fake.layout).toBe('nt004');
    expectTypeOf<Parameters<NfseClient['emitirDpsPronta']>[0]>().toEqualTypeOf<DPS>();

    const fake9 = new NfseClientFake({ layout: 'nt009' });
    expectTypeOf(fake9).toEqualTypeOf<NfseClientFake<'nt009'>>();
    const _naoCompila = () => {
      // @ts-expect-error nt004 DPS não é aceita por fake nt009
      void fake9.emitirDpsPronta(buildDps({ ...paramsBase, layout: 'nt004' }));
      // @ts-expect-error layout é obrigatório no fake
      new NfseClientFake({});
    };
    void _naoCompila;
  });

  it('EmitirParams distribui por layout: nt009 aceita ajusteBC/ibsCbs, nt004 rejeita', () => {
    const ajusteBC = { issqn: { percentual: 10 } } as const;
    const ibsCbs = { classificacao: { CST: '000', cClassTrib: '000001' } } as const;

    const p9: EmitirParams<'nt009'> = { ...paramsBase, ajusteBC, ibsCbs };
    expect(p9.ajusteBC?.issqn).toEqual({ percentual: 10 });
    expectTypeOf<EmitirParams<'nt009'>>().toHaveProperty('ajusteBC');
    expectTypeOf<EmitirParams<'nt009'>>().toHaveProperty('ibsCbs');
    // A união (EmitirParams<Layout>) mantém o membro nt009 com seus campos.
    const pUniao: EmitirParams = { ...paramsBase, ajusteBC, ibsCbs };
    expect('ajusteBC' in pUniao).toBe(true);

    const c4 = new NfseClient({ ...baseConfig, layout: 'nt004' });
    const c9 = new NfseClient({ ...baseConfig, layout: 'nt009' });
    expect(c9.layout).toBe('nt009');

    const _naoCompila = () => {
      // @ts-expect-error ajusteBC não existe no layout nt004
      const p4: EmitirParams<'nt004'> = { ...paramsBase, ajusteBC };
      void p4;
      // @ts-expect-error ibsCbs não existe no layout nt004
      void c4.emitir({ ...paramsBase, ibsCbs, dryRun: true });
    };
    void _naoCompila;

    const _compila = () => {
      void c9.emitir({ ...paramsBase, ajusteBC, ibsCbs, dryRun: true });
      void new NfseClientFake({ layout: 'nt009' }).emitir({ ...paramsBase, ajusteBC, ibsCbs });
    };
    void _compila;
  });

  it('resultados de emissão são estreitados pelo layout do cliente (NfseFor<L>)', () => {
    const c4 = new NfseClient({ ...baseConfig, layout: 'nt004' });
    const c9 = new NfseClient({ ...baseConfig, layout: 'nt009' });
    const cU: NfseClient = c9;
    const dpsNt009 = dpsNt009Completa();
    const dpsNt004 = buildDps({ ...paramsBase, layout: 'nt004' });
    const substParams = {
      chaveOriginal: '21113002200574753000100000000000146726037032711025',
      cMotivo: JustificativaSubstituicao.Outros,
      xMotivo: 'Substituição por erro de digitação',
    };
    expect(cU.layout).toBe('nt009');

    // Só checagem de tipos — nunca invocado.
    const _tipos = async () => {
      const r9 = await c9.emitir(paramsBase);
      if (r9.status === 'ok') {
        expectTypeOf(r9.nfse.nfse).toEqualTypeOf<NfseNt009>();
        const dps: DpsNt009 = r9.nfse.nfse.infNFSe.DPS;
        void dps;
      }
      const r4 = await c4.emitir(paramsBase);
      if (r4.status === 'ok') expectTypeOf(r4.nfse.nfse).toEqualTypeOf<NfseNt004>();

      expectTypeOf(await c9.emitirDpsPronta(dpsNt009)).toEqualTypeOf<NfseEmitResult<'nt009'>>();
      expectTypeOf(await c4.emitirDpsPronta(dpsNt004)).toEqualTypeOf<NfseEmitResult<'nt004'>>();

      const lote = await c9.emitirEmLote([dpsNt009]);
      expectTypeOf(lote).toEqualTypeOf<EmitLoteResult<'nt009'>>();
      for (const item of lote.items) {
        expectTypeOf(item.dps).toEqualTypeOf<DpsNt009>();
        if (item.status === 'success') expectTypeOf(item.result.nfse).toEqualTypeOf<NfseNt009>();
      }

      const s9 = await c9.substituir({ ...substParams, novaDps: dpsNt009 });
      if (s9.status === 'ok') expectTypeOf(s9.novaNfse.nfse).toEqualTypeOf<NfseNt009>();

      // Cliente sem layout literal: a união.
      const rU = await cU.emitirDpsPronta(dpsNt004);
      expectTypeOf(rU.nfse).toEqualTypeOf<NFSe>();
      // NfseEmitResult sem argumento continua a união (compatível com a 0.11).
      expectTypeOf<NfseEmitResult['nfse']>().toEqualTypeOf<NFSe>();
      // ReplayItem não é estreitado: o store pode ter pendentes de outro layout.
      const [item] = await c9.replayPendingEvents();
      if (item?.status === 'success_emission')
        expectTypeOf(item.emission.nfse).toEqualTypeOf<NFSe>();
    };
    void _tipos;
  });

  it('NfseClientFake<L> e NfseClientLike<L> estreitam os resultados como o real', () => {
    const fake = new NfseClientFake({ layout: 'nt009' });
    const like: NfseClientLike<'nt009'> = fake;
    const dpsNt009 = dpsNt009Completa();
    const substParams = {
      chaveOriginal: '21113002200574753000100000000000146726037032711025',
      cMotivo: JustificativaSubstituicao.Outros,
      xMotivo: 'Substituição por erro de digitação',
    };
    expect(like.layout).toBe('nt009');

    // Só checagem de tipos — nunca invocado.
    const _tipos = async () => {
      for (const c of [fake, like]) {
        const r = await c.emitir(paramsBase);
        if (r.status === 'ok') expectTypeOf(r.nfse.nfse).toEqualTypeOf<NfseNt009>();
        expectTypeOf((await c.emitirDpsPronta(dpsNt009)).nfse).toEqualTypeOf<NfseNt009>();
        const lote = await c.emitirEmLote([dpsNt009]);
        for (const item of lote.items) {
          expectTypeOf(item.dps).toEqualTypeOf<DpsNt009>();
          if (item.status === 'success') expectTypeOf(item.result.nfse).toEqualTypeOf<NfseNt009>();
        }
        const s = await c.substituir({ ...substParams, novaDps: dpsNt009 });
        if (s.status === 'ok') expectTypeOf(s.novaNfse.nfse).toEqualTypeOf<NfseNt009>();
      }
    };
    void _tipos;
  });

  it('ParseNfseXmlOptions é exportado pela entrada pública', () => {
    expectTypeOf<Parameters<typeof parseNfseXml>[1]>().toEqualTypeOf<
      ParseNfseXmlOptions | undefined
    >();
    expect(typeof parseNfseXml).toBe('function');
  });
});
