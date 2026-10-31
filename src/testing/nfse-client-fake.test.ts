import { describe, expect, it } from 'vitest';
import { TipoAmbiente } from '../ambiente.js';
import { StatusDistribuicao, TipoDocumento } from '../dfe/types.js';
import { NotFoundError } from '../errors/http.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import {
  InvalidLayoutError,
  LayoutMismatchError,
  RuleViolationError,
} from '../errors/validation.js';
import { dpsNt009Completa } from '../nfse/__fixtures__/dps-nt009.js';
import { buildDps } from '../nfse/build-dps.js';
import type { EmitirParams } from '../nfse/emit.js';
import {
  JustificativaCancelamento,
  JustificativaSubstituicao,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from '../nfse/enums.js';
import { NfseClientFake } from './nfse-client-fake.js';
import { synthChaveAcesso } from './synth.js';

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
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'Erro de teste na emissão',
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
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo: 'Erro de teste na emissão',
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

describe('NfseClientFake — CNPJ alfanumérico', () => {
  // Exemplo da RFB (DV válido); letra no índice 11 cai na posição 20 da chave
  // pela regra de formação de TSIdNFSe — fora das posições 7–20 de TSChaveNFSe.
  const CNPJ_ALFA = '12ABC34501DE35';

  it('a chave sintetizada passa no fetchByChave, consultarDanfse e cancelar do próprio fake', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const p = baseEmitirParams();
    const r = await fake.emitir({ ...p, emitente: { ...p.emitente, cnpj: CNPJ_ALFA } });
    if (!('status' in r) || r.status !== 'ok') throw new Error('esperava ok');
    const chave = r.nfse.chaveAcesso;
    expect(chave.slice(9, 23)).toBe(CNPJ_ALFA);

    await expect(fake.fetchByChave(chave)).resolves.toMatchObject({ chaveAcesso: chave });
    await expect(fake.consultarDanfse(chave)).resolves.toBeInstanceOf(Buffer);
    await expect(
      fake.cancelar({
        chaveAcesso: chave,
        autor: { CNPJ: CNPJ_ALFA },
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo: 'Erro de teste na emissão',
      }),
    ).resolves.toMatchObject({ status: 'ok' });
  });

  it('substituir segue o TSChaveNFSe do XSD (letra fora das posições 7–20 → RuleViolationError, como no real)', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const p = baseEmitirParams();
    const emitente = { ...p.emitente, cnpj: CNPJ_ALFA };
    const r = await fake.emitir({ ...p, emitente });
    if (!('status' in r) || r.status !== 'ok') throw new Error('esperava ok');
    const novaDps = buildDps({ ...p, emitente, layout: 'nt004', nDPS: '2' });
    await expect(
      fake.substituir({
        chaveOriginal: r.nfse.chaveAcesso,
        novaDps,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Correção de valor do serviço',
      }),
    ).rejects.toMatchObject({ name: 'RuleViolationError', rule: 'TSChaveNFSe' });
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
        chaveOriginal: synthChaveAcesso(1, '', base.infDPS.Id),
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

describe('NfseClientFake — validações offline antes da falha programada (paridade com emitSeguro)', () => {
  const comAjusteBC = () =>
    ({ ...baseEmitirParams(), ajusteBC: { issqn: { valor: 400 } } }) as never;

  it('rejection programada não mascara o guard de buildDps nem é consumida por ele', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.failNextEmit({ kind: 'rejection', codigo: 'E1', descricao: 'x' });
    // nt004 não aceita ajusteBC (nt009) — o real lança antes de qualquer POST.
    await expect(fake.emitir(comAjusteBC())).rejects.toBeInstanceOf(LayoutMismatchError);
    // A falha simula o POST; como nada foi "enviado", continua programada.
    await expect(fake.emitir(baseEmitirParams())).rejects.toBeInstanceOf(ReceitaRejectionError);
  });

  it('transient programada: o guard lança antes de consumir a falha ou o sequencial', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.failNextEmit({ kind: 'transient' });
    await expect(fake.emitir(comAjusteBC())).rejects.toBeInstanceOf(LayoutMismatchError);
    const r = await fake.emitir(baseEmitirParams());
    expect(r.status).toBe('retry_pending');
    if (r.status === 'retry_pending') expect(r.pending.nDPS).toBe('1');
  });

  it('dry-run não faz POST — não consome a falha programada', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.failNextEmit({ kind: 'rejection', codigo: 'E1', descricao: 'x' });
    const dry = await fake.emitir({ ...baseEmitirParams(), dryRun: true });
    expect(dry.dryRun).toBe(true);
    await expect(fake.emitir(baseEmitirParams())).rejects.toBeInstanceOf(ReceitaRejectionError);
  });
});

