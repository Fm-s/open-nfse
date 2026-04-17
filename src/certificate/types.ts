import type { Buffer } from 'node:buffer';

export interface A1Certificate {
  readonly keyPem: string;
  readonly certPem: string;
  readonly issuedOn: Date;
  readonly expiresOn: Date;
  readonly subject: string;
}

export interface PfxCertificateInput {
  readonly pfx: Buffer;
  readonly password: string;
}

export interface CertificateProvider {
  load(): Promise<A1Certificate>;
}

export type CertificateInput = PfxCertificateInput | CertificateProvider;
