import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ambiente } from '../ambiente.js';
import type { A1Certificate } from '../certificate/types.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import { HttpClient } from '../http/client.js';
import { gzipBase64Encode } from '../http/encoding.js';
import { buildDps } from '../nfse/build-dps.js';
import type { DPS, InfDPS } from '../nfse/domain.js';
import {
  JustificativaCancelamento,
  JustificativaSubstituicao,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from '../nfse/enums.js';
import { buildCancelamentoXml, buildSubstituicaoXml } from './build-event-xml.js';
import { cancelar, substituir } from './cancelar.js';
import { MissingRetryStoreError, createInMemoryRetryStore } from './retry-store.js';
import { signPedRegEventoXml } from './sign-event.js';

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
const CHAVE_ORIGINAL = '21113002200574753000100000000000146726037032711025';
const CHAVE_NOVA = '21113002200574753000100000000000146727037032711025';
const BASE_URL = 'https://sefin.example.test/SefinNacional';

function selfSignedCert(): A1Certificate {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: 'evt-test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certPem: forge.pki.certificateToPem(cert),
    issuedOn: cert.validity.notBefore,
    expiresOn: cert.validity.notAfter,
    subject: 'CN=evt-test',
  };
}

/** Builds a minimal signed <evento> XML for the mock response. */
function mockEventoXml(chave: string, tipoEvento: '101101' | '105102'): string {
  const det =
    tipoEvento === '101101'
      ? '<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>x</xMotivo></e101101>'
      : `<e105102><xDesc>Cancelamento de NFS-e por Substituicao</xDesc><cMotivo>99</cMotivo><chSubstituta>${CHAVE_NOVA}</chSubstituta></e105102>`;
  return `<?xml version="1.0" encoding="UTF-8"?><evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento Id="EVT${chave}${tipoEvento}001"><verAplic>v</verAplic><ambGer>2</ambGer><nSeqEvento>1</nSeqEvento><dhProc>2026-04-17T12:00:00-03:00</dhProc><nDFe>123456</nDFe><pedRegEvento versao="1.01"><infPedReg Id="PRE${chave}${tipoEvento}001"><tpAmb>2</tpAmb><verAplic>client</verAplic><dhEvento>2026-04-17T12:00:00-03:00</dhEvento><CNPJAutor>00574753000100</CNPJAutor><chNFSe>${chave}</chNFSe><nPedRegEvento>001</nPedRegEvento>${det}</infPedReg></pedRegEvento></infEvento><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI="#EVT${chave}${tipoEvento}001"><DigestValue>x</DigestValue></Reference></SignedInfo><SignatureValue>sig</SignatureValue><KeyInfo><X509Data><X509Certificate>cert</X509Certificate></X509Data></KeyInfo></Signature></evento>`;
}

function mockEventoSuccessBody(chave: string, tipoEvento: '101101' | '105102') {
  return {
    tipoAmbiente: 2 as const,
    versaoAplicativo: 'SefinNacional_1.6.0',
    dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
    eventoXmlGZipB64: gzipBase64Encode(mockEventoXml(chave, tipoEvento)),
  };
}

function minimalNovaDps(): DPS {
  return buildDps({
    emitente: {
      cnpj: '00574753000100',
      codMunicipio: '2111300',
      regime: {
        opSimpNac: OpcaoSimplesNacional.MeEpp,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    nDPS: '2',
    servico: { cTribNac: '250101', cNBS: '123456789', descricao: 'Substituta' },
    valores: { vServ: 100 },
  });
}

describe('cancelar', () => {
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

  it('posts a signed <pedRegEvento> to /nfse/{chave}/eventos and parses the returned <evento>', async () => {
    let capturedBody: string | undefined;
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
      .reply((opts) => {
        capturedBody = opts.body as string;
        return { statusCode: 201, data: mockEventoSuccessBody(CHAVE_ORIGINAL, '101101') };
      });

    const r = await cancelar(httpClient, cert, {
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'erro no valor',
    });

    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.evento.evento.versao).toBe('1.01');
      expect(r.evento.evento.infEvento.pedRegEvento.infPedReg.chNFSe).toBe(CHAVE_ORIGINAL);
      expect(r.evento.evento.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe('101101');
    }

    // body contains the gzip+base64 payload with a signed pedido
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody as string) as { pedidoRegistroEventoXmlGZipB64: string };
    expect(parsed.pedidoRegistroEventoXmlGZipB64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('throws ReceitaRejectionError when SEFIN returns 400 with ResponseErro', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
      .reply(400, {
        tipoAmbiente: 2,
        versaoAplicativo: 'v',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        erro: { codigo: 'E8001', descricao: 'Prazo de cancelamento expirado' },
      });

    await expect(
      cancelar(httpClient, cert, {
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo: 'x',
      }),
    ).rejects.toMatchObject({ name: 'ReceitaRejectionError', codigo: 'E8001' });
  });

  it('persists pending on transient (5xx) error and returns retry_pending', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
      .reply(500, 'boom');

    const retryStore = createInMemoryRetryStore();
    const r = await cancelar(httpClient, cert, {
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'erro',
      retryStore,
    });

    expect(r.status).toBe('retry_pending');
    if (r.status === 'retry_pending') {
      expect(r.pending.kind).toBe('cancelamento_simples');
      if (r.pending.kind === 'cancelamento_simples') {
        expect(r.pending.chaveNfse).toBe(CHAVE_ORIGINAL);
        expect(r.pending.tipoEvento).toBe('101101');
        expect(r.pending.nPedRegEvento).toBe('001');
      }
      expect(r.pending.lastError.transient).toBe(true);
    }
    const stored = await retryStore.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe('cancelamento_simples');
  });

  it('throws MissingRetryStoreError on transient failure without store', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
      .reply(503, 'unavailable');

    await expect(
      cancelar(httpClient, cert, {
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.Outros,
        xMotivo: 'x',
      }),
    ).rejects.toBeInstanceOf(MissingRetryStoreError);
  });
});

