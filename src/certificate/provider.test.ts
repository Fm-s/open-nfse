import { Buffer } from 'node:buffer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeProvider, providerFromBuffer, providerFromFile } from './provider.js';

function gerarPfxTeste(senha: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: 'commonName', value: 'TEST' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, senha);
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

describe('providerFromBuffer', () => {
  const senha = 'senha';
  let pfx: Buffer;

  beforeAll(() => {
    pfx = gerarPfxTeste(senha);
  });

  it('resolves to a parsed A1Certificate', async () => {
    const parsed = await providerFromBuffer(pfx, senha).load();
    expect(parsed.keyPem).toBeDefined();
    expect(parsed.certPem).toBeDefined();
  });

  it('caches the parse result across calls', async () => {
    const provider = providerFromBuffer(pfx, senha);
    const a = await provider.load();
    const b = await provider.load();
    expect(a).toBe(b);
  });
});

describe('providerFromFile', () => {
  const senha = 'senha';
  let dir: string;
  let pfxPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'open-nfse-'));
    pfxPath = join(dir, 'test.pfx');
    await writeFile(pfxPath, gerarPfxTeste(senha));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads and parses a .pfx from the filesystem', async () => {
    const parsed = await providerFromFile(pfxPath, senha).load();
    expect(parsed.subject).toBe('TEST');
  });

  it('caches after the first read', async () => {
    const provider = providerFromFile(pfxPath, senha);
    const a = await provider.load();
    const b = await provider.load();
    expect(a).toBe(b);
  });
});

describe('normalizeProvider', () => {
  const senha = 'senha';
  let pfx: Buffer;

  beforeAll(() => {
    pfx = gerarPfxTeste(senha);
  });

  it('wraps a plain { pfx, password: senha } input in a provider', async () => {
    const provider = normalizeProvider({ pfx, password: senha });
    const parsed = await provider.load();
    expect(parsed.keyPem).toBeDefined();
  });

  it('returns an existing provider unchanged', () => {
    const custom = providerFromBuffer(pfx, senha);
    expect(normalizeProvider(custom)).toBe(custom);
  });
});
