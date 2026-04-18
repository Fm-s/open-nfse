import { describe, expect, it } from 'vitest';
import { TipoAmbiente } from '../ambiente.js';
import { StatusDistribuicao, TipoDocumento } from '../dfe/types.js';
import { NotFoundError } from '../errors/http.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import { buildDps } from '../nfse/build-dps.js';
import type { EmitirParams } from '../nfse/emit.js';
import { OpcaoSimplesNacional, RegimeEspecialTributacao } from '../nfse/enums.js';
import { NfseClientFake } from './nfse-client-fake.js';

function baseEmitirParams(): EmitirParams {
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
    servico: { cTribNac: '010101', cNBS: '123456789', descricao: 'Teste' },
    valores: { vServ: 100 },
  };
}

describe('NfseClientFake.emitir', () => {
  it('returns ok with a synthesized chave + parsed nfse', async () => {
    const fake = new NfseClientFake();
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
    const fake = new NfseClientFake();
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
    const fake = new NfseClientFake();
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
    const fake = new NfseClientFake();
    const r = await fake.emitir({ ...baseEmitirParams(), dryRun: true });

    expect('dryRun' in r && r.dryRun).toBe(true);
    expect(fake.emittedChaves).toHaveLength(0);
  });

  it('nDPS increments per emitir call', async () => {
    const fake = new NfseClientFake();
    const r1 = await fake.emitir(baseEmitirParams());
    const r2 = await fake.emitir(baseEmitirParams());

    if ('status' in r1 && r1.status === 'ok' && 'status' in r2 && r2.status === 'ok') {
      expect(r1.nfse.idDps).not.toBe(r2.nfse.idDps);
    }
  });
});

describe('NfseClientFake.fetchByChave', () => {
  it('returns seeded NFS-e', async () => {
    const fake = new NfseClientFake();
    const emitted = await fake.emitir(baseEmitirParams());
    if (!('status' in emitted) || emitted.status !== 'ok') throw new Error('emit should succeed');

    const r = await fake.fetchByChave(emitted.nfse.chaveAcesso);
    expect(r.chaveAcesso).toBe(emitted.nfse.chaveAcesso);
    expect(r.nfse.infNFSe.chaveAcesso).toBe(emitted.nfse.chaveAcesso);
  });

  it('throws NotFoundError for un-seeded chave', async () => {
    const fake = new NfseClientFake();
    await expect(
      fake.fetchByChave('21113002200574753000100000000000146726037032711025'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws InvalidChaveAcessoError for malformed chave', async () => {
    const fake = new NfseClientFake();
    await expect(fake.fetchByChave('abc')).rejects.toMatchObject({
      name: 'InvalidChaveAcessoError',
    });
  });
});

describe('NfseClientFake.fetchByNsu', () => {
  it('returns NENHUM_DOCUMENTO_LOCALIZADO when dfe queue is empty', async () => {
    const fake = new NfseClientFake();
    const r = await fake.fetchByNsu({ ultimoNsu: 0 });
    expect(r.status).toBe(StatusDistribuicao.NenhumDocumento);
    expect(r.documentos).toEqual([]);
  });

  it('returns seeded documents above the ultimoNsu cursor', async () => {
    const fake = new NfseClientFake();
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
    const fake = new NfseClientFake();
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
    const fake = new NfseClientFake();
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
    const fake = new NfseClientFake();
    const original = await fake.emitir(baseEmitirParams());
    if (!('status' in original) || original.status !== 'ok') throw new Error();

    const novaDps = buildDps({ ...baseEmitirParams(), nDPS: '2' });
    const r = await fake.substituir({
      chaveOriginal: original.nfse.chaveAcesso,
      novaDps,
      autor: { CNPJ: '00574753000100' },
      cMotivo: '99' as never,
    });

    expect(r.status).toBe('ok');
    expect(fake.cancelledChaves).toContain(original.nfse.chaveAcesso);
    expect(fake.substituidas.get(original.nfse.chaveAcesso)).toBeDefined();
  });
});

describe('NfseClientFake parametros municipais', () => {
  it('returns empty results when nothing is seeded', async () => {
    const fake = new NfseClientFake();
    const r = await fake.consultarAliquota('2111300', '250101', '2026-03-01');
    expect(r.aliquotas).toEqual({});
  });

  it('returns seeded aliquota', async () => {
    const fake = new NfseClientFake();
    fake.seed.aliquota('2111300', '250101', '2026-03-01', {
      aliquotas: {
        '250101': [{ incidencia: 'Local', aliquota: 2.5, dataInicio: new Date('2026-01-01') }],
      },
    });

    const r = await fake.consultarAliquota('2111300', '250101', '2026-03-01');
    expect(r.aliquotas['250101']?.[0]?.aliquota).toBe(2.5);
  });

  it('seeded convenio is returned', async () => {
    const fake = new NfseClientFake();
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
    const fake = new NfseClientFake();
    await fake.emitir(baseEmitirParams());
    expect(fake.emittedChaves).toHaveLength(1);

    fake.reset();
    expect(fake.emittedChaves).toEqual([]);
    expect(fake.cancelledChaves).toEqual([]);
    expect(fake.eventosRegistrados).toEqual([]);
  });
});
