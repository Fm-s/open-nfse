import { SignedXml } from 'xml-crypto';
import type { A1Certificate } from '../certificate/types.js';
import { InvalidXmlError, ValidationError } from '../errors/validation.js';

const SIGNATURE_ALGORITHM = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const CANONICALIZATION_ALGORITHM = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const DIGEST_ALGORITHM = 'http://www.w3.org/2001/04/xmlenc#sha256';
const TRANSFORM_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const TRANSFORM_EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';

const EXISTING_SIGNATURE_REGEX =
  /<Signature\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"/;

export class XmlAlreadySignedError extends ValidationError {
  constructor(rootName: string) {
    super(
      `XML <${rootName}> já contém uma assinatura XMLDSig; remova-a antes de assinar novamente.`,
    );
  }
}

export interface SignXmlElementParams {
  /** Nome do elemento raiz (wrapper). Ex.: `DPS`, `pedRegEvento`. */
  readonly rootElementName: string;
  /** Nome do elemento com atributo `Id` cujo subtree será assinado. Ex.: `infDPS`, `infPedReg`. */
  readonly signedElementName: string;
}

/**
 * Assina um XML per RTC v1.01 / NFS-e:
 *  - RSA-SHA256 + exc-c14n + enveloped-signature + SHA-256 digest
 *  - Reference URI = `#<signedElementName Id>`
 *  - KeyInfo com `<X509Certificate>`
 *  - `<Signature>` adicionado como último filho de `<rootElementName>`
 */
export function signXmlElement(
  xml: string,
  certificate: A1Certificate,
  params: SignXmlElementParams,
): string {
  const { rootElementName, signedElementName } = params;

  const idRegex = new RegExp(`<${signedElementName}\\b[^>]*\\bId="([^"]+)"`);
  const match = idRegex.exec(xml);
  if (!match) {
    throw new InvalidXmlError(
      `atributo Id em <${signedElementName}> ausente — elemento deve conter Id para assinar.`,
    );
  }
  const idValue = match[1];

  if (EXISTING_SIGNATURE_REGEX.test(xml)) {
    throw new XmlAlreadySignedError(rootElementName);
  }

  const sig = new SignedXml({
    privateKey: certificate.keyPem,
    publicCert: certificate.certPem,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
  });

  sig.addReference({
    xpath: `//*[local-name(.)='${signedElementName}']`,
    transforms: [TRANSFORM_ENVELOPED, TRANSFORM_EXC_C14N],
    digestAlgorithm: DIGEST_ALGORITHM,
    uri: `#${idValue}`,
  });

  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${rootElementName}']`, action: 'append' },
  });

  return sig.getSignedXml();
}
