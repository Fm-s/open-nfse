import { describe, expect, it } from 'vitest';
import { OpenNfseError } from './base.js';
import {
  CertificateError,
  ExpiredCertificateError,
  InvalidCertificateError,
  InvalidCertificatePasswordError,
} from './certificate.js';

describe('ExpiredCertificateError', () => {
  it('is catchable as CertificateError and OpenNfseError', () => {
    const err = new ExpiredCertificateError(new Date('2024-01-01'));
    expect(err).toBeInstanceOf(CertificateError);
    expect(err).toBeInstanceOf(OpenNfseError);
  });

  it('exposes the expiry date', () => {
    const date = new Date('2024-01-01');
    expect(new ExpiredCertificateError(date).expiredOn).toBe(date);
  });

  it('mentions the expiry date in the message', () => {
    const err = new ExpiredCertificateError(new Date('2024-01-01T00:00:00Z'));
    expect(err.message).toContain('2024-01-01');
  });
});

describe('InvalidCertificateError', () => {
  it('includes the detail in the message', () => {
    expect(new InvalidCertificateError('formato não reconhecido').message).toContain(
      'formato não reconhecido',
    );
  });
});

describe('InvalidCertificatePasswordError', () => {
  it('has a Portuguese message about senha', () => {
    expect(new InvalidCertificatePasswordError().message).toContain('Senha');
  });
});
