import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ambiente, TipoAmbiente } from './ambiente.js';
import { ClientClosedError, NfseClient } from './client.js';
import { StatusDistribuicao } from './dfe/types.js';
import { ForbiddenError } from './errors/http.js';
import { InvalidChaveAcessoError } from './errors/validation.js';
import { gzipBase64Encode } from './http/encoding.js';
import { parseNfseXml } from './nfse/parse-xml.js';
import { createInMemoryRetryStore } from './retry/store.js';

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

  it('emitir: signs DPS, POSTs to /nfse and returns the parsed NFS-e on success', async () => {
    const minimalDps = {
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
    } as Parameters<NfseClient['emitirDpsPronta']>[0];

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
    } as Parameters<NfseClient['emitirDpsPronta']>[0];

    const client = new NfseClient({
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
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    await client.close();
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('rejects any call after close() with ClientClosedError', async () => {
    const client = new NfseClient({
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
