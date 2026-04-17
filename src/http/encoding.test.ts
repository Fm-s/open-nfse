import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { gzipBase64Decode, gzipBase64DecodeToText, gzipBase64Encode } from './encoding.js';

describe('encoding round-trip', () => {
  it('preserves string content', () => {
    const input = 'Olá, NFS-e Nacional! '.repeat(50);
    const b64 = gzipBase64Encode(input);
    expect(gzipBase64DecodeToText(b64)).toBe(input);
  });

  it('preserves Buffer content byte-for-byte', () => {
    const input = Buffer.from([0, 1, 2, 255, 128, 64]);
    const roundTripped = gzipBase64Decode(gzipBase64Encode(input));
    expect(roundTripped.equals(input)).toBe(true);
  });

  it('produces valid base64', () => {
    expect(gzipBase64Encode('x')).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it('compresses repetitive content significantly', () => {
    const input = 'a'.repeat(10_000);
    expect(gzipBase64Encode(input).length).toBeLessThan(input.length / 10);
  });

  it('throws on invalid gzip input', () => {
    expect(() => gzipBase64Decode('not-gzip-at-all')).toThrow();
  });
});
