import type { A1Certificate } from '../certificate/types.js';
import { ValidationError } from '../errors/validation.js';
import { signXmlElement } from '../xml/sign.js';

/**
 * Kept for back-compat: existing callers expect `DpsAlreadySignedError`.
 * The generic signer throws `XmlAlreadySignedError`; we translate.
 */
export class DpsAlreadySignedError extends ValidationError {
  constructor() {
    super('DPS XML já contém uma assinatura XMLDSig; remova-a antes de assinar novamente.');
  }
}

/**
 * Assina uma DPS per RTC v1.01 (thin wrapper sobre `signXmlElement`).
 * RSA-SHA256 + exc-c14n + enveloped-signature; Reference URI = `#<infDPS.Id>`.
 */
export function signDpsXml(dpsXml: string, certificate: A1Certificate): string {
  try {
    return signXmlElement(dpsXml, certificate, {
      rootElementName: 'DPS',
      signedElementName: 'infDPS',
    });
  } catch (err) {
    // Preserve the v0.2 error identity for consumers catching DpsAlreadySignedError.
    if (err instanceof Error && err.name === 'XmlAlreadySignedError') {
      throw new DpsAlreadySignedError();
    }
    throw err;
  }
}
