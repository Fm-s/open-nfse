import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TipoAmbiente } from '../ambiente.js';
import type { CepInfo, CepValidator } from '../cep/types.js';
import type { A1Certificate } from '../certificate/types.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import { InvalidCepError, InvalidCnpjError } from '../errors/validation.js';
import { HttpClient } from '../http/client.js';
import { gzipBase64Encode } from '../http/encoding.js';
import type { DPS, InfDPS } from './domain.js';
import { emitDpsPronta, emitMany } from './emit.js';

const SAMPLE_PATH = join(
  __dirname,
  '..',
  '..',
  'specs',
  'samples',
  '21113002200574753000100000000000146726037032711025.xml',
);
const SAMPLE_XML = readFileSync(SAMPLE_PATH, 'utf-8');

function selfSignedCert(): A1Certificate {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: 'emit-test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
    issuedOn: cert.validity.notBefore,
    expiresOn: cert.validity.notAfter,
    subject: 'CN=emit-test',
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

describe('emit', () => {
  const baseUrl = 'https://sefin.example.test/SefinNacional';
  let mockAgent: MockAgent;
  let httpClient: HttpClient;
  let cert: A1Certificate;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    httpClient = new HttpClient({ baseUrl, dispatcher: mockAgent });
    cert = selfSignedCert();
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  it('returns a dry-run result without hitting the network when dryRun=true', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(500, {});

    const result = await emitDpsPronta(httpClient, cert, minimalDps(), { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.xmlDpsAssinado).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
    );
    expect(result.xmlDpsAssinado).toContain(
      '<infDPS Id="DPS211130010057475300010000001000000000000001">',
    );
    expect(result.xmlDpsGZipB64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // no pending interceptors consumed — we didn't hit the mock
    expect(() => mockAgent.assertNoPendingInterceptors()).toThrow();
  });

  it('POSTs a gzip+base64 DPS payload and decodes the returned NFS-e on 201 success', async () => {
    const chave = '21113002200574753000100000000000146726037032711025';
    let capturedBody: string | undefined;

    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply((opts) => {
        capturedBody = opts.body as string;
        return {
          statusCode: 201,
          data: {
            tipoAmbiente: 2,
            versaoAplicativo: 'SefinNacional_1.6.0',
            dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
            idDps: 'DPS211130010057475300010000001000000000000001',
            chaveAcesso: chave,
            nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML),
          },
        };
      });

    const result = await emitDpsPronta(httpClient, cert, minimalDps());

    expect(result.dryRun).toBeFalsy();
    expect(result.chaveAcesso).toBe(chave);
    expect(result.idDps).toBe('DPS211130010057475300010000001000000000000001');
    expect(result.xmlNfse).toBe(SAMPLE_XML);
    expect(result.nfse.infNFSe.chaveAcesso).toBe(chave);
    expect(result.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
    expect(result.versaoAplicativo).toBe('SefinNacional_1.6.0');
    expect(result.dataHoraProcessamento.toISOString()).toBe('2026-04-17T15:00:00.000Z');
    expect(result.alertas).toEqual([]);

    // body must carry the dpsXmlGZipB64 field with a base64 string
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody as string) as { dpsXmlGZipB64: string };
    expect(parsed.dpsXmlGZipB64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('forwards success-body alertas into the emit result', async () => {
    const chave = '21113002200574753000100000000000146726037032711025';
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, {
        tipoAmbiente: 2,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        idDps: 'DPS1',
        chaveAcesso: chave,
        nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML),
        alertas: [
          { codigo: 'A001', descricao: 'Alerta informativo' },
          {},
          { codigo: 'A002', descricao: 'Outro alerta', complemento: 'contexto' },
        ],
      });

    const result = await emitDpsPronta(httpClient, cert, minimalDps());

    expect(result.alertas).toEqual([
      { codigo: 'A001', descricao: 'Alerta informativo' },
      { codigo: 'A002', descricao: 'Outro alerta', complemento: 'contexto' },
    ]);
  });

  it('throws ReceitaRejectionError on 400 with a NFSePostResponseErro body', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(400, {
        tipoAmbiente: 2,
        versaoAplicativo: 'SefinNacional_1.6.0',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        idDPS: 'DPS1234',
        erros: [
          { codigo: 'E401', descricao: 'CNPJ do emitente não autorizado', complemento: 'prest' },
          { codigo: 'E402', descricao: 'Município não conveniado' },
        ],
      });

    await expect(emitDpsPronta(httpClient, cert, minimalDps())).rejects.toMatchObject({
      name: 'ReceitaRejectionError',
      codigo: 'E401',
      idDps: 'DPS1234',
    });
  });

  it('wraps the typed error so it passes instanceof ReceitaRejectionError', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(400, {
        erros: [{ codigo: 'E001', descricao: 'falha' }],
      });

    await expect(emitDpsPronta(httpClient, cert, minimalDps())).rejects.toBeInstanceOf(
      ReceitaRejectionError,
    );
  });

  it('validates the DPS XSD before signing and throws XsdValidationError on bad input', async () => {
    // no interceptor: if the call reaches POST, the test fails fast.
    const badDps = minimalDps();
    // strip cNBS to force a validation failure
    const { cNBS: _omit, ...cServSemNBS } = badDps.infDPS.serv.cServ;
    void _omit;
    const broken: DPS = {
      ...badDps,
      infDPS: {
        ...badDps.infDPS,
        serv: { ...badDps.infDPS.serv, cServ: cServSemNBS as typeof badDps.infDPS.serv.cServ },
      },
    };
    await expect(emitDpsPronta(httpClient, cert, broken)).rejects.toMatchObject({
      name: 'XsdValidationError',
    });
  });

  it('skipValidation=true bypasses XSD checks (for debugging escape hatch)', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(400, { erros: [{ codigo: 'E999', descricao: 'mock rejection' }] });

    const badDps = minimalDps();
    const { cNBS: _omit, ...cServSemNBS } = badDps.infDPS.serv.cServ;
    void _omit;
    const broken: DPS = {
      ...badDps,
      infDPS: {
        ...badDps.infDPS,
        serv: { ...badDps.infDPS.serv, cServ: cServSemNBS as typeof badDps.infDPS.serv.cServ },
      },
    };
    // with skipValidation, the XML reaches SEFIN (mocked here as rejection)
    await expect(
      emitDpsPronta(httpClient, cert, broken, { skipValidation: true }),
    ).rejects.toMatchObject({
      name: 'ReceitaRejectionError',
      codigo: 'E999',
    });
  });

  it('validates CPF/CNPJ check digits and rejects invalid ones before hitting the network', async () => {
    const dps = minimalDps();
    const withBadCnpj: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        prest: {
          ...dps.infDPS.prest,
          identificador: { CNPJ: '00000000000001' }, // DV inválido
        },
      },
    };
    await expect(emitDpsPronta(httpClient, cert, withBadCnpj)).rejects.toBeInstanceOf(
      InvalidCnpjError,
    );
    expect(() => mockAgent.assertNoPendingInterceptors()).not.toThrow();
  });

  it('skipCpfCnpjValidation=true bypasses DV checks', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(400, { erros: [{ codigo: 'E999', descricao: 'mock' }] });

    const dps = minimalDps();
    const withBadCnpj: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        prest: { ...dps.infDPS.prest, identificador: { CNPJ: '00000000000001' } },
      },
    };
    // skipCpfCnpjValidation lets the bad CNPJ through; it reaches the mocked SEFIN
    await expect(
      emitDpsPronta(httpClient, cert, withBadCnpj, {
        skipCpfCnpjValidation: true,
        skipCepValidation: true,
      }),
    ).rejects.toBeInstanceOf(ReceitaRejectionError);
  });

  it('uses the injected cepValidator for every CEP in the DPS', async () => {
    const chave = '21113002200574753000100000000000146726037032711025';
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, {
        tipoAmbiente: 2,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        idDps: 'DPS1',
        chaveAcesso: chave,
        nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML),
      });

    const seen: string[] = [];
    const mockCepValidator: CepValidator = {
      validate: vi.fn(async (cep: string): Promise<CepInfo> => {
        seen.push(cep);
        return { cep, uf: 'SP' };
      }),
    };

    const dps = minimalDps();
    const withAddrs: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        prest: {
          ...dps.infDPS.prest,
          end: {
            localidade: { endNac: { cMun: '2111300', CEP: '01310100' } },
            xLgr: 'R',
            nro: '1',
            xBairro: 'B',
          },
        },
        toma: {
          identificador: { CPF: '01075595363' },
          xNome: 'T',
          end: {
            localidade: { endNac: { cMun: '3550308', CEP: '04538133' } },
            xLgr: 'R',
            nro: '1',
            xBairro: 'B',
          },
        },
      },
    };

    await emitDpsPronta(httpClient, cert, withAddrs, { cepValidator: mockCepValidator });
    expect(seen).toEqual(['01310100', '04538133']);
  });

  it('propagates InvalidCepError from the cepValidator and never hits SEFIN', async () => {
    const mockCepValidator: CepValidator = {
      validate: vi.fn(async (cep: string) => {
        throw new InvalidCepError(cep, 'not_found');
      }),
    };
    const dps = minimalDps();
    const withAddr: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        prest: {
          ...dps.infDPS.prest,
          end: {
            localidade: { endNac: { cMun: '2111300', CEP: '99999999' } },
            xLgr: 'R',
            nro: '1',
            xBairro: 'B',
          },
        },
      },
    };
    await expect(
      emitDpsPronta(httpClient, cert, withAddr, { cepValidator: mockCepValidator }),
    ).rejects.toBeInstanceOf(InvalidCepError);
    expect(() => mockAgent.assertNoPendingInterceptors()).not.toThrow();
  });

  it('skipCepValidation=true bypasses the validator entirely', async () => {
    const chave = '21113002200574753000100000000000146726037032711025';
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, {
        tipoAmbiente: 2,
        versaoAplicativo: '1.0.0',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        idDps: 'DPS1',
        chaveAcesso: chave,
        nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML),
      });

    const validator: CepValidator = {
      validate: vi.fn(async () => {
        throw new Error('should not be called');
      }),
    };
    const dps = minimalDps();
    const withAddr: DPS = {
      ...dps,
      infDPS: {
        ...dps.infDPS,
        prest: {
          ...dps.infDPS.prest,
          end: {
            localidade: { endNac: { cMun: '2111300', CEP: '01310100' } },
            xLgr: 'R',
            nro: '1',
            xBairro: 'B',
          },
        },
      },
    };
    const r = await emitDpsPronta(httpClient, cert, withAddr, {
      skipCepValidation: true,
      cepValidator: validator,
    });
    expect(r.chaveAcesso).toBe(chave);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it('throws a fallback ReceitaRejectionError when the 400 body carries no mensagens', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(400, { tipoAmbiente: 2 });

    await expect(emitDpsPronta(httpClient, cert, minimalDps())).rejects.toMatchObject({
      name: 'ReceitaRejectionError',
      codigo: 'UNKNOWN',
    });
  });
});

