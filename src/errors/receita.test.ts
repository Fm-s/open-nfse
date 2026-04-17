import { describe, expect, it } from 'vitest';
import { OpenNfseError } from './base.js';
import { ReceitaRejectionError } from './receita.js';

describe('ReceitaRejectionError', () => {
  it('exposes código and motivo', () => {
    const err = new ReceitaRejectionError('E001', 'CNPJ inválido');
    expect(err.code).toBe('E001');
    expect(err.reason).toBe('CNPJ inválido');
  });

  it('includes both código and motivo in the message', () => {
    const err = new ReceitaRejectionError('E001', 'CNPJ inválido');
    expect(err.message).toContain('E001');
    expect(err.message).toContain('CNPJ inválido');
  });

  it('is an OpenNfseError', () => {
    expect(new ReceitaRejectionError('E001', 'x')).toBeInstanceOf(OpenNfseError);
  });
});
