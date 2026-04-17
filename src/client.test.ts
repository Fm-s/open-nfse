import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ambiente, TipoAmbiente } from './ambiente.js';
import { NfseClient } from './client.js';
import { StatusDistribuicao } from './dfe/types.js';
import { gzipBase64Encode } from './http/encoding.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';
const XML_SAMPLE = readFileSync(join(__dirname, '..', 'specs', 'samples', `${CHAVE}.xml`), 'utf-8');

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

describe('NfseClient', () => {
  const senha = 'senha';
  let pfx: Buffer;
  let mockAgent: MockAgent;

  beforeEach(() => {
    pfx = gerarPfxTeste(senha);
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  it('routes fetchByChave to the SEFIN Nacional host', async () => {
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE}`, method: 'GET' })
      .reply(200, {
        tipoAmbiente: 2,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-16T12:00:00-03:00',
        chaveAcesso: CHAVE,
        nfseXmlGZipB64: gzipBase64Encode(XML_SAMPLE),
      });

    const client = new NfseClient({
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    const result = await client.fetchByChave(CHAVE);
    expect(result.chaveAcesso).toBe(CHAVE);
    expect(result.xmlNfse).toBe(XML_SAMPLE);
    expect(result.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
  });

  it('routes fetchByNsu to the ADN Contribuintes host', async () => {
    mockAgent
      .get('https://adn.producaorestrita.nfse.gov.br')
      .intercept({ path: '/contribuintes/DFe/0', method: 'GET' })
      .reply(200, {
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
        TipoAmbiente: 'HOMOLOGACAO',
        VersaoAplicativo: '1.0.0',
        DataHoraProcessamento: '2026-04-16T12:00:00-03:00',
      });

    const client = new NfseClient({
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    const result = await client.fetchByNsu({ ultimoNsu: 0 });
    expect(result.status).toBe(StatusDistribuicao.NenhumDocumento);
  });

  it('forwards cnpjConsulta and lote to the NSU endpoint', async () => {
    mockAgent
      .get('https://adn.producaorestrita.nfse.gov.br')
      .intercept({
        path: '/contribuintes/DFe/42?cnpjConsulta=12345678000190&lote=true',
        method: 'GET',
      })
      .reply(200, {
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
        TipoAmbiente: 'HOMOLOGACAO',
        VersaoAplicativo: '1.0.0',
        DataHoraProcessamento: '2026-04-16T12:00:00-03:00',
      });

    const client = new NfseClient({
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    const result = await client.fetchByNsu({
      ultimoNsu: 42,
      cnpjConsulta: '12345678000190',
      lote: true,
    });
    expect(result.status).toBe(StatusDistribuicao.NenhumDocumento);
  });

  it('uses Produção URLs when ambiente is Producao', async () => {
    mockAgent
      .get('https://sefin.nfse.gov.br')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE}`, method: 'GET' })
      .reply(200, {
        tipoAmbiente: 1,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-16T12:00:00-03:00',
        chaveAcesso: CHAVE,
        nfseXmlGZipB64: gzipBase64Encode(XML_SAMPLE),
      });

    const client = new NfseClient({
      ambiente: Ambiente.Producao,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    const result = await client.fetchByChave(CHAVE);
    expect(result.tipoAmbiente).toBe(TipoAmbiente.Producao);
  });

  it('propagates the logger to the internal HttpClients', async () => {
    const events: string[] = [];
    const logger = {
      debug(message: string) {
        events.push(message);
      },
      info() {},
      warn() {},
      error() {},
    };

    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE}`, method: 'GET' })
      .reply(200, {
        tipoAmbiente: 2,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-16T12:00:00-03:00',
        chaveAcesso: CHAVE,
        nfseXmlGZipB64: gzipBase64Encode(XML_SAMPLE),
      });

    const client = new NfseClient({
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      logger,
    });

    await client.fetchByChave(CHAVE);
    expect(events).toContain('http.request');
    expect(events).toContain('http.response');
  });

  it('does not close an injected dispatcher on close()', async () => {
    const client = new NfseClient({
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE}`, method: 'GET' })
      .reply(200, {
        tipoAmbiente: 2,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-16T12:00:00-03:00',
        chaveAcesso: CHAVE,
        nfseXmlGZipB64: gzipBase64Encode(XML_SAMPLE),
      });

    await client.fetchByChave(CHAVE);
    await client.close();
    // mockAgent should still be usable after client.close()
    expect(() => mockAgent.assertNoPendingInterceptors()).not.toThrow();
  });
});
