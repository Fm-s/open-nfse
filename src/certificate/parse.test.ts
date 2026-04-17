import { Buffer } from 'node:buffer';
import forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ExpiredCertificateError,
  InvalidCertificateError,
  InvalidCertificatePasswordError,
} from '../errors/certificate.js';
import { parsePfx } from './parse.js';

interface GerarPfxOptions {
  readonly senha: string;
  readonly cn?: string;
  readonly notBefore?: Date;
  readonly notAfter?: Date;
}

function gerarPfxTeste(opts: GerarPfxOptions): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = opts.notBefore ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter = opts.notAfter ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: opts.cn ?? 'TEST' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, opts.senha);
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

describe('parsePfx', () => {
  const senha = 'senha-teste-123';
  let validPfx: Buffer;

  beforeAll(() => {
    validPfx = gerarPfxTeste({ senha, cn: 'TEST CN' });
  });

  it('returns PEM-encoded key and cert', () => {
    const parsed = parsePfx(validPfx, senha);
    expect(parsed.keyPem).toMatch(/-----BEGIN(?: RSA)? PRIVATE KEY-----/);
    expect(parsed.certPem).toMatch(/-----BEGIN CERTIFICATE-----/);
  });

  it('exposes both validity dates with expiry after emission', () => {
    const parsed = parsePfx(validPfx, senha);
    expect(parsed.issuedOn).toBeInstanceOf(Date);
    expect(parsed.expiresOn).toBeInstanceOf(Date);
    expect(parsed.expiresOn.getTime()).toBeGreaterThan(parsed.issuedOn.getTime());
  });

  it('extracts the CN subject', () => {
    expect(parsePfx(validPfx, senha).subject).toBe('TEST CN');
  });

  it('throws InvalidCertificatePasswordError on wrong password', () => {
    expect(() => parsePfx(validPfx, 'wrong')).toThrow(InvalidCertificatePasswordError);
  });

  it('throws InvalidCertificateError on garbage input', () => {
    expect(() => parsePfx(Buffer.from('not a pfx at all'), senha)).toThrow(InvalidCertificateError);
  });

  it('throws ExpiredCertificateError when notAfter is in the past', () => {
    const expiredPfx = gerarPfxTeste({
      senha,
      notBefore: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000),
      notAfter: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    expect(() => parsePfx(expiredPfx, senha)).toThrow(ExpiredCertificateError);
  });
});
