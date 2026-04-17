import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TipoAmbiente } from '../ambiente.js';
import { InvalidChaveAcessoError } from '../errors/validation.js';
import { HttpClient } from '../http/client.js';
import { gzipBase64Encode } from '../http/encoding.js';
import { fetchByChave } from './fetch-by-chave.js';

const CHAVE_VALIDA = '21113002200574753000100000000000146726037032711025';
const XML_MOCK = readFileSync(
  join(__dirname, '..', '..', 'specs', 'samples', `${CHAVE_VALIDA}.xml`),
  'utf-8',
);

describe('fetchByChave', () => {
  const baseUrl = 'https://sefin.example.test/SefinNacional';
  let mockAgent: MockAgent;
  let httpClient: HttpClient;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    httpClient = new HttpClient({ baseUrl, dispatcher: mockAgent });
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  it('rejects a chaveAcesso that is not 50 digits', async () => {
    await expect(fetchByChave(httpClient, 'abc')).rejects.toBeInstanceOf(InvalidChaveAcessoError);
    await expect(fetchByChave(httpClient, '1'.repeat(49))).rejects.toBeInstanceOf(
      InvalidChaveAcessoError,
    );
    await expect(fetchByChave(httpClient, '1'.repeat(51))).rejects.toBeInstanceOf(
      InvalidChaveAcessoError,
    );
  });

  it('decodes the gzip+base64 XML, parses it, and normalizes the response', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_VALIDA}`, method: 'GET' })
      .reply(200, {
        tipoAmbiente: 2,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-16T18:42:05-03:00',
        chaveAcesso: CHAVE_VALIDA,
        nfseXmlGZipB64: gzipBase64Encode(XML_MOCK),
      });

    const result = await fetchByChave(httpClient, CHAVE_VALIDA);
    expect(result.chaveAcesso).toBe(CHAVE_VALIDA);
    expect(result.xmlNfse).toBe(XML_MOCK);
    expect(result.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
    expect(result.versaoAplicativo).toBe('1.0.0');
    expect(result.dataHoraProcessamento).toBeInstanceOf(Date);
    expect(result.dataHoraProcessamento.toISOString()).toBe('2026-04-16T21:42:05.000Z');
    expect(result.nfse.infNFSe.chaveAcesso).toBe(CHAVE_VALIDA);
    expect(result.nfse.infNFSe.emit.xNome).toBe('VOGA LTDA');
  });

  it('maps tipoAmbiente=1 to TipoAmbiente.Producao', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_VALIDA}`, method: 'GET' })
      .reply(200, {
        tipoAmbiente: 1,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-16T18:42:05-03:00',
        chaveAcesso: CHAVE_VALIDA,
        nfseXmlGZipB64: gzipBase64Encode(XML_MOCK),
      });

    const result = await fetchByChave(httpClient, CHAVE_VALIDA);
    expect(result.tipoAmbiente).toBe(TipoAmbiente.Producao);
  });
});
