import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ambiente } from '../ambiente.js';
import type { A1Certificate } from '../certificate/types.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText, gzipBase64Encode } from '../http/encoding.js';
import { buildDps } from '../nfse/build-dps.js';
import type { DPS, InfDPS } from '../nfse/domain.js';
import {
  JustificativaCancelamento,
  JustificativaSubstituicao,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from '../nfse/enums.js';
import { validatePedRegEventoXml } from '../nfse/validate-xml.js';
import { createDefaultRetryPolicy } from '../retry/policy.js';
import { createInMemoryRetryStore, MissingRetryStoreError } from '../retry/store.js';
import { buildCancelamentoXml, buildSubstituicaoXml } from './build-event-xml.js';
import { cancelar, substituir } from './cancelar.js';
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
  return `<?xml version="1.0" encoding="UTF-8"?><evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento Id="EVT${chave}${tipoEvento}001"><verAplic>v</verAplic><ambGer>2</ambGer><nSeqEvento>1</nSeqEvento><dhProc>2026-04-17T12:00:00-03:00</dhProc><nDFSe>123456</nDFSe><pedRegEvento versao="1.01"><infPedReg Id="PRE${chave}${tipoEvento}001"><tpAmb>2</tpAmb><verAplic>client</verAplic><dhEvento>2026-04-17T12:00:00-03:00</dhEvento><CNPJAutor>00574753000100</CNPJAutor><chNFSe>${chave}</chNFSe><nPedRegEvento>001</nPedRegEvento>${det}</infPedReg></pedRegEvento></infEvento><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI="#EVT${chave}${tipoEvento}001"><DigestValue>x</DigestValue></Reference></SignedInfo><SignatureValue>sig</SignatureValue><KeyInfo><X509Data><X509Certificate>cert</X509Certificate></X509Data></KeyInfo></Signature></evento>`;
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
        opSimpNac: OpcaoSimplesNacional.NaoOptante,
        regEspTrib: RegimeEspecialTributacao.Nenhum,
      },
    },
    serie: '1',
    nDPS: '2',
    servico: { cTribNac: '250101', cNBS: '123456789', descricao: 'Substituta' },
    // Não Optante exige vTotTrib/pTotTrib no choice totTrib (E0713).
    valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
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

    const r = await cancelar(httpClient, cert, createDefaultRetryPolicy(), {
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'erro no valor informado',
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
      cancelar(httpClient, cert, createDefaultRetryPolicy(), {
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo: 'motivo suficientemente longo',
      }),
    ).rejects.toMatchObject({ name: 'ReceitaRejectionError', codigo: 'E8001' });
  });

  it('persists pending on transient (5xx) error and returns retry_pending', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
      .reply(500, 'boom');

    const retryStore = createInMemoryRetryStore();
    const r = await cancelar(httpClient, cert, createDefaultRetryPolicy(), {
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'erro transitorio 5xx',
      retryStore,
    });

    expect(r.status).toBe('retry_pending');
    if (r.status === 'retry_pending') {
      expect(r.pending.kind).toBe('cancelamento_simples');
      if (r.pending.kind === 'cancelamento_simples') {
        expect(r.pending.chaveNfse).toBe(CHAVE_ORIGINAL);
        expect(r.pending.tipoEvento).toBe('101101');
      }
      expect(r.pending.lastError.transient).toBe(true);
      expect(r.pending.attempts).toBe(1); // first persist
      // Regression guard: the persisted xmlAssinado MUST contain an
      // XMLDSig signature. `replayPendingEvents` re-POSTs with
      // `xmlJaAssinado: true`, so unsigned XML in the store would be
      // silently rejected by SEFIN on every retry and the entry would
      // be evicted as a "permanent" failure — losing the cancellation.
      expect(r.pending.xmlAssinado).toMatch(/<Signature[\s>][\s\S]*<\/Signature>/);
      expect(r.pending.xmlAssinado).toContain('<SignatureValue>');
    }
    const stored = await retryStore.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe('cancelamento_simples');
    expect(stored[0]?.xmlAssinado).toMatch(/<Signature[\s>][\s\S]*<\/Signature>/);
  });

  it('on 429 with Retry-After, persists pending with notBefore = now + retryAfter', async () => {
    vi.useFakeTimers();
    const NOW = new Date('2026-05-12T10:00:00Z');
    vi.setSystemTime(NOW);

    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
      .reply(429, '', { headers: { 'Retry-After': '45' } });

    const retryStore = createInMemoryRetryStore();
    const r = await cancelar(httpClient, cert, createDefaultRetryPolicy(), {
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'erro com rate limit transitorio',
      retryStore,
    });

    expect(r.status).toBe('retry_pending');
    if (r.status === 'retry_pending') {
      expect(r.pending.notBefore).toEqual(new Date(NOW.getTime() + 45_000));
    }

    vi.useRealTimers();
  });

  it('throws MissingRetryStoreError on transient failure without store', async () => {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
      .reply(503, 'unavailable');

    await expect(
      cancelar(httpClient, cert, createDefaultRetryPolicy(), {
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.Outros,
        xMotivo: 'servico indisponivel transiente',
      }),
    ).rejects.toBeInstanceOf(MissingRetryStoreError);
  });

  it('rejects cMotivo=9 (Outros) com xMotivo vazio no 101101 sem tocar a rede', async () => {
    await expect(
      cancelar(httpClient, cert, createDefaultRetryPolicy(), {
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.Outros,
        xMotivo: '   ', // whitespace-only conta como vazio
      }),
    ).rejects.toMatchObject({ rule: 'e101101/xMotivo' });
  });

  it('rejects xMotivo com menos de 15 caracteres (TSMotivo) sem tocar a rede', async () => {
    await expect(
      cancelar(httpClient, cert, createDefaultRetryPolicy(), {
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo: 'curto', // 5 chars, abaixo de 15
      }),
    ).rejects.toMatchObject({ rule: 'TSMotivo' });
  });
});

