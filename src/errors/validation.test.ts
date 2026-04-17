import { describe, expect, it } from 'vitest';
import { OpenNfseError } from './base.js';
import { InvalidChaveAcessoError, ValidationError } from './validation.js';

describe('InvalidChaveAcessoError', () => {
  it('is catchable as ValidationError and OpenNfseError', () => {
    const err = new InvalidChaveAcessoError('abc');
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toBeInstanceOf(OpenNfseError);
  });

  it('exposes the invalid value on the error', () => {
    const err = new InvalidChaveAcessoError('abc');
    expect(err.value).toBe('abc');
  });

  it('includes the invalid value and hint about format in the message', () => {
    const err = new InvalidChaveAcessoError('abc');
    expect(err.message).toContain('abc');
    expect(err.message).toContain('50');
  });
});
