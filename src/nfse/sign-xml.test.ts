import { DOMParser } from '@xmldom/xmldom';
import forge from 'node-forge';
import { beforeAll, describe, expect, it } from 'vitest';
import { SignedXml } from 'xml-crypto';
import type { A1Certificate } from '../certificate/types.js';
import { InvalidXmlError } from '../errors/validation.js';
import { buildDpsXml } from './build-xml.js';
import type { DPS, InfDPS } from './domain.js';
import { DpsAlreadySignedError, signDpsXml } from './sign-xml.js';
import { validateDpsXml } from './validate-xml.js';

function makeSelfSignedCert(): A1Certificate {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: 'test-signer' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
    issuedOn: cert.validity.notBefore,
    expiresOn: cert.validity.notAfter,
    subject: 'CN=test-signer',
  };
}

function minimalDps(): DPS {
  const infDPS: InfDPS = {
    Id: 'DPS211130010057475300010000001000000000000001',
    tpAmb: '2' as InfDPS['tpAmb'],
    dhEmi: new Date('2026-04-17T14:30:00Z'),
    verAplic: 'test-1.0.0',
    serie: '1',
    nDPS: '1',
    dCompet: new Date('2026-04-17T00:00:00Z'),
    tpEmit: '1' as InfDPS['tpEmit'],
    cLocEmi: '2111300',
    prest: {
      identificador: { CNPJ: '00574753000100' },
      regTrib: { opSimpNac: '1' as never, regEspTrib: '0' as never },
    },
    serv: {
      locPrest: { cLocPrestacao: '2111300' },
      cServ: { cTribNac: '250101', cNBS: '123456789', xDescServ: 'Serviço de teste' },
    },
    valores: {
      vServPrest: { vServ: 100 },
      trib: {
        tribMun: { tribISSQN: '1' as never, tpRetISSQN: '1' as never },
        totTrib: { indTotTrib: '0' as never },
      },
    },
  };
  return { versao: '1.01', infDPS };
}

describe('signDpsXml', () => {
  let certificate: A1Certificate;
  let unsignedXml: string;

  beforeAll(() => {
    certificate = makeSelfSignedCert();
    unsignedXml = buildDpsXml(minimalDps());
  });

  it('appends a <Signature> element inside <DPS> after <infDPS>', () => {
    const signed = signDpsXml(unsignedXml, certificate);
    expect(signed).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    expect(signed.indexOf('</infDPS>')).toBeLessThan(signed.indexOf('<Signature'));
    expect(signed.indexOf('<Signature')).toBeLessThan(signed.indexOf('</DPS>'));
  });

  it('uses RSA-SHA256, exc-c14n, and SHA-256 algorithms', () => {
    const signed = signDpsXml(unsignedXml, certificate);
    expect(signed).toContain(
      '<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>',
    );
    expect(signed).toContain(
      '<CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>',
    );
    expect(signed).toContain('<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>');
  });

  it('declares enveloped-signature and exc-c14n transforms on the Reference', () => {
    const signed = signDpsXml(unsignedXml, certificate);
    expect(signed).toContain(
      '<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
    );
    expect(signed).toContain('<Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>');
  });

  it('sets Reference URI to "#" + infDPS Id', () => {
    const signed = signDpsXml(unsignedXml, certificate);
    expect(signed).toContain('<Reference URI="#DPS211130010057475300010000001000000000000001">');
  });

  it('embeds the signing certificate in KeyInfo/X509Data/X509Certificate', () => {
    const signed = signDpsXml(unsignedXml, certificate);
    expect(signed).toMatch(
      /<KeyInfo><X509Data><X509Certificate>[A-Za-z0-9+/=]+<\/X509Certificate><\/X509Data><\/KeyInfo>/,
    );
  });

  it('produces a signature that verifies against the signer certificate', () => {
    const signed = signDpsXml(unsignedXml, certificate);
    const doc = new DOMParser().parseFromString(signed, 'text/xml');
    const sigEl = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
    expect(sigEl).toBeDefined();
    const verifier = new SignedXml({ publicCert: certificate.certPem });
    verifier.loadSignature(sigEl as unknown as Node);
    expect(verifier.checkSignature(signed)).toBe(true);
  });

  it('fails verification when the signed payload is tampered with', () => {
    const signed = signDpsXml(unsignedXml, certificate);
    const tampered = signed.replace('<vServ>100</vServ>', '<vServ>999</vServ>');
    const doc = new DOMParser().parseFromString(tampered, 'text/xml');
    const sigEl = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
    const verifier = new SignedXml({ publicCert: certificate.certPem });
    verifier.loadSignature(sigEl as unknown as Node);
    expect(verifier.checkSignature(tampered)).toBe(false);
  });

  it('throws InvalidXmlError when infDPS lacks an Id attribute', () => {
    const bad = unsignedXml.replace(/<infDPS Id="[^"]+">/, '<infDPS>');
    expect(() => signDpsXml(bad, certificate)).toThrow(InvalidXmlError);
  });

  it('throws DpsAlreadySignedError when the XML already contains a Signature', () => {
    const alreadySigned = signDpsXml(unsignedXml, certificate);
    expect(() => signDpsXml(alreadySigned, certificate)).toThrow(DpsAlreadySignedError);
  });

  it('signed DPS validates against the RTC v1.01 XSD', async () => {
    const signed = signDpsXml(unsignedXml, certificate);
    await expect(validateDpsXml(signed)).resolves.toBeUndefined();
  });
});
