import { SignedXml } from 'xml-crypto';
import type { A1Certificate } from '../certificate/types.js';
import { InvalidXmlError, ValidationError } from '../errors/validation.js';

const SIGNATURE_ALGORITHM = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const CANONICALIZATION_ALGORITHM = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const DIGEST_ALGORITHM = 'http://www.w3.org/2001/04/xmlenc#sha256';
const TRANSFORM_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const TRANSFORM_EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';

const INFDPS_ID_REGEX = /<infDPS\b[^>]*\bId="([^"]+)"/;
const EXISTING_SIGNATURE_REGEX =
  /<Signature\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"/;

export class DpsAlreadySignedError extends ValidationError {
  constructor() {
    super('DPS XML já contém uma assinatura XMLDSig; remova-a antes de assinar novamente.');
  }
}

/**
 * Signs a DPS XML document per RTC v1.01 requirements:
 *  - Signature algorithm: RSA-SHA256
 *  - Canonicalization: exclusive XML C14N (`xml-exc-c14n`)
 *  - Reference transforms: enveloped-signature + exc-c14n
 *  - Digest algorithm: SHA-256
 *  - Reference URI: `#<infDPS Id>` (signs the `<infDPS>` subtree)
 *  - KeyInfo: embeds the signer X.509 certificate as `<X509Certificate>`
 *
 * The resulting `<Signature>` element is appended as the last child of `<DPS>`.
 */
export function signDpsXml(dpsXml: string, certificate: A1Certificate): string {
  const match = INFDPS_ID_REGEX.exec(dpsXml);
  if (!match) {
    throw new InvalidXmlError('atributo Id em <infDPS> ausente — DPS deve conter Id para assinar.');
  }
  const infDpsId = match[1];

  if (EXISTING_SIGNATURE_REGEX.test(dpsXml)) {
    throw new DpsAlreadySignedError();
  }

  const sig = new SignedXml({
    privateKey: certificate.keyPem,
    publicCert: certificate.certPem,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
  });

  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    transforms: [TRANSFORM_ENVELOPED, TRANSFORM_EXC_C14N],
    digestAlgorithm: DIGEST_ALGORITHM,
    uri: `#${infDpsId}`,
  });

  sig.computeSignature(dpsXml, {
    location: { reference: "//*[local-name(.)='DPS']", action: 'append' },
  });

  return sig.getSignedXml();
}
