import { OpenNfseError } from './base.js';

export abstract class CertificateError extends OpenNfseError {}

export class ExpiredCertificateError extends CertificateError {
  constructor(
    public readonly expiredOn: Date,
    options?: { cause?: unknown },
  ) {
    super(`Certificado A1 expirou em ${expiredOn.toISOString()}. Renove no ICP-Brasil.`, options);
  }
}

export class InvalidCertificateError extends CertificateError {
  constructor(detalhe: string, options?: { cause?: unknown }) {
    super(`Certificado A1 inválido: ${detalhe}`, options);
  }
}

export class InvalidCertificatePasswordError extends CertificateError {
  constructor(options?: { cause?: unknown }) {
    super('Senha do certificado A1 incorreta.', options);
  }
}
