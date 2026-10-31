import { describe, expect, it } from 'vitest';
import { TipoAmbiente } from '../ambiente.js';
import { StatusDistribuicao, TipoDocumento } from '../dfe/types.js';
import { NotFoundError } from '../errors/http.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import { InvalidLayoutError, LayoutMismatchError } from '../errors/validation.js';
import { dpsNt009Completa } from '../nfse/__fixtures__/dps-nt009.js';
import { buildDps } from '../nfse/build-dps.js';
import type { EmitirParams } from '../nfse/emit.js';
import {
  JustificativaSubstituicao,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from '../nfse/enums.js';
import { NfseClientFake } from './nfse-client-fake.js';

function baseEmitirParams(): EmitirParams<'nt004'> & { dryRun?: false } {
  return {
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.NaoOptante,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Teste' },
    // Não Optante exige vTotTrib/pTotTrib no choice totTrib (E0713).
    valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
  };
}

describe('NfseClientFake.emitir', () => {
  it('returns ok with a synthesized chave + parsed nfse', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const r = await fake.emitir(baseEmitirParams());

    expect('status' in r && r.status).toBe('ok');
    if ('status' in r && r.status === 'ok') {
      expect(r.nfse.chaveAcesso).toMatch(/^\d{50}$/);
      expect(r.nfse.idDps).toMatch(/^DPS\d{42}$/);
      expect(r.nfse.nfse.infNFSe.cStat).toBe('100');
      expect(r.nfse.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
    }

    expect(fake.emittedChaves).toHaveLength(1);
  });

  it('throws ReceitaRejectionError when failNextEmit(rejection) is programmed', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.failNextEmit({ kind: 'rejection', codigo: 'E401', descricao: 'CNPJ não autorizado' });

    await expect(fake.emitir(baseEmitirParams())).rejects.toMatchObject({
      name: 'ReceitaRejectionError',
      codigo: 'E401',
    });

    // failure is consumed — next call succeeds
    const r = await fake.emitir(baseEmitirParams());
    expect('status' in r && r.status).toBe('ok');
  });

  it('returns retry_pending when failNextEmit(transient) is programmed', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.failNextEmit({ kind: 'transient', message: 'mock timeout' });

    const r = await fake.emitir(baseEmitirParams());
    expect('status' in r && r.status).toBe('retry_pending');
    if ('status' in r && r.status === 'retry_pending') {
      expect(r.pending.kind).toBe('emission');
      expect(r.pending.lastError.transient).toBe(true);
      expect(r.error).toBeInstanceOf(Error);
    }
  });

  it('dry-run does not add to emittedChaves and does not consume counter', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const r = await fake.emitir({ ...baseEmitirParams(), dryRun: true });

    expect('dryRun' in r && r.dryRun).toBe(true);
    expect(fake.emittedChaves).toHaveLength(0);
  });

  it('nDPS increments per emitir call', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const r1 = await fake.emitir(baseEmitirParams());
    const r2 = await fake.emitir(baseEmitirParams());

    if ('status' in r1 && r1.status === 'ok' && 'status' in r2 && r2.status === 'ok') {
      expect(r1.nfse.idDps).not.toBe(r2.nfse.idDps);
    }
  });
});

describe('NfseClientFake.fetchByChave', () => {
  it('returns seeded NFS-e', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const emitted = await fake.emitir(baseEmitirParams());
    if (!('status' in emitted) || emitted.status !== 'ok') throw new Error('emit should succeed');

    const r = await fake.fetchByChave(emitted.nfse.chaveAcesso);
    expect(r.chaveAcesso).toBe(emitted.nfse.chaveAcesso);
    expect(r.nfse.infNFSe.chaveAcesso).toBe(emitted.nfse.chaveAcesso);
  });

  it('throws NotFoundError for un-seeded chave', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    await expect(
      fake.fetchByChave('21113002200574753000100000000000146726037032711025'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws InvalidChaveAcessoError for malformed chave', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    await expect(fake.fetchByChave('abc')).rejects.toMatchObject({
      name: 'InvalidChaveAcessoError',
    });
  });
});