describe('emitMany', () => {
  const baseUrl = 'https://sefin.example.test/SefinNacional';
  let mockAgent: MockAgent;
  let httpClient: HttpClient;
  let cert: A1Certificate;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    httpClient = new HttpClient({ baseUrl, dispatcher: mockAgent });
    cert = selfSignedCert();
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  function dpsWith(nDPS: string): DPS {
    const base = minimalDps();
    return { ...base, infDPS: { ...base.infDPS, nDPS } };
  }

  function successReply(nDPS: string) {
    return {
      tipoAmbiente: 2 as const,
      versaoAplicativo: '1.0.0',
      dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
      idDps: `DPS-${nDPS}`,
      chaveAcesso: '21113002200574753000100000000000146726037032711025',
      nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML),
    };
  }

  it('emits all DPS in the list and returns per-item results in input order', async () => {
    for (let i = 1; i <= 5; i++) {
      mockAgent
        .get('https://sefin.example.test')
        .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
        .reply(201, successReply(String(i)));
    }

    const dpsList = Array.from({ length: 5 }, (_, i) => dpsWith(String(i + 1)));
    const out = await emitMany(httpClient, cert, dpsList);

    expect(out.items).toHaveLength(5);
    expect(out.successCount).toBe(5);
    expect(out.failureCount).toBe(0);
    expect(out.skippedCount).toBe(0);
    for (let i = 0; i < 5; i++) {
      const item = out.items[i];
      expect(item?.status).toBe('success');
      if (item?.status === 'success') {
        expect(item.dps.infDPS.nDPS).toBe(String(i + 1));
      }
    }
  });

  it('collects failures alongside successes instead of failing fast', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, successReply('1'));
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(400, { erros: [{ codigo: 'E001', descricao: 'inválido' }] });
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, successReply('3'));

    const dpsList = [dpsWith('1'), dpsWith('2'), dpsWith('3')];
    const out = await emitMany(httpClient, cert, dpsList, { concurrency: 1 });

    expect(out.successCount).toBe(2);
    expect(out.failureCount).toBe(1);
    expect(out.skippedCount).toBe(0);
    expect(out.items[0]?.status).toBe('success');
    expect(out.items[1]?.status).toBe('failure');
    expect(out.items[2]?.status).toBe('success');
    if (out.items[1]?.status === 'failure') {
      expect(out.items[1].error.name).toBe('ReceitaRejectionError');
    }
  });

  it('aborts remaining items when stopOnError=true after the first failure', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, successReply('1'));
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(400, { erros: [{ codigo: 'E001', descricao: 'inválido' }] });
    // the 3rd interceptor is intentionally NOT registered — if the worker tries
    // to hit it, undici would throw "MockNotMatchedError" and the test fails.

    const dpsList = [dpsWith('1'), dpsWith('2'), dpsWith('3')];
    const out = await emitMany(httpClient, cert, dpsList, {
      concurrency: 1,
      stopOnError: true,
    });

    expect(out.successCount).toBe(1);
    expect(out.failureCount).toBe(1);
    expect(out.skippedCount).toBe(1);
    expect(out.items[0]?.status).toBe('success');
    expect(out.items[1]?.status).toBe('failure');
    expect(out.items[2]?.status).toBe('skipped');
  });

  it('caps concurrency at the configured value', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    for (let i = 1; i <= 8; i++) {
      mockAgent
        .get('https://sefin.example.test')
        .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
        .reply(201, successReply(String(i)))
        .delay(30);
    }

    // Wrap buildDpsXml/signXml/post via a tiny instrumented httpClient sniff.
    // Simpler: observe via the emit function by spying on the mock's callback
    // is brittle with undici. Instead measure concurrency via the same
    // worker-pool invariant the implementation guarantees: track how many
    // emitDpsPronta() calls are in-flight at a single tick by patching HttpClient.post.
    const origPost = httpClient.post.bind(httpClient);
    (httpClient as unknown as { post: typeof origPost }).post = async (path, body, options) => {
      inFlight++;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      try {
        return await origPost(path, body, options);
      } finally {
        inFlight--;
      }
    };

    const dpsList = Array.from({ length: 8 }, (_, i) => dpsWith(String(i + 1)));
    await emitMany(httpClient, cert, dpsList, { concurrency: 3 });

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('returns an empty-but-valid result for an empty list without hitting the network', async () => {
    const out = await emitMany(httpClient, cert, []);
    expect(out.items).toEqual([]);
    expect(out.successCount).toBe(0);
    expect(out.failureCount).toBe(0);
    expect(out.skippedCount).toBe(0);
  });
});
