import { describe, expect, it } from 'vitest';
import { NetworkError, ServerError, TimeoutError } from '../errors/http.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import { defaultIsTransient } from './classify-error.js';

describe('defaultIsTransient', () => {
  it('treats NetworkError as transient', () => {
    expect(defaultIsTransient(new NetworkError('socket closed'))).toBe(true);
  });

  it('treats TimeoutError as transient', () => {
    expect(defaultIsTransient(new TimeoutError(60_000))).toBe(true);
  });

  it('treats ServerError (5xx) as transient', () => {
    expect(defaultIsTransient(new ServerError(503, undefined))).toBe(true);
  });

  it('treats arbitrary Error as permanent', () => {
    expect(defaultIsTransient(new Error('bug interno'))).toBe(false);
  });

  it('treats most ReceitaRejectionError codes as permanent', () => {
    const rejeicao = new ReceitaRejectionError({
      mensagens: [{ codigo: 'E0001', descricao: 'CNPJ inválido' }],
    });
    expect(defaultIsTransient(rejeicao)).toBe(false);
  });

  it('treats E1217 (manutenção SEFIN) as transient', () => {
    const manutencao = new ReceitaRejectionError({
      mensagens: [{ codigo: 'E1217', descricao: 'Serviço paralisado para manutenção' }],
    });
    expect(defaultIsTransient(manutencao)).toBe(true);
  });

  it('treats E1206 (erro de acesso a LCR) as transient', () => {
    const crl = new ReceitaRejectionError({
      mensagens: [
        { codigo: 'E1206', descricao: 'Certificado de Transmissão — Erro de acesso a LCR' },
      ],
    });
    expect(defaultIsTransient(crl)).toBe(true);
  });
});