describe('NfseClientFake.fetchByNsu', () => {
  it('returns NENHUM_DOCUMENTO_LOCALIZADO when dfe queue is empty', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const r = await fake.fetchByNsu({ ultimoNsu: 0 });
    expect(r.status).toBe(StatusDistribuicao.NenhumDocumento);
    expect(r.documentos).toEqual([]);
  });

  it('returns seeded documents above the ultimoNsu cursor', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.seed.dfe([
      {
        nsu: 10,
        chaveAcesso: '1'.repeat(50),
        tipoDocumento: TipoDocumento.Nfse,
        tipoEvento: null,
        xmlDocumento: '<NFSe/>',
        dataHoraGeracao: new Date(),
      },
      {
        nsu: 20,
        chaveAcesso: '2'.repeat(50),
        tipoDocumento: TipoDocumento.Nfse,
        tipoEvento: null,
        xmlDocumento: '<NFSe/>',
        dataHoraGeracao: new Date(),
      },
    ]);

    const r = await fake.fetchByNsu({ ultimoNsu: 5 });
    expect(r.status).toBe(StatusDistribuicao.DocumentosEncontrados);
    expect(r.documentos).toHaveLength(2);
    expect(r.ultimoNsu).toBe(20);

    const next = await fake.fetchByNsu({ ultimoNsu: 20 });
    expect(next.status).toBe(StatusDistribuicao.NenhumDocumento);
  });
});

describe('NfseClientFake.cancelar', () => {
  it('registers the cancellation and returns ok with a fake evento', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const emitted = await fake.emitir(baseEmitirParams());
    if (!('status' in emitted) || emitted.status !== 'ok') throw new Error();

    const r = await fake.cancelar({
      chaveAcesso: emitted.nfse.chaveAcesso,
      autor: { CNPJ: '00574753000100' },
      cMotivo: '1' as never,
      xMotivo: 'erro de teste',
    });

    expect(r.status).toBe('ok');
    expect(fake.cancelledChaves).toContain(emitted.nfse.chaveAcesso);
    expect(fake.eventosRegistrados).toHaveLength(1);
  });

  it('rejects when failNextCancel(rejection) is set (e.g., prazo expirado)', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.failNextCancel({ kind: 'rejection', codigo: 'E8001', descricao: 'Prazo expirado' });
    await expect(
      fake.cancelar({
        chaveAcesso: '1'.repeat(50),
        autor: { CNPJ: '00574753000100' },
        cMotivo: '1' as never,
        xMotivo: 'x',
      }),
    ).rejects.toBeInstanceOf(ReceitaRejectionError);
  });
});

describe('NfseClientFake.substituir', () => {
  it('emits the new DPS and records original as substituted+cancelled', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const original = await fake.emitir(baseEmitirParams());
    if (!('status' in original) || original.status !== 'ok') throw new Error();

    const novaDps = buildDps({ ...baseEmitirParams(), layout: 'nt004', nDPS: '2' });
    const r = await fake.substituir({
      chaveOriginal: original.nfse.chaveAcesso,
      novaDps,
      cMotivo: JustificativaSubstituicao.Outros,
      xMotivo: 'Correção de valor do serviço',
    });

    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.novaNfse.chaveAcesso).toBeDefined();
    expect(fake.cancelledChaves).toContain(original.nfse.chaveAcesso);
    expect(fake.substituidas.get(original.nfse.chaveAcesso)).toBeDefined();
  });
});

describe('NfseClientFake parametros municipais', () => {
  it('returns empty results when nothing is seeded', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const r = await fake.consultarAliquota('2111300', '250101', '2026-03-01');
    expect(r.aliquotas).toEqual({});
  });

  it('returns seeded aliquota', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.seed.aliquota('2111300', '250101', '2026-03-01', {
      aliquotas: {
        '250101': [
          { incidencia: 'Local', aliquota: 2.5, dataInicioVigencia: new Date('2026-01-01') },
        ],
      },
    });

    const r = await fake.consultarAliquota('2111300', '250101', '2026-03-01');
    expect(r.aliquotas['250101']?.[0]?.aliquota).toBe(2.5);
  });

  it('seeded convenio is returned', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.seed.convenio('2111300', {
      parametrosConvenio: {
        tipoConvenio: '1',
        aderenteAmbienteNacional: '1',
        aderenteEmissorNacional: '1',
        situacaoEmissaoPadraoContribuintesRFB: '1',
        aderenteMAN: '0',
      },
    });

    const r = await fake.consultarConvenio('2111300');
    expect(r.parametrosConvenio?.tipoConvenio).toBe('1');
  });
});