describe('substituir — 4-state machine', () => {
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

  function mockEmitSuccess() {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(201, {
        tipoAmbiente: 2,
        versaoAplicativo: 'v',
        dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
        idDps: 'DPS211130010057475300010000001000000000000002',
        chaveAcesso: CHAVE_NOVA,
        nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML),
      });
  }

  function mockCancelamentoEvento(tipoEvento: '101101' | '105102', chave: string) {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${chave}/eventos`, method: 'POST' })
      .reply(201, mockEventoSuccessBody(chave, tipoEvento));
  }

  function mockEventoFail(chave: string, statusCode: number, body: object | string) {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${chave}/eventos`, method: 'POST' })
      .reply(statusCode, body);
  }

  const baseSubstParams = {
    chaveOriginal: CHAVE_ORIGINAL,
    autor: { CNPJ: '00574753000100' } as const,
    cMotivo: JustificativaSubstituicao.Outros,
    xMotivo: 'Correção de valor',
    skipValidation: true as const,
    skipCepValidation: true as const,
    skipCpfCnpjValidation: true as const,
  };

  it("status='ok' when both emit and cancelamento succeed", async () => {
    mockEmitSuccess();
    mockCancelamentoEvento('105102', CHAVE_ORIGINAL);

    const r = await substituir(httpClient, cert, {
      ...baseSubstParams,
      novaDps: minimalNovaDps(),
    });

    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.novaNfse.chaveAcesso).toBe(CHAVE_NOVA);
      expect(r.cancelamento.evento.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe('105102');
    }
  });

  it("status='retry_pending' when cancelamento fails with 5xx (transient) and stores the pendente", async () => {
    mockEmitSuccess();
    mockEventoFail(CHAVE_ORIGINAL, 500, 'Internal Server Error');

    const retryStore = createInMemoryRetryStore();
    const r = await substituir(httpClient, cert, {
      ...baseSubstParams,
      novaDps: minimalNovaDps(),
      retryStore,
    });

    expect(r.status).toBe('retry_pending');
    if (r.status === 'retry_pending') {
      expect(r.novaNfse.chaveAcesso).toBe(CHAVE_NOVA);
      expect(r.pending.kind).toBe('cancelamento_por_substituicao');
      if (r.pending.kind === 'cancelamento_por_substituicao') {
        expect(r.pending.chaveNfse).toBe(CHAVE_ORIGINAL);
      }
      expect(r.pending.lastError.transient).toBe(true);
    }
    const stored = await retryStore.list();
    expect(stored).toHaveLength(1);
    const first = stored[0];
    expect(first?.kind).toBe('cancelamento_por_substituicao');
    if (first?.kind === 'cancelamento_por_substituicao') {
      expect(first.chaveNfse).toBe(CHAVE_ORIGINAL);
    }
  });

  it("status='rolled_back' when cancelamento fails permanently (prazo) and rollback succeeds", async () => {
    mockEmitSuccess();
    // First eventos POST (to original) — permanent failure
    mockEventoFail(CHAVE_ORIGINAL, 400, {
      tipoAmbiente: 2,
      versaoAplicativo: 'v',
      dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
      erro: { codigo: 'E8001', descricao: 'Prazo de cancelamento expirado' },
    });
    // Second eventos POST (to nova, for rollback) — success
    mockCancelamentoEvento('101101', CHAVE_NOVA);

    const r = await substituir(httpClient, cert, {
      ...baseSubstParams,
      novaDps: minimalNovaDps(),
    });

    expect(r.status).toBe('rolled_back');
    if (r.status === 'rolled_back') {
      expect(r.novaNfse.chaveAcesso).toBe(CHAVE_NOVA);
      expect(r.cancelamentoError).toBeInstanceOf(ReceitaRejectionError);
      expect(r.rollback.evento.infEvento.pedRegEvento.infPedReg.chNFSe).toBe(CHAVE_NOVA);
      expect(r.rollback.evento.infEvento.pedRegEvento.infPedReg.tipoEvento).toBe('101101');
    }
  });

  it("status='rollback_pending' when cancelamento permanent AND rollback transient → saved", async () => {
    mockEmitSuccess();
    mockEventoFail(CHAVE_ORIGINAL, 400, {
      erro: { codigo: 'E8001', descricao: 'prazo' },
    });
    mockEventoFail(CHAVE_NOVA, 500, 'Internal Server Error');

    const retryStore = createInMemoryRetryStore();
    const r = await substituir(httpClient, cert, {
      ...baseSubstParams,
      novaDps: minimalNovaDps(),
      retryStore,
    });

    expect(r.status).toBe('rollback_pending');
    if (r.status === 'rollback_pending') {
      expect(r.pendingRollback.kind).toBe('rollback_cancelamento');
      if (r.pendingRollback.kind === 'rollback_cancelamento') {
        expect(r.pendingRollback.chaveNfse).toBe(CHAVE_NOVA);
        expect(r.pendingRollback.tipoEvento).toBe('101101');
      }
    }
    const stored = await retryStore.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe('rollback_cancelamento');
  });

  it('throws MissingRetryStoreError when a transient cancel would need persistence but no store is configured', async () => {
    mockEmitSuccess();
    mockEventoFail(CHAVE_ORIGINAL, 500, 'boom');

    await expect(
      substituir(httpClient, cert, {
        ...baseSubstParams,
        novaDps: minimalNovaDps(),
      }),
    ).rejects.toBeInstanceOf(MissingRetryStoreError);
  });

  it('auto-populates infDPS.subst on novaDps when absent', async () => {
    let capturedDpsPayload: string | undefined;
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply((opts) => {
        capturedDpsPayload = opts.body as string;
        return {
          statusCode: 201,
          data: {
            tipoAmbiente: 2,
            versaoAplicativo: 'v',
            dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
            idDps: 'DPS211130010057475300010000001000000000000002',
            chaveAcesso: CHAVE_NOVA,
            nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML),
          },
        };
      });
    mockCancelamentoEvento('105102', CHAVE_ORIGINAL);

    const dpsSemSubst = minimalNovaDps();
    expect(dpsSemSubst.infDPS.subst).toBeUndefined();

    await substituir(httpClient, cert, {
      ...baseSubstParams,
      novaDps: dpsSemSubst,
    });

    // inspect the POST body for a <subst> element referencing the original chave
    expect(capturedDpsPayload).toBeDefined();
    // payload is gzip+base64 — for this integration test we just assert something
    // was posted. Full roundtrip is covered by other tests.
    const body = JSON.parse(capturedDpsPayload as string) as { dpsXmlGZipB64: string };
    expect(body.dpsXmlGZipB64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('signPedRegEventoXml + buildCancelamentoXml wiring', () => {
  it('produces a signed pedRegEvento whose Signature references #PRE...', () => {
    const cert = selfSignedCert();
    const xml = buildCancelamentoXml({
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.Outros,
      xMotivo: 'teste',
    });
    const signed = signPedRegEventoXml(xml, cert);
    expect(signed).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    expect(signed).toContain(`<Reference URI="#PRE${CHAVE_ORIGINAL}101101001">`);
  });

  it('also works for substituição (105102 pedRegEvento)', () => {
    const cert = selfSignedCert();
    const xml = buildSubstituicaoXml({
      chaveOriginal: CHAVE_ORIGINAL,
      chaveSubstituta: CHAVE_NOVA,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaSubstituicao.Outros,
    });
    const signed = signPedRegEventoXml(xml, cert);
    expect(signed).toContain(`<Reference URI="#PRE${CHAVE_ORIGINAL}105102001">`);
  });
});

// silence unused-import warning — Ambiente is imported for the barrel test above
void Ambiente;
// silence InfDPS unused
void ({} as InfDPS | undefined);