describe('substituir — emite a DPS com <subst> (105102 gerado pelo sistema)', () => {
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

  function mockEmitSuccess(capture?: (body: string) => void) {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply((opts) => {
        capture?.(opts.body as string);
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
  }

  function mockEmitFail(statusCode: number, body: object | string) {
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply(statusCode, body);
  }

  const baseSubstParams = {
    chaveOriginal: CHAVE_ORIGINAL,
    cMotivo: JustificativaSubstituicao.Outros,
    xMotivo: 'Correção de valor do serviço',
    skipValidation: true as const,
    skipCepValidation: true as const,
    skipCpfCnpjValidation: true as const,
  };

  const policy = createDefaultRetryPolicy();

  // A substituição é dirigida pela DPS (Manual Contribuintes API v1.2 §1.3.2):
  // o contribuinte envia a nova DPS com <subst> para POST /nfse e o SISTEMA gera
  // o evento 105102 (autor=MEmis) cancelando a original. A lib NÃO posta um
  // pedRegEvento 105102 — fazê-lo era redundante (E0845) e com autor/assinante
  // errados (E0813/E2032).
  it("status='ok': emits the <subst> DPS via POST /nfse and returns the substitute NFS-e (no event POST)", async () => {
    // Só POST /nfse é interceptado. Se substituir tentar POST .../eventos, o
    // MockAgent (disableNetConnect) lança — guard de regressão contra o 105102.
    mockEmitSuccess();

    const r = await substituir(httpClient, cert, policy, {
      ...baseSubstParams,
      novaDps: minimalNovaDps(),
    });

    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.novaNfse.chaveAcesso).toBe(CHAVE_NOVA);
  });

  it('auto-populates infDPS.subst (chSubstda = chave original) on novaDps when absent', async () => {
    let captured: string | undefined;
    mockEmitSuccess((b) => {
      captured = b;
    });

    const dpsSemSubst = minimalNovaDps();
    expect(dpsSemSubst.infDPS.subst).toBeUndefined();

    await substituir(httpClient, cert, policy, { ...baseSubstParams, novaDps: dpsSemSubst });

    expect(captured).toBeDefined();
    const body = JSON.parse(captured as string) as { dpsXmlGZipB64: string };
    const xml = gzipBase64DecodeToText(body.dpsXmlGZipB64);
    expect(xml).toContain('<subst>');
    expect(xml).toContain(`<chSubstda>${CHAVE_ORIGINAL}</chSubstda>`);
  });

  it("status='retry_pending' on transient (5xx) emit failure — persists the emission", async () => {
    mockEmitFail(500, 'Internal Server Error');
    const retryStore = createInMemoryRetryStore();

    const r = await substituir(httpClient, cert, policy, {
      ...baseSubstParams,
      novaDps: minimalNovaDps(),
      retryStore,
    });

    expect(r.status).toBe('retry_pending');
    if (r.status === 'retry_pending') {
      expect(r.pending.kind).toBe('emission');
      expect(r.pending.lastError.transient).toBe(true);
      // a emissão persistida carrega XML assinado para replay idempotente.
      expect(r.pending.xmlAssinado).toMatch(/<Signature[\s>][\s\S]*<\/Signature>/);
    }
    const stored = await retryStore.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe('emission');
  });

  it('throws MissingRetryStoreError on a transient emit failure without a store', async () => {
    mockEmitFail(500, 'boom');
    await expect(
      substituir(httpClient, cert, policy, { ...baseSubstParams, novaDps: minimalNovaDps() }),
    ).rejects.toBeInstanceOf(MissingRetryStoreError);
  });

  it('throws ReceitaRejectionError on a permanent (400) rejection', async () => {
    mockEmitFail(400, {
      tipoAmbiente: 2,
      versaoAplicativo: 'v',
      dataHoraProcessamento: '2026-04-17T12:00:00-03:00',
      erros: [{ codigo: 'E0050', descricao: 'Substituição rejeitada — prazo' }],
    });
    await expect(
      substituir(httpClient, cert, policy, { ...baseSubstParams, novaDps: minimalNovaDps() }),
    ).rejects.toBeInstanceOf(ReceitaRejectionError);
  });

  it('rejects cMotivo=99 without xMotivo (rule E0078) before touching the network', async () => {
    await expect(
      substituir(httpClient, cert, policy, {
        chaveOriginal: CHAVE_ORIGINAL,
        novaDps: minimalNovaDps(),
        cMotivo: JustificativaSubstituicao.Outros,
        // xMotivo ausente → RuleViolationError antes de qualquer chamada de rede
      }),
    ).rejects.toMatchObject({ rule: 'E0078' });
  });

  it('rejects xMotivo shorter than 15 chars (TSMotivo) before touching the network', async () => {
    await expect(
      substituir(httpClient, cert, policy, {
        ...baseSubstParams,
        xMotivo: 'curto',
        novaDps: minimalNovaDps(),
      }),
    ).rejects.toThrow();
  });
});

describe('signPedRegEventoXml + buildCancelamentoXml wiring', () => {
  it('produces a signed pedRegEvento whose Signature references #PRE...', () => {
    const cert = selfSignedCert();
    const xml = buildCancelamentoXml({
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.Outros,
      xMotivo: 'teste de assinatura',
    });
    const signed = signPedRegEventoXml(xml, cert);
    expect(signed).toContain('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">');
    expect(signed).toContain(`<Reference URI="#PRE${CHAVE_ORIGINAL}101101">`);
  });

  it('also works for substituição (105102 pedRegEvento)', () => {
    const cert = selfSignedCert();
    const xml = buildSubstituicaoXml({
      chaveOriginal: CHAVE_ORIGINAL,
      chaveSubstituta: CHAVE_NOVA,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaSubstituicao.Outros,
      xMotivo: 'Correção de cadastro',
    });
    const signed = signPedRegEventoXml(xml, cert);
    expect(signed).toContain(`<Reference URI="#PRE${CHAVE_ORIGINAL}105102">`);
  });

  it('signed cancelamento (101101) validates against pedRegEvento XSD', async () => {
    const cert = selfSignedCert();
    const xml = buildCancelamentoXml({
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'Valor incorreto',
    });
    const signed = signPedRegEventoXml(xml, cert);
    await expect(validatePedRegEventoXml(signed)).resolves.toBeUndefined();
  });

  it('signed substituição (105102) validates against pedRegEvento XSD', async () => {
    const cert = selfSignedCert();
    const xml = buildSubstituicaoXml({
      chaveOriginal: CHAVE_ORIGINAL,
      chaveSubstituta: CHAVE_NOVA,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaSubstituicao.Outros,
      xMotivo: 'Correção de valor',
    });
    const signed = signPedRegEventoXml(xml, cert);
    await expect(validatePedRegEventoXml(signed)).resolves.toBeUndefined();
  });
});

// silence unused-import warning — Ambiente is imported for the barrel test above
void Ambiente;
// silence InfDPS unused
void ({} as InfDPS | undefined);
