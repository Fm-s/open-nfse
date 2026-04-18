import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { A1Certificate } from '../certificate/types.js';
import {
  MissingRetryStoreError,
  createInMemoryRetryStore,
  isPendingEmission,
} from '../eventos/retry-store.js';
import { HttpClient } from '../http/client.js';
import { gzipBase64Encode } from '../http/encoding.js';
import {
  type DpsCounter,
  MissingDpsCounterError,
  createInMemoryDpsCounter,
} from './dps-counter.js';
import { type EmitirParams, emitSeguro } from './emit.js';
import { OpcaoSimplesNacional, RegimeEspecialTributacao } from './enums.js';

const SAMPLE_XML = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'specs',
    'samples',
    '21113002200574753000100000000000146726037032711025.xml',
  ),
  'utf-8',
);
const CHAVE = '21113002200574753000100000000000146726037032711025';
const BASE_URL = 'https://sefin.example.test/SefinNacional';

function selfSignedCert(): A1Certificate {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: 'emit-seguro-test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
    issuedOn: cert.validity.notBefore,
    expiresOn: cert.validity.notAfter,
    subject: 'CN=test',
  };
}

function baseParams(): EmitirParams {
  return {
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    servico: { cTribNac: '250101', cNBS: '123456789', descricao: 'Teste' },
    valores: { vServ: 100 },
    skipCepValidation: true,
    skipCpfCnpjValidation: true,
  };
}