describe('NfseClientFake.reset', () => {
  it('clears all state', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    await fake.emitir(baseEmitirParams());
    expect(fake.emittedChaves).toHaveLength(1);

    fake.reset();
    expect(fake.emittedChaves).toEqual([]);
    expect(fake.cancelledChaves).toEqual([]);
    expect(fake.eventosRegistrados).toEqual([]);
  });
});

describe('NfseClientFake — layout', () => {
  it.each([undefined, 'NT004', 'nt010'])('construtor rejeita layout %s', (layout) => {
    expect(() => new NfseClientFake({ layout } as never)).toThrow(InvalidLayoutError);
  });

  it('emitir no fake nt009 monta DPS nt009', async () => {
    const fake = new NfseClientFake({ layout: 'nt009' });
    expect(fake.layout).toBe('nt009');
    const r = await fake.emitir(baseEmitirParams());
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.nfse.nfse.layout).toBe('nt009');
  });

  it('emitirDpsPronta / emitirEmLote / substituir rejeitam DPS de outro layout', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const dpsNt009 = dpsNt009Completa();
    await expect(fake.emitirDpsPronta(dpsNt009 as never)).rejects.toBeInstanceOf(
      LayoutMismatchError,
    );
    const ok = buildDps({ ...baseEmitirParams(), layout: 'nt004', nDPS: '9' });
    await expect(fake.emitirEmLote([ok, dpsNt009] as never)).rejects.toBeInstanceOf(
      LayoutMismatchError,
    );
    expect(fake.emittedChaves).toHaveLength(0); // nada do lote foi "emitido"
    await expect(
      fake.substituir({
        chaveOriginal: '21113002200574753000100000000000146726037032711025',
        novaDps: dpsNt009 as never,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Correção de valor do serviço',
      }),
    ).rejects.toBeInstanceOf(LayoutMismatchError);
  });

  it('emitir com params.layout (chamador JS) diferente do fake lança LayoutMismatchError', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const params = { ...baseEmitirParams(), layout: 'nt009' } as never;
    await expect(fake.emitir(params)).rejects.toMatchObject({
      name: 'LayoutMismatchError',
      expected: 'nt004',
      received: 'nt009',
    });
    await expect(
      fake.emitir({ ...baseEmitirParams(), layout: 'nt010' } as never),
    ).rejects.toBeInstanceOf(InvalidLayoutError);
    expect(fake.emittedChaves).toHaveLength(0);
    // Mesmo layout do fake: aceito (redundante, mas não diverge).
    const ok = await fake.emitir({ ...baseEmitirParams(), layout: 'nt004' } as never);
    expect(ok).toMatchObject({ status: 'ok' });
  });

  it('emitirDpsPronta / substituir rejeitam DPS com campo do outro layout (paridade com o real)', async () => {
    const fake = new NfseClientFake({ layout: 'nt009' });
    const base = dpsNt009Completa();
    const hibrida = {
      ...base,
      infDPS: { ...base.infDPS, valores: { ...base.infDPS.valores, vDedRed: { pDR: 10 } } },
    } as never;
    await expect(fake.emitirDpsPronta(hibrida)).rejects.toMatchObject({
      name: 'LayoutMismatchError',
      field: 'infDPS.valores.vDedRed',
    });
    await expect(fake.emitirDpsPronta(hibrida, { dryRun: true })).rejects.toBeInstanceOf(
      LayoutMismatchError,
    );
    await expect(
      fake.substituir({
        chaveOriginal: '21113002200574753000100000000000146726037032711025',
        novaDps: hibrida,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Correção de valor do serviço',
      }),
    ).rejects.toBeInstanceOf(LayoutMismatchError);
    // Lote: como o real, a DPS híbrida vira item de falha (não aborta o lote).
    const lote = await fake.emitirEmLote([hibrida]);
    expect(lote.failureCount).toBe(1);
    expect(lote.items[0]).toMatchObject({ status: 'failure' });
    expect(fake.emittedChaves).toHaveLength(0);
  });

  it('transient no fake grava layout no PendingEmission', async () => {
    const fake = new NfseClientFake({ layout: 'nt009' });
    fake.failNextEmit({ kind: 'transient' });
    const r = await fake.emitir(baseEmitirParams());
    expect(r.status).toBe('retry_pending');
    if (r.status === 'retry_pending') expect(r.pending.layout).toBe('nt009');
  });
});
