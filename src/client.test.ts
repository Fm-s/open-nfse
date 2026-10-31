import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ambiente, TipoAmbiente } from './ambiente.js';
import type { CepInfo, CepValidator } from './cep/types.js';
import type { CertificateProvider } from './certificate/types.js';
import { ClientClosedError, NfseClient, type NfseClientConfig } from './client.js';
import { StatusDistribuicao } from './dfe/types.js';
import { ForbiddenError, NotFoundError, ServerError } from './errors/http.js';
import { ReceitaRejectionError, UnreadableAuthorizedNfseError } from './errors/receita.js';
import {
  InvalidChaveAcessoError,
  InvalidLayoutError,
  LayoutMismatchError,
} from './errors/validation.js';
import { gzipBase64DecodeToText, gzipBase64Encode } from './http/encoding.js';
import type { Logger } from './logging.js';
import { dpsNt009Completa } from './nfse/__fixtures__/dps-nt009.js';
import { buildDps } from './nfse/build-dps.js';
import { buildDpsXml } from './nfse/build-xml.js';
import { createInMemoryDpsCounter } from './nfse/dps-counter.js';
import {
  JustificativaSubstituicao,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from './nfse/enums.js';
import { parseNfseXml } from './nfse/parse-xml.js';
import { validateDpsXml } from './nfse/validate-xml.js';
import { createInMemoryRetryStore } from './retry/store.js';

const CHAVE = '21113002200574753000100000000000146726037032711025';
const XML_SAMPLE = readFileSync(join(__dirname, '..', 'specs', 'samples', `${CHAVE}.xml`), 'utf-8');
const NFSE_NT009_XML = readFileSync(
  join(__dirname, 'nfse', '__fixtures__', 'nfse-nt009-sintetica.xml'),
  'utf-8',
);

/** Corpo 201 do `POST /nfse` com a NFS-e `xml`. */
function successBody(xml: string, idDps = 'DPS211130010057475300010000001000000000000001') {
  return {
    tipoAmbiente: 2,
    versaoAplicativo: 'SefinNacional_1.7.0',
    dataHoraProcessamento: '2026-12-01T12:00:00-03:00',
    idDps,
    chaveAcesso: CHAVE,
    nfseXmlGZipB64: gzipBase64Encode(xml),
  };
}

const cepStub: CepValidator = { validate: async (cep) => ({ cep }) as CepInfo };

/** Params nt004 de `emitir` sem `nDPS` (o counter fornece), sem CEP. */
const paramsEmitir = {
  emitente: {
    cnpj: '00574753000100',
    codMunicipio: '2111300',
    regime: {
      opSimpNac: OpcaoSimplesNacional.NaoOptante,
      regEspTrib: RegimeEspecialTributacao.Nenhum,
    },
  },
  serie: '1',
  servico: { cTribNac: '250101', cNBS: '123456789', descricao: 'Teste' },
  valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
  skipCepValidation: true,
} as const;

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
      layout: 'nt004',
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
      layout: 'nt004',
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
      layout: 'nt004',
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
      layout: 'nt004',
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
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      logger,
    });

    await client.fetchByChave(CHAVE);
    expect(events).toContain('http.request');
    expect(events).toContain('http.response');
  });

  it('emitir: signs DPS, POSTs to /nfse and returns the parsed NFS-e on success', async () => {
    const minimalDps = {
      layout: 'nt004',
      versao: '1.01',
      infDPS: {
        Id: 'DPS211130010057475300010000001000000000000001',
        tpAmb: '2',
        dhEmi: new Date('2026-04-17T14:30:00Z'),
        verAplic: 'test-1.0.0',
        serie: '1',
        nDPS: '1',
        dCompet: new Date('2026-04-17T00:00:00Z'),
        tpEmit: '1',
        cLocEmi: '2111300',
        prest: {
          identificador: { CNPJ: '00574753000100' },
          regTrib: { opSimpNac: '1', regEspTrib: '0' },
        },
        serv: {
          locPrest: { cLocPrestacao: '2111300' },
          cServ: { cTribNac: '250101', cNBS: '123456789', xDescServ: 'Serviço de teste' },
        },
        valores: {
          vServPrest: { vServ: 100 },
          trib: {
            tribMun: { tribISSQN: '1', tpRetISSQN: '1' },
            totTrib: { indTotTrib: '0' },
          },
        },
      },
    } as Parameters<NfseClient<'nt004'>['emitirDpsPronta']>[0];

    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, {
        tipoAmbiente: 2,
        versaoAplicativo: 'SefinNacional_1.6.0',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        idDps: 'DPS211130010057475300010000001000000000000001',
        chaveAcesso: CHAVE,
        nfseXmlGZipB64: gzipBase64Encode(XML_SAMPLE),
      });

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    const result = await client.emitirDpsPronta(minimalDps);
    expect(result.chaveAcesso).toBe(CHAVE);
    expect(result.idDps).toBe('DPS211130010057475300010000001000000000000001');
    expect(result.nfse.infNFSe.chaveAcesso).toBe(CHAVE);
    expect(result.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
  });

  it('emitir({dryRun:true}) returns the signed DPS XML without hitting the network', async () => {
    const minimalDps = {
      layout: 'nt004',
      versao: '1.01',
      infDPS: {
        Id: 'DPS211130010057475300010000001000000000000001',
        tpAmb: '2',
        dhEmi: new Date('2026-04-17T14:30:00Z'),
        verAplic: 'test-1.0.0',
        serie: '1',
        nDPS: '1',
        dCompet: new Date('2026-04-17T00:00:00Z'),
        tpEmit: '1',
        cLocEmi: '2111300',
        prest: {
          identificador: { CNPJ: '00574753000100' },
          regTrib: { opSimpNac: '1', regEspTrib: '0' },
        },
        serv: {
          locPrest: { cLocPrestacao: '2111300' },
          cServ: { cTribNac: '250101', cNBS: '123456789', xDescServ: 'Serviço de teste' },
        },
        valores: {
          vServPrest: { vServ: 100 },
          trib: {
            tribMun: { tribISSQN: '1', tpRetISSQN: '1' },
            totTrib: { indTotTrib: '0' },
          },
        },
      },
    } as Parameters<NfseClient<'nt004'>['emitirDpsPronta']>[0];

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    const result = await client.emitirDpsPronta(minimalDps, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.xmlDpsAssinado).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
    );
  });

  it('does not close an injected dispatcher on close()', async () => {
    const client = new NfseClient({
      layout: 'nt004',
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

  it('close() is idempotent — second call is a no-op', async () => {
    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    await client.close();
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('rejects any call after close() with ClientClosedError', async () => {
    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    await client.close();
    await expect(client.fetchByChave(CHAVE)).rejects.toBeInstanceOf(ClientClosedError);
  });

  it('ensureState is race-safe — concurrent first calls share one certificate load', async () => {
    // Dispara três chamadas simultaneamente no primeiro uso do cliente — todas
    // devem enxergar o mesmo `ClientState`, sem `provider.load()` rodando duas
    // vezes nem Agent leaks.
    for (const _ of [0, 1, 2]) {
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
    }

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    const [a, b, c] = await Promise.all([
      client.fetchByChave(CHAVE),
      client.fetchByChave(CHAVE),
      client.fetchByChave(CHAVE),
    ]);
    expect(a.chaveAcesso).toBe(CHAVE);
    expect(b.chaveAcesso).toBe(CHAVE);
    expect(c.chaveAcesso).toBe(CHAVE);
  });

  it('consultarDanfse rejects chaves fora do pattern sem tocar a rede', async () => {
    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    await expect(client.consultarDanfse('nao-e-chave')).rejects.toBeInstanceOf(
      InvalidChaveAcessoError,
    );
    // encoded traversal attempt também é barrado
    await expect(client.consultarDanfse('../admin')).rejects.toBeInstanceOf(
      InvalidChaveAcessoError,
    );
  });

  it("gerarDanfse('auto') faz fallback para local em 5xx transiente", async () => {
    mockAgent
      .get('https://adn.producaorestrita.nfse.gov.br')
      .intercept({ path: `/danfse/${CHAVE}`, method: 'GET' })
      .reply(503, 'service unavailable');

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    const nfse = parseNfseXml(XML_SAMPLE);

    const pdf = await client.gerarDanfse(nfse, { strategy: 'auto' });
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.slice(0, 5).toString('utf-8')).toBe('%PDF-');
  });

  it('fetchDpsStatus retorna chaveAcesso quando a NFS-e existe', async () => {
    const idDps = 'DPS211130010057475300010000001000000000000001';
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: `/SefinNacional/dps/${idDps}`, method: 'GET' })
      .reply(200, {
        tipoAmbiente: 2,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        idDps,
        chaveAcesso: CHAVE,
      });

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });

    const r = await client.fetchDpsStatus(idDps);
    expect(r.chaveAcesso).toBe(CHAVE);
    expect(r.idDps).toBe(idDps);
  });

  it('fetchDpsStatus rejeita idDps malformado sem tocar a rede', async () => {
    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    await expect(client.fetchDpsStatus('not-an-id')).rejects.toThrow(/Id do DPS inválido/);
  });

  it('gerarDanfse sem strategy usa o renderer local (NT 008) — não toca a rede', async () => {
    // Se o cliente tocasse a rede, receberia este marker em vez do PDF local.
    mockAgent
      .get('https://adn.producaorestrita.nfse.gov.br')
      .intercept({ path: `/danfse/${CHAVE}`, method: 'GET' })
      .reply(200, '%PDF-ONLINE-MARKER', {
        headers: { 'content-type': 'application/pdf' },
      });

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    const nfse = parseNfseXml(XML_SAMPLE);

    const pdf = await client.gerarDanfse(nfse);
    expect(pdf.slice(0, 5).toString('utf-8')).toBe('%PDF-');
    expect(pdf.toString('latin1')).not.toContain('ONLINE-MARKER');
  });

  it("gerarDanfse 'online' e consultarDanfse logam deprecation da NT 008", async () => {
    mockAgent
      .get('https://adn.producaorestrita.nfse.gov.br')
      .intercept({ path: `/danfse/${CHAVE}`, method: 'GET' })
      .reply(200, '%PDF-ONLINE-MARKER', {
        headers: { 'content-type': 'application/pdf' },
      })
      .times(2);

    const warns: string[] = [];
    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      logger: {
        debug: () => {},
        info: () => {},
        warn: (msg) => warns.push(msg),
        error: () => {},
      },
    });
    const nfse = parseNfseXml(XML_SAMPLE);

    await client.gerarDanfse(nfse, { strategy: 'online' });
    await client.consultarDanfse(CHAVE);
    expect(warns.filter((m) => m === 'danfse.online.deprecated')).toHaveLength(2);
  });

  it("gerarDanfse('auto') NÃO mascara ForbiddenError — propaga", async () => {
    mockAgent
      .get('https://adn.producaorestrita.nfse.gov.br')
      .intercept({ path: `/danfse/${CHAVE}`, method: 'GET' })
      .reply(403, 'cnpj sem acesso');

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    const nfse = parseNfseXml(XML_SAMPLE);

    await expect(client.gerarDanfse(nfse, { strategy: 'auto' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('replayPendingEvents skips entries whose notBefore is in the future', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));

    const store = createInMemoryRetryStore();
    await store.save({
      id: 'emission:test-id',
      kind: 'emission',
      idDps: 'test-id',
      emitenteCnpj: '00000000000000',
      serie: '00001',
      nDPS: '1',
      xmlAssinado: '<xml/>',
      firstAttemptAt: new Date('2026-05-12T09:59:00Z'),
      lastAttemptAt: new Date('2026-05-12T09:59:00Z'),
      notBefore: new Date('2026-05-12T10:05:00Z'), // 5 min in the future
      lastError: { message: '429', errorName: 'TooManyRequestsError', transient: true },
    });

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: store,
    });

    const results = await client.replayPendingEvents();
    expect(results).toEqual([]);
    expect(await store.list()).toHaveLength(1); // entry stays in store

    vi.useRealTimers();
    await client.close();
  });

  it('replayPendingEvents replays entries whose notBefore is past (success → evict)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));

    // mock a successful re-POST on /SefinNacional/nfse
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, {
        tipoAmbiente: 2,
        versaoAplicativo: 'v',
        dataHoraProcessamento: '2026-05-12T10:00:00-03:00',
        idDps: 'test-id-2',
        chaveAcesso: CHAVE,
        nfseXmlGZipB64: gzipBase64Encode(XML_SAMPLE),
      });

    const store = createInMemoryRetryStore();
    await store.save({
      id: 'emission:test-id-2',
      kind: 'emission',
      idDps: 'test-id-2',
      emitenteCnpj: '00000000000000',
      serie: '00001',
      nDPS: '1',
      xmlAssinado:
        '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="test-id-2"/></DPS>',
      firstAttemptAt: new Date('2026-05-12T09:00:00Z'),
      lastAttemptAt: new Date('2026-05-12T09:00:00Z'),
      notBefore: new Date('2026-05-12T09:59:00Z'), // 1 min ago — eligible
      lastError: { message: '429', errorName: 'TooManyRequestsError', transient: true },
    });

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: store,
    });

    const results = await client.replayPendingEvents();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('success_emission');
    expect(await store.list()).toHaveLength(0); // evicted after success

    vi.useRealTimers();
    await client.close();
  });

  it('replayPendingEvents on 429: refreshes notBefore and lastAttemptAt; entry stays', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));

    // mock another 429 on the replay POST — server still backing off
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(429, '', { headers: { 'Retry-After': '120' } });

    const ORIG_FIRST = new Date('2026-05-12T09:00:00Z');
    const ORIG_LAST = new Date('2026-05-12T09:00:00Z');
    const ORIG_NOT_BEFORE = new Date('2026-05-12T09:59:00Z'); // 1 min ago — eligible
    const store = createInMemoryRetryStore();
    await store.save({
      id: 'emission:test-replay-429',
      kind: 'emission',
      idDps: 'test-replay-429',
      emitenteCnpj: '00000000000000',
      serie: '00001',
      nDPS: '1',
      xmlAssinado:
        '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="test-replay-429"/></DPS>',
      firstAttemptAt: ORIG_FIRST,
      lastAttemptAt: ORIG_LAST,
      notBefore: ORIG_NOT_BEFORE,
      attempts: 1,
      lastError: { message: '429', errorName: 'TooManyRequestsError', transient: true },
    });

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: store,
    });

    const results = await client.replayPendingEvents();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('still_pending');

    const stored = await store.list();
    expect(stored).toHaveLength(1);
    const refreshed = stored[0];
    expect(refreshed?.notBefore).toEqual(new Date('2026-05-12T10:02:00Z')); // now + 120s
    expect(refreshed?.lastAttemptAt).toEqual(new Date('2026-05-12T10:00:00Z')); // refreshed
    expect(refreshed?.firstAttemptAt).toEqual(ORIG_FIRST); // preserved
    expect(refreshed?.attempts).toBe(2); // incremented

    vi.useRealTimers();
    await client.close();
  });

  it('replayPendingEvents on transient without Retry-After: refreshes lastAttemptAt, preserves prior notBefore', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));

    // Network-level failure on the replay — HttpClient wraps as NetworkError.
    // Policy returns undefined (no Retry-After signal), so notBefore stays
    // as the prior value while lastAttemptAt is refreshed.
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .replyWithError(new Error('socket closed'));

    const ORIG_FIRST = new Date('2026-05-12T09:00:00Z');
    const ORIG_LAST = new Date('2026-05-12T09:00:00Z');
    const ORIG_NOT_BEFORE = new Date('2026-05-12T09:59:00Z');
    const store = createInMemoryRetryStore();
    await store.save({
      id: 'emission:test-replay-net',
      kind: 'emission',
      idDps: 'test-replay-net',
      emitenteCnpj: '00000000000000',
      serie: '00001',
      nDPS: '1',
      xmlAssinado:
        '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="test-replay-net"/></DPS>',
      firstAttemptAt: ORIG_FIRST,
      lastAttemptAt: ORIG_LAST,
      notBefore: ORIG_NOT_BEFORE,
      lastError: { message: 'socket closed', errorName: 'NetworkError', transient: true },
    });

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: store,
    });

    const results = await client.replayPendingEvents();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('still_pending');

    const stored = await store.list();
    expect(stored).toHaveLength(1);
    const refreshed = stored[0];
    expect(refreshed?.lastAttemptAt).toEqual(new Date('2026-05-12T10:00:00Z')); // refreshed
    expect(refreshed?.notBefore).toEqual(ORIG_NOT_BEFORE); // preserved (policy returned undefined)
    expect(refreshed?.firstAttemptAt).toEqual(ORIG_FIRST); // preserved

    vi.useRealTimers();
    await client.close();
  });

  it('replayPendingEvents passes RetryContext (attempt count + firstAttemptAt) to the policy', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));

    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(429, '', { headers: { 'Retry-After': '10' } });

    const ORIG_FIRST = new Date('2026-05-12T09:00:00Z');
    const store = createInMemoryRetryStore();
    await store.save({
      id: 'emission:test-ctx',
      kind: 'emission',
      idDps: 'test-ctx',
      emitenteCnpj: '00000000000000',
      serie: '00001',
      nDPS: '1',
      xmlAssinado: '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="test-ctx"/></DPS>',
      firstAttemptAt: ORIG_FIRST,
      lastAttemptAt: ORIG_FIRST,
      notBefore: new Date('2026-05-12T09:59:00Z'),
      attempts: 4, // 4 prior attempts; this replay is the 5th
      lastError: { message: '429', errorName: 'TooManyRequestsError', transient: true },
    });

    const seenContexts: Array<{ attempt: number; firstAttemptAt: Date }> = [];
    const trackingPolicy = {
      computeNotBefore: (
        _err: Error,
        now: Date,
        context?: { attempt: number; firstAttemptAt: Date },
      ): Date | undefined => {
        if (context) seenContexts.push(context);
        return new Date(now.getTime() + 1_000);
      },
    };

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: store,
      retryPolicy: trackingPolicy,
    });

    await client.replayPendingEvents();

    expect(seenContexts).toHaveLength(1);
    expect(seenContexts[0]).toEqual({ attempt: 5, firstAttemptAt: ORIG_FIRST });

    const refreshed = (await store.list())[0];
    expect(refreshed?.attempts).toBe(5);

    vi.useRealTimers();
    await client.close();
  });

  it('replayPendingEvents survives a custom RetryPolicy that throws (safe wrapping)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-12T10:00:00Z'));

    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(429, '', { headers: { 'Retry-After': '10' } });

    const store = createInMemoryRetryStore();
    await store.save({
      id: 'emission:test-throws',
      kind: 'emission',
      idDps: 'test-throws',
      emitenteCnpj: '00000000000000',
      serie: '00001',
      nDPS: '1',
      xmlAssinado:
        '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="test-throws"/></DPS>',
      firstAttemptAt: new Date('2026-05-12T09:00:00Z'),
      lastAttemptAt: new Date('2026-05-12T09:00:00Z'),
      notBefore: new Date('2026-05-12T09:59:00Z'),
      attempts: 1,
      lastError: { message: '429', errorName: 'TooManyRequestsError', transient: true },
    });

    const explodingPolicy = {
      computeNotBefore: () => {
        throw new Error('bug interno na policy');
      },
    };

    const warnings: Array<{ message: string; context?: Record<string, unknown> }> = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: string, context?: Record<string, unknown>) => {
        warnings.push({ message, ...(context ? { context } : {}) });
      },
      error: () => {},
    };

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: store,
      retryPolicy: explodingPolicy,
      logger,
    });

    // Must not throw — the safe wrapper catches and degrades to notBefore=undefined.
    const results = await client.replayPendingEvents();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('still_pending');

    // A warning was emitted.
    expect(warnings.some((w) => /retryPolicy.*threw/.test(w.message))).toBe(true);

    vi.useRealTimers();
    await client.close();
  });

  it('replayPendingEvents re-signs legacy unsigned event XML (rescue for v0.7.x data)', async () => {
    // An entry persisted by 0.7.2/0.7.3 transient cancellation path: xmlAssinado
    // is actually the UNSIGNED pedido. Without rescue, replay would re-POST
    // with `xmlJaAssinado: true`, SEFIN rejects for missing signature, and the
    // entry is deleted as failed_permanent → silent loss of cancellation.
    const UNSIGNED_PEDIDO =
      '<?xml version="1.0"?><pedRegEvento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infPedReg Id="PRE21113001..."></infPedReg></pedRegEvento>';

    let capturedBody: string | undefined;
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE}/eventos`, method: 'POST' })
      .reply((opts) => {
        capturedBody = opts.body as string;
        return {
          statusCode: 200,
          data: {
            tipoAmbiente: 2,
            versaoAplicativo: 'v',
            dataHoraProcessamento: '2026-05-12T10:00:00-03:00',
            eventoXmlGZipB64: gzipBase64Encode(
              `<?xml version="1.0"?><evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento Id="EVT"><verAplic>v</verAplic><ambGer>2</ambGer><nSeqEvento>1</nSeqEvento><dhProc>2026-05-12T10:00:00Z</dhProc><nDFSe>1</nDFSe><pedRegEvento versao="1.01"><infPedReg Id="PRE"><tpAmb>2</tpAmb><verAplic>v</verAplic><dhEvento>2026-05-12T10:00:00Z</dhEvento><CNPJAutor>00000000000000</CNPJAutor><chNFSe>${CHAVE}</chNFSe><e101101><xDesc>x</xDesc><cMotivo>1</cMotivo><xMotivo>x</xMotivo></e101101></infPedReg></pedRegEvento></infEvento><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI="#EVT"><DigestValue>x</DigestValue></Reference></SignedInfo><SignatureValue>x</SignatureValue><KeyInfo><X509Data><X509Certificate>c</X509Certificate></X509Data></KeyInfo></Signature></evento>`,
            ),
          },
        };
      });

    const warnings: Array<{ message: string }> = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: string) => warnings.push({ message }),
      error: () => {},
    };

    const store = createInMemoryRetryStore();
    await store.save({
      id: `${CHAVE}:101101`,
      kind: 'cancelamento_simples',
      chaveNfse: CHAVE,
      tipoEvento: '101101',
      cMotivo: '1',
      xmlAssinado: UNSIGNED_PEDIDO, // legacy — no signature
      firstAttemptAt: new Date('2026-05-12T09:00:00Z'),
      lastAttemptAt: new Date('2026-05-12T09:00:00Z'),
      lastError: { message: '500', errorName: 'ServerError', transient: true },
    });

    const client = new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: store,
      logger,
    });

    const results = await client.replayPendingEvents();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('success');
    expect(await store.list()).toHaveLength(0); // evicted after rescue + success

    // Verify the body actually sent was signed (rescue applied).
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody as string) as {
      pedidoRegistroEventoXmlGZipB64: string;
    };
    const decodedXml = Buffer.from(parsed.pedidoRegistroEventoXmlGZipB64, 'base64');
    // gzip-decode for inspection
    const zlib = await import('node:zlib');
    const xmlBytes = zlib.gunzipSync(decodedXml).toString('utf-8');
    expect(xmlBytes).toContain('<SignatureValue>');

    // And a warning was emitted explaining the rescue.
    expect(warnings.some((w) => /sem XMLDSig.*re-assinando/.test(w.message))).toBe(true);

    await client.close();
  });
});

describe('NfseClient — layout', () => {
  const senha = 'senha';
  let pfx: Buffer;
  let mockAgent: MockAgent;

  beforeAll(() => {
    pfx = gerarPfxTeste(senha);
  });
  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
  });
  afterEach(async () => {
    await mockAgent.close();
  });

  const baseConfig = () => ({
    ambiente: Ambiente.ProducaoRestrita,
    certificado: { pfx, password: senha },
    dispatcher: mockAgent,
  });

  const paramsSemLayout = {
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.NaoOptante,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    servico: { cTribNac: '250101', cNBS: '123456789', descricao: 'Teste' },
    valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
    skipCepValidation: true,
  } as const;
  const paramsBase = { ...paramsSemLayout, nDPS: '1' } as const;

  it.each([undefined, 'NT009', 'nt010'])(
    'construtor rejeita layout %s com InvalidLayoutError',
    (layout) => {
      expect(() => new NfseClient({ ...baseConfig(), layout } as never)).toThrow(
        InvalidLayoutError,
      );
    },
  );

  it('expõe o layout configurado', () => {
    expect(new NfseClient({ ...baseConfig(), layout: 'nt009' }).layout).toBe('nt009');
  });

  it('emitirDpsPronta com DPS de outro layout lança LayoutMismatchError sem consumir contador nem enviar', async () => {
    const counter = createInMemoryDpsCounter();
    const next = vi.spyOn(counter, 'next');
    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    const client = new NfseClient({ ...baseConfig(), layout: 'nt009', dpsCounter: counter });
    const dpsNt004 = buildDps({ ...paramsBase, layout: 'nt004' });
    const err = await client.emitirDpsPronta(dpsNt004 as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LayoutMismatchError);
    expect(err).toMatchObject({ expected: 'nt009', received: 'nt004' });
    expect(next).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    await client.close();
  });

  it('emitirEmLote com um item de outro layout rejeita o lote inteiro antes do primeiro envio', async () => {
    const counter = createInMemoryDpsCounter();
    const next = vi.spyOn(counter, 'next');
    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    const client = new NfseClient({ ...baseConfig(), layout: 'nt009', dpsCounter: counter });
    const lote = [
      buildDps({ ...paramsBase, layout: 'nt009' }),
      buildDps({ ...paramsBase, nDPS: '2', layout: 'nt004' }),
    ];
    await expect(client.emitirEmLote(lote as never)).rejects.toBeInstanceOf(LayoutMismatchError);
    expect(next).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    await client.close();
  });

  it('substituir com novaDps de outro layout lança LayoutMismatchError sem enviar', async () => {
    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    const client = new NfseClient({ ...baseConfig(), layout: 'nt004' });
    await expect(
      client.substituir({
        chaveOriginal: CHAVE,
        novaDps: buildDps({ ...paramsBase, layout: 'nt009' }) as never,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Substituição por erro de digitação',
      }),
    ).rejects.toBeInstanceOf(LayoutMismatchError);
    expect(dispatch).not.toHaveBeenCalled();
    await client.close();
  });

  it('replay aceita PendingEmission legado sem campo layout', async () => {
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, {
        tipoAmbiente: 2,
        versaoAplicativo: 'v',
        dataHoraProcessamento: '2026-05-12T10:00:00-03:00',
        idDps: 'legacy-id',
        chaveAcesso: CHAVE,
        nfseXmlGZipB64: gzipBase64Encode(XML_SAMPLE),
      });
    const store = createInMemoryRetryStore();
    // Formato 0.11: sem `layout`.
    await store.save({
      id: 'emission:legacy-id',
      kind: 'emission',
      idDps: 'legacy-id',
      emitenteCnpj: '00574753000100',
      serie: '1',
      nDPS: '1',
      xmlAssinado:
        '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="legacy-id"/></DPS>',
      firstAttemptAt: new Date('2026-05-12T09:00:00Z'),
      lastAttemptAt: new Date('2026-05-12T09:00:00Z'),
      lastError: { message: '500', errorName: 'ServerError', transient: true },
    });
    const client = new NfseClient({ ...baseConfig(), layout: 'nt009', retryStore: store });
    const results = await client.replayPendingEvents();
    expect(results.map((r) => r.status)).toEqual(['success_emission']);
    expect(await store.list()).toHaveLength(0);
    await client.close();
  });

  it('emitir persiste layout no PendingEmission em falha transiente', async () => {
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(503, {});
    const store = createInMemoryRetryStore();
    const client = new NfseClient({
      ...baseConfig(),
      layout: 'nt009',
      retryStore: store,
      dpsCounter: createInMemoryDpsCounter(),
    });
    const r = await client.emitir(paramsSemLayout);
    expect(r.status).toBe('retry_pending');
    const [entry] = await store.list();
    expect(entry?.layout).toBe('nt009');
    await client.close();
  });

  it('DPS nt009 com campo do nt004 (vDedRed) é rejeitada com LayoutMismatchError e field', () => {
    const dpsNt009 = dpsNt009Completa();
    const dps = {
      ...dpsNt009,
      infDPS: {
        ...dpsNt009.infDPS,
        valores: { ...dpsNt009.infDPS.valores, vDedRed: { pDR: 1 } },
      },
    } as never;
    expect(() => buildDpsXml(dps)).toThrow(LayoutMismatchError);
    expect(() => buildDpsXml(dps)).toThrow(
      expect.objectContaining({ field: 'infDPS.valores.vDedRed' }),
    );
  });

  it('emitir no client nt009 produz DPS com finNFSe', async () => {
    const clientNt009 = new NfseClient({ ...baseConfig(), layout: 'nt009' });
    const r = await clientNt009.emitir({ ...paramsBase, dryRun: true });
    expect(r.xmlDpsAssinado).toContain('<finNFSe>0</finNFSe>');
    await clientNt009.close();
  });

  it('emitir no client nt004 não produz finNFSe', async () => {
    const clientNt004 = new NfseClient({ ...baseConfig(), layout: 'nt004' });
    const r = await clientNt004.emitir({ ...paramsBase, dryRun: true });
    expect(r.xmlDpsAssinado).not.toContain('finNFSe');
    await clientNt004.close();
  });

  it('emitir com layout divergente (chamador JS) lança LayoutMismatchError antes de carregar o certificado', async () => {
    let loads = 0;
    const certificado: CertificateProvider = {
      async load() {
        loads++;
        throw new Error('KMS fora do ar');
      },
    };
    const client = new NfseClient({ ...baseConfig(), certificado, layout: 'nt004' });
    await expect(
      client.emitir({ ...paramsBase, layout: 'nt009', dryRun: true } as never),
    ).rejects.toMatchObject({ name: 'LayoutMismatchError', expected: 'nt004', received: 'nt009' });
    // Input exclusivo do nt009 num cliente nt004 também falha antes do I/O do certificado.
    await expect(
      client.emitir({ ...paramsBase, ajusteBC: { issqn: { percentual: 10 } } } as never),
    ).rejects.toMatchObject({ name: 'LayoutMismatchError', field: 'ajusteBC' });
    expect(loads).toBe(0);
  });

  it('emitirDpsPronta e emitirEmLote num cliente nt009 enviam a DPS nt009 (XSD nt009) e devolvem NFS-e nt009', async () => {
    const enviados: string[] = [];
    for (let i = 0; i < 3; i++) {
      mockAgent
        .get('https://sefin.producaorestrita.nfse.gov.br')
        .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
        .reply((opts) => {
          const { dpsXmlGZipB64 } = JSON.parse(opts.body as string) as { dpsXmlGZipB64: string };
          enviados.push(gzipBase64DecodeToText(dpsXmlGZipB64));
          return { statusCode: 201, data: successBody(NFSE_NT009_XML) };
        });
    }
    const client = new NfseClient({ ...baseConfig(), layout: 'nt009', cepValidator: cepStub });
    const r = await client.emitirDpsPronta(dpsNt009Completa());
    expect(r.nfse.layout).toBe('nt009');
    expect(r.nfse.infNFSe.DPS.infDPS.finNFSe).toBe('0');

    const d1 = dpsNt009Completa();
    const lote = await client.emitirEmLote([d1, { ...d1, infDPS: { ...d1.infDPS, nDPS: '2' } }]);
    expect(lote.successCount).toBe(2);
    expect(enviados).toHaveLength(3);
    for (const xml of enviados) {
      expect(xml).toContain('<finNFSe>0</finNFSe>');
      await expect(validateDpsXml(xml, { layout: 'nt009' })).resolves.toBeUndefined();
    }
    await client.close();
  });
});

describe('NfseClient — NFS-e autorizada com resposta ilegível, logger e reconciliação do replay', () => {
  const senha = 'senha';
  let pfx: Buffer;
  let mockAgent: MockAgent;
  const SEFIN = 'https://sefin.producaorestrita.nfse.gov.br';
  // infDPS.Id válido (TSIdDPS) — o replay consulta GET /dps/{id} com ele.
  const ID_DPS = 'DPS211130020057475300010000001000000000000001';
  const XML_ILEGIVEL = XML_SAMPLE.replace(/<nNFSe>[^<]*<\/nNFSe>/, '');
  const XML_CAMPO_ESTRANHO = XML_SAMPLE.replace(
    '<vLiq>',
    '<vCalcAjusteBCISSQN>1.00</vCalcAjusteBCISSQN><vLiq>',
  );

  beforeAll(() => {
    pfx = gerarPfxTeste(senha);
  });
  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
  });
  afterEach(async () => {
    await mockAgent.close();
  });

  function recordingLogger() {
    const warns: [string, unknown][] = [];
    const errors: [string, unknown][] = [];
    const logger: Logger = {
      debug() {},
      info() {},
      warn: (m, c) => {
        warns.push([m, c]);
      },
      error: (m, c) => {
        errors.push([m, c]);
      },
    };
    return { logger, warns, errors };
  }

  function client(extra: Partial<NfseClientConfig<'nt004'>> = {}): NfseClient<'nt004'> {
    return new NfseClient({
      layout: 'nt004',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      ...extra,
    });
  }

  async function storeComEmissao(
    layout?: 'nt004' | 'nt009',
    xmlAssinado = `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="${ID_DPS}"/></DPS>`,
  ) {
    const store = createInMemoryRetryStore();
    await store.save({
      id: `emission:${ID_DPS}`,
      kind: 'emission',
      ...(layout ? { layout } : {}),
      idDps: ID_DPS,
      emitenteCnpj: '00574753000100',
      serie: '1',
      nDPS: '1',
      xmlAssinado,
      firstAttemptAt: new Date('2026-11-30T23:59:00Z'),
      lastAttemptAt: new Date('2026-11-30T23:59:00Z'),
      attempts: 1,
      lastError: { message: 'timeout', errorName: 'TimeoutError', transient: true },
    });
    return store;
  }

  function replyPost(status: number, body: object) {
    mockAgent
      .get(SEFIN)
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(status, body);
  }

  function replyDpsStatus(status: number, body: object = {}) {
    mockAgent
      .get(SEFIN)
      .intercept({ path: `/SefinNacional/dps/${ID_DPS}`, method: 'GET' })
      .reply(
        status,
        status === 200
          ? {
              tipoAmbiente: 2,
              versaoAplicativo: 'v',
              dataHoraProcessamento: '2026-11-30T23:59:30-03:00',
              idDps: ID_DPS,
              chaveAcesso: CHAVE,
            }
          : body,
      );
  }

  function replyNfseGet(status: number, xml = XML_SAMPLE) {
    mockAgent
      .get(SEFIN)
      .intercept({ path: `/SefinNacional/nfse/${CHAVE}`, method: 'GET' })
      .reply(
        status,
        status === 200
          ? {
              tipoAmbiente: 2,
              versaoAplicativo: 'v',
              dataHoraProcessamento: '2026-11-30T23:59:30-03:00',
              chaveAcesso: CHAVE,
              nfseXmlGZipB64: gzipBase64Encode(xml),
            }
          : {},
      );
  }

  const rejeicao = (codigo: string) => ({ erros: [{ codigo, descricao: `rejeição ${codigo}` }] });

  it('emitir: 201 ilegível lança UnreadableAuthorizedNfseError (chave/xml) e não persiste nada', async () => {
    replyPost(201, successBody(XML_ILEGIVEL, ID_DPS));
    const store = createInMemoryRetryStore();
    const c = client({ retryStore: store, dpsCounter: createInMemoryDpsCounter() });
    const err = await c.emitir(paramsEmitir).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnreadableAuthorizedNfseError);
    expect(err).toMatchObject({ chaveAcesso: CHAVE, idDps: ID_DPS, xmlNfse: XML_ILEGIVEL });
    expect(await store.list()).toHaveLength(0);
    await c.close();
  });

  it('substituir: 201 ilegível lança UnreadableAuthorizedNfseError e não persiste nada', async () => {
    replyPost(201, successBody(XML_ILEGIVEL, ID_DPS));
    const store = createInMemoryRetryStore();
    const c = client({ retryStore: store });
    const err = await c
      .substituir({
        chaveOriginal: CHAVE,
        novaDps: buildDps({ ...paramsEmitir, nDPS: '2', layout: 'nt004' }),
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Substituição por erro de digitação',
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnreadableAuthorizedNfseError);
    expect(await store.list()).toHaveLength(0);
    await c.close();
  });

  it('repassa o logger do cliente ao parser em emitir, emitirDpsPronta, emitirEmLote e substituir', async () => {
    for (let i = 0; i < 4; i++) replyPost(201, successBody(XML_CAMPO_ESTRANHO, ID_DPS));
    const { logger, warns } = recordingLogger();
    const c = client({ logger, dpsCounter: createInMemoryDpsCounter() });
    const dps = buildDps({ ...paramsEmitir, nDPS: '7', layout: 'nt004' });
    await c.emitir(paramsEmitir);
    await c.emitirDpsPronta(dps);
    await c.emitirEmLote([dps]);
    await c.substituir({
      chaveOriginal: CHAVE,
      novaDps: dps,
      cMotivo: JustificativaSubstituicao.Outros,
      xMotivo: 'Substituição por erro de digitação',
    });
    const parseWarns = warns.filter(([m]) => m === 'nfse.parse.unexpected_field');
    expect(parseWarns).toHaveLength(4);
    await c.close();
  });

  it('replay: re-POST autorizado mas ilegível → success_emission_unreadable (com a chave) e entrada removida', async () => {
    replyPost(201, successBody(XML_ILEGIVEL, ID_DPS));
    const store = await storeComEmissao();
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('success_emission_unreadable');
    if (item?.status !== 'success_emission_unreadable') throw new Error('status inesperado');
    expect(item.error).toBeInstanceOf(UnreadableAuthorizedNfseError);
    expect(item.error.chaveAcesso).toBe(CHAVE);
    expect(item.error.xmlNfse).toBe(XML_ILEGIVEL);
    expect(await store.list()).toHaveLength(0);
    await c.close();
  });

  it('replay: repassa o logger ao parser da NFS-e re-POSTada', async () => {
    replyPost(201, successBody(XML_CAMPO_ESTRANHO, ID_DPS));
    const { logger, warns } = recordingLogger();
    const c = client({ retryStore: await storeComEmissao(), logger });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('success_emission');
    expect(warns).toContainEqual([
      'nfse.parse.unexpected_field',
      { layout: 'nt004', field: 'vCalcAjusteBCISSQN', path: 'valores/vCalcAjusteBCISSQN' },
    ]);
    await c.close();
  });

  it('replay: rejeição permanente (E0014) + GET /dps mostra NFS-e gerada → success_emission reconciliado com a chave', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(200);
    const store = await storeComEmissao();
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('success_emission');
    if (item?.status !== 'success_emission') throw new Error('status inesperado');
    expect(item.emission.chaveAcesso).toBe(CHAVE);
    expect(item.emission.idDps).toBe(ID_DPS);
    expect(item.emission.xmlNfse).toBe(XML_SAMPLE);
    expect(item.emission.nfse.infNFSe.chaveAcesso).toBe(CHAVE);
    expect(item.reconciledFrom).toBeInstanceOf(ReceitaRejectionError);
    expect(item.reconciledFrom).toMatchObject({ codigo: 'E0014' });
    expect(await store.list()).toHaveLength(0);
    mockAgent.assertNoPendingInterceptors();
    await c.close();
  });

  it('replay: rejeição de schema na virada (E1235) + GET /dps 404 → failed_permanent com a rejeição, entrada removida', async () => {
    replyPost(400, rejeicao('E1235'));
    replyDpsStatus(404, { erro: { codigo: 'E404', descricao: 'não encontrada' } });
    const store = await storeComEmissao('nt004');
    const c = new NfseClient({
      layout: 'nt009',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: store,
    });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('failed_permanent');
    if (item?.status !== 'failed_permanent') throw new Error('status inesperado');
    expect(item.error).toBeInstanceOf(ReceitaRejectionError);
    expect(item.error).toMatchObject({ codigo: 'E1235' });
    expect(await store.list()).toHaveLength(0);
    mockAgent.assertNoPendingInterceptors();
    await c.close();
  });

  it('replay: rejeição permanente + GET /dps transiente → still_pending, entrada mantida (não deleta sem saber)', async () => {
    replyPost(400, rejeicao('E1235'));
    replyDpsStatus(503);
    const store = await storeComEmissao();
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('still_pending');
    if (item?.status !== 'still_pending') throw new Error('status inesperado');
    expect(item.error).toBeInstanceOf(ServerError);
    const stored = await store.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.attempts).toBe(2);
    await c.close();
  });

  it('replay: GET /dps confirma a NFS-e mas GET /nfse falha transiente → still_pending, entrada mantida', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(503);
    const store = await storeComEmissao();
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('still_pending');
    expect(await store.list()).toHaveLength(1);
    await c.close();
  });

  it('replay: GET /dps confirma a NFS-e mas o XML baixado é ilegível → success_emission_unreadable com a chave', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(200, XML_ILEGIVEL);
    const store = await storeComEmissao();
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('success_emission_unreadable');
    if (item?.status !== 'success_emission_unreadable') throw new Error('status inesperado');
    expect(item.error).toMatchObject({ chaveAcesso: CHAVE, idDps: ID_DPS, xmlNfse: XML_ILEGIVEL });
    expect(await store.list()).toHaveLength(0);
    await c.close();
  });

  // DPS persistida no store com a assinatura/dhEmi dados — a NFS-e do
  // XML_SAMPLE embute a DPS de dhEmi 2026-03-03T12:17:25-03:00.
  const SIGNATURE_VALUE_SAMPLE = (() => {
    const dps = XML_SAMPLE.slice(XML_SAMPLE.indexOf('<DPS '), XML_SAMPLE.indexOf('</DPS>'));
    const m = /<SignatureValue>([^<]*)<\/SignatureValue>/.exec(dps);
    if (!m?.[1]) throw new Error('fixture sem SignatureValue na DPS');
    return m[1];
  })();
  const dpsPersistida = (opts: { signatureValue?: string; dhEmi?: string }) =>
    `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="${ID_DPS}">` +
    (opts.dhEmi ? `<dhEmi>${opts.dhEmi}</dhEmi>` : '') +
    '</infDPS>' +
    (opts.signatureValue !== undefined
      ? `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo/><SignatureValue>${opts.signatureValue}</SignatureValue></Signature>`
      : '') +
    '</DPS>';

  it('replay: reconciliação confere a DPS embutida — assinatura igual (whitespace à parte) → success_emission', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(200);
    const sigQuebrada = SIGNATURE_VALUE_SAMPLE.replace(/\s+/g, '').replace(/(.{64})/g, '$1\n');
    const store = await storeComEmissao(undefined, dpsPersistida({ signatureValue: sigQuebrada }));
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('success_emission');
    expect(await store.list()).toHaveLength(0);
    await c.close();
  });

  it('replay: GET /dps devolve NFS-e de OUTRA DPS (assinatura diferente) → failed_permanent + warn reconcile_mismatch', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(200);
    const { logger, warns } = recordingLogger();
    const store = await storeComEmissao(
      undefined,
      dpsPersistida({
        signatureValue: 'b3V0cmEtYXNzaW5hdHVyYQ==',
        dhEmi: '2026-03-03T12:17:25-03:00',
      }),
    );
    const c = client({ retryStore: store, logger });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('failed_permanent');
    if (item?.status !== 'failed_permanent') throw new Error('status inesperado');
    expect(item.error).toBeInstanceOf(ReceitaRejectionError);
    expect(item.error).toMatchObject({ codigo: 'E0014' });
    expect(warns).toContainEqual([
      'nfse.replay.reconcile_mismatch',
      expect.objectContaining({ id: `emission:${ID_DPS}`, idDps: ID_DPS, chaveAcesso: CHAVE }),
    ]);
    expect(await store.list()).toHaveLength(0);
    await c.close();
  });

  it('replay: DPS persistida sem assinatura mas com dhEmi diferente do da NFS-e → failed_permanent', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(200);
    const store = await storeComEmissao(
      undefined,
      dpsPersistida({ dhEmi: '2026-11-30T20:58:00-03:00' }),
    );
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('failed_permanent');
    expect(await store.list()).toHaveLength(0);
    await c.close();
  });

  it('replay: DPS persistida sem assinatura e com o mesmo dhEmi (outro fuso) → success_emission', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(200);
    const store = await storeComEmissao(
      undefined,
      dpsPersistida({ dhEmi: '2026-03-03T15:17:25Z' }),
    );
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('success_emission');
    await c.close();
  });

  it('replay: NFS-e baixada ilegível mas de OUTRA DPS → failed_permanent (não success_emission_unreadable)', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(200, XML_ILEGIVEL);
    const store = await storeComEmissao(
      undefined,
      dpsPersistida({ signatureValue: 'b3V0cmEtYXNzaW5hdHVyYQ==' }),
    );
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('failed_permanent');
    expect(await store.list()).toHaveLength(0);
    await c.close();
  });

  it('replay: GET /dps confirma a NFS-e mas GET /nfse falha permanente (404) → success_emission_unreadable com a chave, sem XML', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(200);
    replyNfseGet(404);
    const store = await storeComEmissao();
    const c = client({ retryStore: store });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('success_emission_unreadable');
    if (item?.status !== 'success_emission_unreadable') throw new Error('status inesperado');
    expect(item.error.chaveAcesso).toBe(CHAVE);
    expect(item.error.idDps).toBe(ID_DPS);
    expect(item.error.xmlNfse).toBeUndefined();
    expect(item.error.cause).toBeInstanceOf(NotFoundError);
    expect(await store.list()).toHaveLength(0);
    mockAgent.assertNoPendingInterceptors();
    await c.close();
  });

  it('replay: rejeição permanente + GET /dps falha permanente (403) → failed_permanent com a rejeição + warn reconcile_failed', async () => {
    replyPost(400, rejeicao('E0014'));
    replyDpsStatus(403);
    const { logger, warns } = recordingLogger();
    const store = await storeComEmissao();
    const c = client({ retryStore: store, logger });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('failed_permanent');
    if (item?.status !== 'failed_permanent') throw new Error('status inesperado');
    expect(item.error).toBeInstanceOf(ReceitaRejectionError);
    expect(item.error).toMatchObject({ codigo: 'E0014' });
    expect(warns).toContainEqual([
      'nfse.replay.reconcile_failed',
      expect.objectContaining({ id: `emission:${ID_DPS}`, idDps: ID_DPS }),
    ]);
    expect(await store.list()).toHaveLength(0);
    mockAgent.assertNoPendingInterceptors();
    await c.close();
  });

  it('replay: entrada de emissão de outro layout que o cliente gera warn nfse.replay.layout_divergente', async () => {
    replyPost(201, successBody(XML_SAMPLE, ID_DPS));
    const { logger, warns } = recordingLogger();
    const c = new NfseClient({
      layout: 'nt009',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
      retryStore: await storeComEmissao('nt004'),
      logger,
    });
    const [item] = await c.replayPendingEvents();
    expect(item?.status).toBe('success_emission');
    expect(warns).toContainEqual([
      'nfse.replay.layout_divergente',
      { id: `emission:${ID_DPS}`, entryLayout: 'nt004', clientLayout: 'nt009' },
    ]);
    await c.close();
  });
});
