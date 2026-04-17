import type { Buffer } from 'node:buffer';
import forge from 'node-forge';
import {
  ExpiredCertificateError,
  InvalidCertificateError,
  InvalidCertificatePasswordError,
} from '../errors/certificate.js';
import type { A1Certificate } from './types.js';

const OID_PKCS8_SHROUDED = forge.pki.oids.pkcs8ShroudedKeyBag as string;
const OID_KEY_BAG = forge.pki.oids.keyBag as string;
const OID_CERT_BAG = forge.pki.oids.certBag as string;

export function parsePfx(pfx: Buffer, password: string): A1Certificate {
  const asn1 = parseAsn1(pfx);
  const p12 = parsePkcs12(asn1, password);

  const key = extractPrivateKey(p12);
  const cert = extractCertificate(p12);

  const issuedOn = cert.validity.notBefore;
  const expiresOn = cert.validity.notAfter;

  if (expiresOn.getTime() < Date.now()) {
    throw new ExpiredCertificateError(expiresOn);
  }

  const cnField = cert.subject.getField('CN') as { value?: string } | null;
  const subject = cnField?.value ?? '';

  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(cert),
    issuedOn,
    expiresOn,
    subject,
  };
}

function parseAsn1(pfx: Buffer): forge.asn1.Asn1 {
  try {
    return forge.asn1.fromDer(pfx.toString('binary'));
  } catch (cause) {
    throw new InvalidCertificateError('arquivo .pfx corrompido ou não é DER válido', { cause });
  }
}

function parsePkcs12(asn1: forge.asn1.Asn1, password: string): forge.pkcs12.Pkcs12Pfx {
  try {
    return forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/mac|password|integrity/i.test(message)) {
      throw new InvalidCertificatePasswordError({ cause });
    }
    throw new InvalidCertificateError(message, { cause });
  }
}

function extractPrivateKey(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.PrivateKey {
  for (const bagType of [OID_PKCS8_SHROUDED, OID_KEY_BAG]) {
    const bags = p12.getBags({ bagType })[bagType];
    const bag = bags?.[0];
    if (bag?.key) return bag.key;
  }
  throw new InvalidCertificateError('chave privada não encontrada no .pfx');
}

function extractCertificate(p12: forge.pkcs12.Pkcs12Pfx): forge.pki.Certificate {
  const bags = p12.getBags({ bagType: OID_CERT_BAG })[OID_CERT_BAG];
  const bag = bags?.[0];
  if (!bag?.cert) {
    throw new InvalidCertificateError('certificado não encontrado no .pfx');
  }
  return bag.cert;
}
