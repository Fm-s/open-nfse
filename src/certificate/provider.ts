import type { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { parsePfx } from './parse.js';
import type { A1Certificate, CertificateInput, CertificateProvider } from './types.js';

export function providerFromFile(path: string, password: string): CertificateProvider {
  let cached: A1Certificate | undefined;
  return {
    async load() {
      if (!cached) {
        const pfx = await readFile(path);
        cached = parsePfx(pfx, password);
      }
      return cached;
    },
  };
}

export function providerFromBuffer(pfx: Buffer, password: string): CertificateProvider {
  let cached: A1Certificate | undefined;
  return {
    async load() {
      if (!cached) cached = parsePfx(pfx, password);
      return cached;
    },
  };
}

export function normalizeProvider(input: CertificateInput): CertificateProvider {
  if ('load' in input) {
    return input;
  }
  return providerFromBuffer(input.pfx, input.password);
}
