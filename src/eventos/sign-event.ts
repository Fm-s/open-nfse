import type { A1Certificate } from '../certificate/types.js';
import { signXmlElement } from '../xml/sign.js';

/**
 * Assina um `<pedRegEvento>` per RTC v1.01 — mesmas regras da DPS:
 * RSA-SHA256 + exc-c14n + enveloped-signature, Reference URI = `#<infPedReg.Id>`.
 */
export function signPedRegEventoXml(xml: string, certificate: A1Certificate): string {
  return signXmlElement(xml, certificate, {
    rootElementName: 'pedRegEvento',
    signedElementName: 'infPedReg',
  });
}
