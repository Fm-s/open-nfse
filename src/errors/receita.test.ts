import { describe, expect, it } from 'vitest';
import { TipoAmbiente } from '../ambiente.js';
import { OpenNfseError } from './base.js';
import {
  ReceitaRejectionError,
  receitaRejectionFromPostError,
  receitaRejectionFromResponseErro,
} from './receita.js';

describe('ReceitaRejectionError', () => {
  it('exposes codigo/descricao/complemento from the first message', () => {
    const err = new ReceitaRejectionError({
      mensagens: [{ codigo: 'E001', descricao: 'CNPJ inválido', complemento: 'prest.CNPJ' }],
    });
    expect(err.codigo).toBe('E001');
    expect(err.descricao).toBe('CNPJ inválido');
    expect(err.complemento).toBe('prest.CNPJ');
    expect(err.mensagens).toHaveLength(1);
  });

  it('includes codigo and descricao in Error.message', () => {
    const err = new ReceitaRejectionError({
      mensagens: [{ codigo: 'E001', descricao: 'CNPJ inválido' }],
    });
    expect(err.message).toContain('E001');
    expect(err.message).toContain('CNPJ inválido');
  });

  it('appends "(+N erros)" suffix when there are multiple messages', () => {
    const err = new ReceitaRejectionError({
      mensagens: [
        { codigo: 'E001', descricao: 'a' },
        { codigo: 'E002', descricao: 'b' },
        { codigo: 'E003', descricao: 'c' },
      ],
    });
    expect(err.message).toContain('(+2 erros)');
    expect(err.mensagens).toHaveLength(3);
  });

  it('uses singular "(+1 erro)" for a single extra message', () => {
    const err = new ReceitaRejectionError({
      mensagens: [
        { codigo: 'E001', descricao: 'a' },
        { codigo: 'E002', descricao: 'b' },
      ],
    });
    expect(err.message).toContain('(+1 erro)');
    expect(err.message).not.toContain('erros');
  });

  it('is an OpenNfseError', () => {
    const err = new ReceitaRejectionError({
      mensagens: [{ codigo: 'E001', descricao: 'x' }],
    });
    expect(err).toBeInstanceOf(OpenNfseError);
  });

  it('carries optional idDps, tipoAmbiente, versaoAplicativo and dataHoraProcessamento', () => {
    const when = new Date('2026-04-17T12:00:00Z');
    const err = new ReceitaRejectionError({
      mensagens: [{ codigo: 'E001', descricao: 'x' }],
      idDps: 'DPS1234',
      tipoAmbiente: TipoAmbiente.Homologacao,
      versaoAplicativo: 'SefinNacional_1.6.0',
      dataHoraProcessamento: when,
    });
    expect(err.idDps).toBe('DPS1234');
    expect(err.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
    expect(err.versaoAplicativo).toBe('SefinNacional_1.6.0');
    expect(err.dataHoraProcessamento).toBe(when);
  });

  it('throws when constructed with an empty mensagens array', () => {
    expect(() => new ReceitaRejectionError({ mensagens: [] })).toThrow();
  });

  it('preserves Error.cause when provided', () => {
    const cause = new Error('http 400');
    const err = new ReceitaRejectionError({
      mensagens: [{ codigo: 'E001', descricao: 'x' }],
      cause,
    });
    expect(err.cause).toBe(cause);
  });
});

describe('receitaRejectionFromPostError', () => {
  it('maps NFSePostResponseErro body with multiple erros into a typed error', () => {
    const err = receitaRejectionFromPostError({
      tipoAmbiente: 2,
      versaoAplicativo: 'SefinNacional_1.6.0',
      dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
      idDPS: 'DPS211130010057475300010000000010000000000000001',
      erros: [
        { codigo: 'E200', descricao: 'Rejeição: servidor em manutenção' },
        { codigo: 'E401', descricao: 'CNPJ do emitente não autorizado', complemento: 'prest' },
      ],
    });

    expect(err).toBeInstanceOf(ReceitaRejectionError);
    expect(err?.codigo).toBe('E200');
    expect(err?.mensagens).toHaveLength(2);
    expect(err?.idDps).toBe('DPS211130010057475300010000000010000000000000001');
    expect(err?.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
    expect(err?.versaoAplicativo).toBe('SefinNacional_1.6.0');
    expect(err?.dataHoraProcessamento?.toISOString()).toBe('2026-04-17T15:00:00.000Z');
  });

  it('maps tipoAmbiente=1 to TipoAmbiente.Producao', () => {
    const err = receitaRejectionFromPostError({
      tipoAmbiente: 1,
      erros: [{ codigo: 'E001', descricao: 'x' }],
    });
    expect(err?.tipoAmbiente).toBe(TipoAmbiente.Producao);
  });

  it('returns undefined when the body has no erros', () => {
    const err = receitaRejectionFromPostError({
      tipoAmbiente: 2,
      versaoAplicativo: 'v',
      dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
      erros: [],
    });
    expect(err).toBeUndefined();
  });

  it('returns undefined when erros is missing entirely', () => {
    const err = receitaRejectionFromPostError({});
    expect(err).toBeUndefined();
  });

  it('skips erros entries that have neither codigo nor descricao', () => {
    const err = receitaRejectionFromPostError({
      erros: [{}, { codigo: 'E001', descricao: 'real error' }, { complemento: 'só complemento' }],
    });
    expect(err?.mensagens).toHaveLength(1);
    expect(err?.codigo).toBe('E001');
  });

  it('falls back to "UNKNOWN"/"(sem descrição)" when only one field is present', () => {
    const err = receitaRejectionFromPostError({
      erros: [{ codigo: 'E001' }, { descricao: 'só descrição' }],
    });
    expect(err?.mensagens).toEqual([
      { codigo: 'E001', descricao: '(sem descrição)' },
      { codigo: 'UNKNOWN', descricao: 'só descrição' },
    ]);
  });

  it('forwards the cause option to the produced error', () => {
    const cause = new Error('parse error');
    const err = receitaRejectionFromPostError(
      { erros: [{ codigo: 'E001', descricao: 'x' }] },
      { cause },
    );
    expect(err?.cause).toBe(cause);
  });

  it('ignores malformed dataHoraProcessamento', () => {
    const err = receitaRejectionFromPostError({
      erros: [{ codigo: 'E001', descricao: 'x' }],
      dataHoraProcessamento: 'not-a-date',
    });
    expect(err?.dataHoraProcessamento).toBeUndefined();
  });
});

describe('receitaRejectionFromResponseErro', () => {
  it('maps a single `erro` mensagem into a ReceitaRejectionError', () => {
    const err = receitaRejectionFromResponseErro({
      tipoAmbiente: 2,
      versaoAplicativo: 'SefinNacional_1.6.0',
      dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
      erro: { codigo: 'E404', descricao: 'Chave não encontrada' },
    });

    expect(err).toBeInstanceOf(ReceitaRejectionError);
    expect(err?.codigo).toBe('E404');
    expect(err?.mensagens).toHaveLength(1);
    expect(err?.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
    expect(err?.versaoAplicativo).toBe('SefinNacional_1.6.0');
  });

  it('returns undefined when erro is missing', () => {
    expect(receitaRejectionFromResponseErro({ tipoAmbiente: 2 })).toBeUndefined();
  });

  it('returns undefined when erro has neither codigo nor descricao', () => {
    expect(receitaRejectionFromResponseErro({ erro: {} })).toBeUndefined();
  });
});
