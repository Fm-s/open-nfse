import { describe, expect, it } from 'vitest';
import { InvalidCnpjError, InvalidCpfError } from '../errors/validation.js';
import { validateCnpj, validateCpf } from './validate-cpf-cnpj.js';

describe('validateCpf', () => {
  it('passes for known valid CPFs', () => {
    // generated via https://www.4devs.com.br/gerador_de_cpf
    expect(() => validateCpf('52998224725')).not.toThrow();
    expect(() => validateCpf('01075595363')).not.toThrow();
    expect(() => validateCpf('93541134780')).not.toThrow();
  });

  it('throws format when fewer/more digits or non-numeric', () => {
    const bad = ['', '123', '529982247250', 'abcdefghijk'];
    for (const cpf of bad) {
      expect(() => validateCpf(cpf)).toThrow(InvalidCpfError);
    }
  });

  it('throws known_invalid for repeated-digit sequences', () => {
    for (const d of '0123456789') {
      const seq = d.repeat(11);
      try {
        validateCpf(seq);
        expect.fail(`esperava falhar para ${seq}`);
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidCpfError);
        expect((err as InvalidCpfError).reason).toBe('known_invalid');
      }
    }
  });

  it('throws check_digit when digits verify incorrectly', () => {
    // flip one digit at the end of a known-valid CPF
    try {
      validateCpf('52998224726');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidCpfError);
      expect((err as InvalidCpfError).reason).toBe('check_digit');
    }
  });
});

describe('validateCnpj', () => {
  it('passes for known valid CNPJs', () => {
    expect(() => validateCnpj('00574753000100')).not.toThrow();
    expect(() => validateCnpj('11222333000181')).not.toThrow();
    expect(() => validateCnpj('33000167000101')).not.toThrow(); // Petrobras
  });

  it('throws format when wrong length or non-numeric', () => {
    expect(() => validateCnpj('')).toThrow(InvalidCnpjError);
    expect(() => validateCnpj('123')).toThrow(InvalidCnpjError);
    expect(() => validateCnpj('005747530001000')).toThrow(InvalidCnpjError);
    expect(() => validateCnpj('00574753000ABC')).toThrow(InvalidCnpjError);
  });

  it('throws known_invalid for repeated-digit sequences', () => {
    for (const d of '0123456789') {
      const seq = d.repeat(14);
      try {
        validateCnpj(seq);
        expect.fail(`esperava falhar para ${seq}`);
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidCnpjError);
        expect((err as InvalidCnpjError).reason).toBe('known_invalid');
      }
    }
  });

  it('throws check_digit when digits verify incorrectly', () => {
    // flip last digit of valid Petrobras CNPJ
    try {
      validateCnpj('33000167000102');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidCnpjError);
      expect((err as InvalidCnpjError).reason).toBe('check_digit');
    }
  });

  it('exposes the rejected value on the error', () => {
    try {
      validateCnpj('11111111111111');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as InvalidCnpjError).cnpj).toBe('11111111111111');
    }
  });
});
