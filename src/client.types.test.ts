// Testes de tipo do NfseClient genérico por layout. As expectativas de
// compilação (`@ts-expect-error`) são checadas por `npm run typecheck`; elas
// ficam dentro de arrows nunca invocadas para que o vitest não dispare
// emissões reais em runtime.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Ambiente } from './ambiente.js';
import { NfseClient } from './client.js';
import { dpsNt009Completa } from './nfse/__fixtures__/dps-nt009.js';
import { buildDps } from './nfse/build-dps.js';
import type { DPS, DpsNt004, DpsNt009 } from './nfse/domain.js';
import { OpcaoSimplesNacional, RegimeEspecialTributacao } from './nfse/enums.js';
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
});