describe('NfseClientFake.cancelar / substituir — mesmos guards offline do real', () => {
  const CHAVE = '21113002200574753000100000000000146726037032711025';
  const autor = { CNPJ: '00574753000100' };

  it('cancelar: cMotivo=9 sem xMotivo e xMotivo fora de TSMotivo lançam antes da falha programada', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    fake.failNextCancel({ kind: 'rejection', codigo: 'E1', descricao: 'x' });
    await expect(
      fake.cancelar({
        chaveAcesso: CHAVE,
        autor,
        cMotivo: JustificativaCancelamento.Outros,
        xMotivo: '  ',
      }),
    ).rejects.toMatchObject({ name: 'RuleViolationError', rule: 'e101101/xMotivo' });
    await expect(
      fake.cancelar({
        chaveAcesso: CHAVE,
        autor,
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo: 'curto',
      }),
    ).rejects.toMatchObject({ name: 'RuleViolationError', rule: 'TSMotivo' });
    expect(fake.cancelledChaves).toEqual([]);
    // A falha programada segue intacta para a próxima chamada válida.
    await expect(
      fake.cancelar({
        chaveAcesso: CHAVE,
        autor,
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo: 'Erro de teste na emissão',
      }),
    ).rejects.toBeInstanceOf(ReceitaRejectionError);
  });

  it('substituir: cMotivo=99 sem xMotivo (E0078) e xMotivo fora de TSMotivo lançam sem emitir', async () => {
    const fake = new NfseClientFake({ layout: 'nt004' });
    const novaDps = buildDps({ ...baseEmitirParams(), layout: 'nt004', nDPS: '2' });
    await expect(
      fake.substituir({ chaveOriginal: CHAVE, novaDps, cMotivo: JustificativaSubstituicao.Outros }),
    ).rejects.toMatchObject({ name: 'RuleViolationError', rule: 'E0078' });
    await expect(
      fake.substituir({
        chaveOriginal: CHAVE,
        novaDps,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'curto',
      }),
    ).rejects.toBeInstanceOf(RuleViolationError);
    expect(fake.emittedChaves).toEqual([]);
    expect(fake.substituidas.size).toBe(0);
  });

  it.each(['nt004', 'nt009'] as const)(
    'substituir (%s): a substituta carrega infDPS.subst com a chave original',
    async (layout) => {
      const fake = new NfseClientFake({ layout });
      const novaDps =
        layout === 'nt004'
          ? buildDps({ ...baseEmitirParams(), layout, nDPS: '2' })
          : dpsNt009Completa();
      // E0042: a chave substituída é do mesmo emitente/município do Id da DPS.
      const chaveOriginal = synthChaveAcesso(1, '', novaDps.infDPS.Id);
      const r = await fake.substituir({
        chaveOriginal,
        novaDps: novaDps as never,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Correção de valor do serviço',
      });
      if (r.status !== 'ok') throw new Error('esperava ok');
      expect(r.novaNfse.nfse.infNFSe.DPS.infDPS.subst).toEqual({
        chSubstda: chaveOriginal,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Correção de valor do serviço',
      });
    },
  );
});

describe('synthChaveAcesso com idDps', () => {
  it('segue a regra de formação de TSIdNFSe a partir do Id da DPS (E0042)', () => {
    const idDps = 'DPS211130020057475300010000001000000000000002';
    const chave = synthChaveAcesso(7, '', idDps);
    expect(chave).toMatch(/^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/);
    expect(chave.slice(0, 7)).toBe('2111300'); // Cód.Mun.
    expect(chave.slice(7, 8)).toBe('2'); // Amb.Ger. = Sefin Nacional
    expect(chave.slice(8, 9)).toBe('2'); // Tipo de Inscrição
    expect(chave.slice(9, 23)).toBe('00574753000100'); // Inscrição
    expect(synthChaveAcesso(8, '', idDps)).not.toBe(chave);
  });
});