describe('emitSeguro', () => {
  let mockAgent: MockAgent;
  let httpClient: HttpClient;
  let cert: A1Certificate;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    httpClient = new HttpClient({ baseUrl: BASE_URL, dispatcher: mockAgent });
    cert = selfSignedCert();
  });
  afterEach(async () => {
    await mockAgent.close();
  });

  function mockPostOk() {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, {
        tipoAmbiente: 2,
        versaoAplicativo: 'v',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        idDps: 'dummy',
        chaveAcesso: CHAVE,
        nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML),
      });
  }

  it('consults the counter exactly once per call and passes {emitenteCnpj, serie}', async () => {
    mockPostOk();
    const counter: DpsCounter = {
      next: vi.fn(async (scope) => {
        expect(scope).toEqual({ emitenteCnpj: '00574753000100', serie: '1' });
        return '42';
      }),
    };
    const r = await emitSeguro(
      { httpClient, certificate: cert, dpsCounter: counter, retryStore: undefined },
      baseParams(),
    );
    expect(r).toMatchObject({ status: 'ok' });
    expect(counter.next).toHaveBeenCalledTimes(1);
  });

  it('does NOT call counter when nDPS is explicit (override)', async () => {
    mockPostOk();
    const counter: DpsCounter = { next: vi.fn() };
    await emitSeguro(
      { httpClient, certificate: cert, dpsCounter: counter, retryStore: undefined },
      { ...baseParams(), nDPS: '99' },
    );
    expect(counter.next).not.toHaveBeenCalled();
  });

  it('does NOT call counter for dryRun (uses placeholder to avoid burning a number)', async () => {
    const counter: DpsCounter = { next: vi.fn() };
    const r = await emitSeguro(
      { httpClient, certificate: cert, dpsCounter: counter, retryStore: undefined },
      { ...baseParams(), dryRun: true },
    );
    expect(counter.next).not.toHaveBeenCalled();
    expect('dryRun' in r && r.dryRun).toBe(true);
  });

  it('throws MissingDpsCounterError when counter absent and no nDPS override', async () => {
    await expect(
      emitSeguro(
        { httpClient, certificate: cert, dpsCounter: undefined, retryStore: undefined },
        baseParams(),
      ),
    ).rejects.toBeInstanceOf(MissingDpsCounterError);
  });

  it('counter is called AFTER offline validations — invalid DPS does not burn a number', async () => {
    const counter: DpsCounter = { next: vi.fn() };
    const paramsSemCnbs: EmitirParams = {
      ...baseParams(),
      servico: { cTribNac: '250101', cNBS: '', descricao: 'x' }, // cNBS vazio falha XSD
      skipCepValidation: true,
      skipCpfCnpjValidation: true,
    };
    await expect(
      emitSeguro(
        { httpClient, certificate: cert, dpsCounter: counter, retryStore: undefined },
        paramsSemCnbs,
      ),
    ).rejects.toThrow(); // XsdValidationError
    expect(counter.next).not.toHaveBeenCalled();
  });

  it('persists pending on transient (5xx) error and returns retry_pending', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(500, 'boom');
    const counter = createInMemoryDpsCounter(7);
    const retryStore = createInMemoryRetryStore();

    const r = await emitSeguro(
      { httpClient, certificate: cert, dpsCounter: counter, retryStore },
      baseParams(),
    );

    expect('status' in r && r.status).toBe('retry_pending');
    if ('status' in r && r.status === 'retry_pending') {
      expect(r.pending.kind).toBe('emission');
      if (r.pending.kind === 'emission') {
        expect(r.pending.nDPS).toBe('7');
        expect(r.pending.emitenteCnpj).toBe('00574753000100');
        expect(r.pending.idDps).toMatch(/^DPS\d{42}$/);
      }
      expect(r.pending.lastError.transient).toBe(true);
      expect(r.pending.xmlAssinado).toContain('<Signature');
    }
    const stored = await retryStore.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe('emission');
  });

  it('throws MissingRetryStoreError on transient failure when retryStore absent', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(503, 'unavailable');
    const counter = createInMemoryDpsCounter();

    await expect(
      emitSeguro(
        { httpClient, certificate: cert, dpsCounter: counter, retryStore: undefined },
        baseParams(),
      ),
    ).rejects.toBeInstanceOf(MissingRetryStoreError);
  });

  it('throws ReceitaRejectionError on permanent (HTTP 400) failure and does NOT save to retryStore', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(400, {
        erros: [{ codigo: 'E401', descricao: 'CNPJ não autorizado' }],
      });
    const counter = createInMemoryDpsCounter();
    const retryStore = createInMemoryRetryStore();

    await expect(
      emitSeguro({ httpClient, certificate: cert, dpsCounter: counter, retryStore }, baseParams()),
    ).rejects.toMatchObject({ name: 'ReceitaRejectionError', codigo: 'E401' });

    const stored = await retryStore.list();
    expect(stored).toHaveLength(0);
  });

  it('isPendingEmission type guard discriminates emission vs event', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(500, 'boom');
    const retryStore = createInMemoryRetryStore();
    await emitSeguro(
      {
        httpClient,
        certificate: cert,
        dpsCounter: createInMemoryDpsCounter(),
        retryStore,
      },
      baseParams(),
    );
    const pending = await retryStore.list();
    expect(pending[0]).toBeDefined();
    if (pending[0]) {
      expect(isPendingEmission(pending[0])).toBe(true);
    }
  });

  it('dryRun with nDPS override produces signed XML referencing that nDPS', async () => {
    const counter: DpsCounter = { next: vi.fn() };
    const r = await emitSeguro(
      { httpClient, certificate: cert, dpsCounter: counter, retryStore: undefined },
      { ...baseParams(), dryRun: true, nDPS: '42' },
    );
    expect('dryRun' in r && r.dryRun).toBe(true);
    if ('xmlDpsAssinado' in r) {
      expect(r.xmlDpsAssinado).toContain('<nDPS>42</nDPS>');
    }
    expect(counter.next).not.toHaveBeenCalled();
  });

  it('counter increments across sequential calls', async () => {
    mockPostOk();
    mockPostOk();
    const counter = createInMemoryDpsCounter(10);
    const retryStore = createInMemoryRetryStore();

    const p: EmitirParams & { dryRun: false } = { ...baseParams(), dryRun: false };
    await emitSeguro({ httpClient, certificate: cert, dpsCounter: counter, retryStore }, p);
    await emitSeguro({ httpClient, certificate: cert, dpsCounter: counter, retryStore }, p);

    // next call would be 12 — verify by consuming one more
    expect(await counter.next({ emitenteCnpj: '00574753000100', serie: '1' })).toBe('12');
  });
});
