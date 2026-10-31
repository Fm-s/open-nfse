import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ambiente } from '../ambiente.js';
import type { A1Certificate } from '../certificate/types.js';
import { NfseClient } from '../client.js';
import { ReceitaRejectionError } from '../errors/receita.js';
import { InvalidLayoutError, LayoutMismatchError } from '../errors/validation.js';
import { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText, gzipBase64Encode } from '../http/encoding.js';
import { buildDps } from '../nfse/build-dps.js';
import type { DPS, DpsNt009, InfDPSNt004 } from '../nfse/domain.js';
import {
  JustificativaCancelamento,
  JustificativaSubstituicao,
  OpcaoSimplesNacional,
  RegimeEspecialTributacao,
} from '../nfse/enums.js';
import type { Layout } from '../nfse/layout.js';
import { validateDpsXml, validatePedRegEventoXml } from '../nfse/validate-xml.js';
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

const SAMPLE_XML_NT009 = readFileSync(
  join(__dirname, '..', 'nfse', '__fixtures__', 'nfse-nt009-sintetica.xml'),
  'utf-8',
);

function gerarPfxTeste(senha: string): Buffer {
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
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, senha);
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

function minimalNovaDpsNt009(): DpsNt009 {
  return buildDps({
    layout: 'nt009',
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
    valores: { vServ: 100, pTotTrib: { pTotTribFed: 0, pTotTribEst: 0, pTotTribMun: 0 } },
  });
}

function minimalNovaDps(): DPS {
  return buildDps({
    layout: 'nt004',
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

  it('grava o layout recebido no PendingEvent persistido; sem layout, entrada fica sem o campo', async () => {
    for (let i = 0; i < 2; i++) {
      mockAgent
        .get('https://sefin.example.test')
        .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
        .reply(500, 'boom');
    }
    const params = {
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo: 'erro transitorio 5xx',
    };
    const comLayout = createInMemoryRetryStore();
    await cancelar(
      httpClient,
      cert,
      createDefaultRetryPolicy(),
      { ...params, retryStore: comLayout },
      'nt009',
    );
    expect((await comLayout.list())[0]?.layout).toBe('nt009');

    const semLayout = createInMemoryRetryStore();
    await cancelar(httpClient, cert, createDefaultRetryPolicy(), {
      ...params,
      retryStore: semLayout,
    });
    expect((await semLayout.list())[0]).not.toHaveProperty('layout');
  });

  it('layout desconhecido (chamador JS) → InvalidLayoutError sem POST', async () => {
    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    await expect(
      cancelar(
        httpClient,
        cert,
        createDefaultRetryPolicy(),
        {
          chaveAcesso: CHAVE_ORIGINAL,
          autor: { CNPJ: '00574753000100' },
          cMotivo: JustificativaCancelamento.ErroEmissao,
          xMotivo: 'erro transitorio 5xx',
          retryStore: createInMemoryRetryStore(),
        },
        'nt010' as never,
      ),
    ).rejects.toBeInstanceOf(InvalidLayoutError);
    expect(dispatch).not.toHaveBeenCalled();
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

  // TSMotivo restringe TSString (tiposSimples_v1.01.xsd:13-21, idêntico nos
  // bundles nt004 e nt009): pattern `[!-ÿ]{1}[ -ÿ]{0,}[!-ÿ]{1}|[!-ÿ]{1}` — sem
  // espaço nas pontas, só U+0020–U+00FF. Fora disso a SEFIN rejeita no schema.
  it.each([
    ['travessão (U+2013)', 'Erro na emissão – valor errado'],
    ['aspas curvas', 'Erro “valor” incorreto aqui'],
    ['espaço no fim', 'Erro na emissão do valor '],
    ['espaço no início', ' Erro na emissão do valor'],
    ['tab', 'Erro\tna emissão do valor'],
    ['quebra de linha', 'Erro na emissão\ndo valor'],
  ])('rejects xMotivo fora do pattern TSString (%s) sem tocar a rede', async (_caso, xMotivo) => {
    // O XSD oficial também rejeita — o guard espelha o schema, não o inventa.
    const xml = signPedRegEventoXml(
      buildCancelamentoXml({
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo,
      }),
      cert,
    );
    for (const layout of ['nt004', 'nt009'] as const) {
      const r = await validatePedRegEventoXml(xml, { layout, throwOnInvalid: false });
      expect(r.valid).toBe(false);
    }

    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    await expect(
      cancelar(httpClient, cert, createDefaultRetryPolicy(), {
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo,
      }),
    ).rejects.toMatchObject({ name: 'RuleViolationError', rule: 'TSMotivo' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('aceita xMotivo Latin-1 (acentos, cedilha, NBSP interno) — dentro do pattern TSString', async () => {
    const xMotivo = 'Correção de preço:\u00A0serviço não prestado';
    const xml = signPedRegEventoXml(
      buildCancelamentoXml({
        chaveAcesso: CHAVE_ORIGINAL,
        autor: { CNPJ: '00574753000100' },
        cMotivo: JustificativaCancelamento.ErroEmissao,
        xMotivo,
      }),
      cert,
    );
    await expect(validatePedRegEventoXml(xml, { layout: 'nt009' })).resolves.toBeUndefined();
    mockAgent
      .get('https://sefin.example.test')
      .intercept({ path: `/SefinNacional/nfse/${CHAVE_ORIGINAL}/eventos`, method: 'POST' })
      .reply(201, mockEventoSuccessBody(CHAVE_ORIGINAL, '101101'));
    const r = await cancelar(httpClient, cert, createDefaultRetryPolicy(), {
      chaveAcesso: CHAVE_ORIGINAL,
      autor: { CNPJ: '00574753000100' },
      cMotivo: JustificativaCancelamento.ErroEmissao,
      xMotivo,
    });
    expect(r.status).toBe('ok');
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
  // pedRegEvento 105102 — a Sefin o rejeita (E0813: autor ≠ MEmis; E0845: já
  // vinculado pelo sistema).
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
    expect(stored[0]?.layout).toBe('nt004'); // layout da novaDps
  });

  it('layout explícito: novaDps de outro layout → LayoutMismatchError sem POST', async () => {
    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    await expect(
      substituir(
        httpClient,
        cert,
        policy,
        { ...baseSubstParams, novaDps: minimalNovaDps() } as never,
        'nt009',
      ),
    ).rejects.toBeInstanceOf(LayoutMismatchError);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('layout desconhecido (chamador JS) → InvalidLayoutError (não LayoutMismatchError) sem POST', async () => {
    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    await expect(
      substituir(
        httpClient,
        cert,
        policy,
        { ...baseSubstParams, novaDps: minimalNovaDps() },
        'nt010' as unknown as Layout,
      ),
    ).rejects.toBeInstanceOf(InvalidLayoutError);
    expect(dispatch).not.toHaveBeenCalled();
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

  it('rejects xMotivo fora do pattern TSString (travessão U+2013) antes de tocar a rede', async () => {
    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    await expect(
      substituir(httpClient, cert, policy, {
        ...baseSubstParams,
        xMotivo: 'Correção – valor do serviço',
        novaDps: minimalNovaDps(),
      }),
    ).rejects.toMatchObject({ name: 'RuleViolationError', rule: 'TSMotivo' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // nt009 ponta a ponta: a DPS com <subst> sai serializada, na ordem do XSD, e
  // válida contra schemas/1.01-nt009 — via função livre e via NfseClient<'nt009'>.
  // ---------------------------------------------------------------------------

  const SUBST_NT009_RE = new RegExp(
    `<cLocEmi>2111300</cLocEmi><subst><chSubstda>${CHAVE_ORIGINAL}</chSubstda><cMotivo>99</cMotivo><xMotivo>Correção de valor do serviço</xMotivo></subst><prest>`,
  );

  function capturedDpsXml(captured: string | undefined): string {
    expect(captured).toBeDefined();
    const body = JSON.parse(captured as string) as { dpsXmlGZipB64: string };
    return gzipBase64DecodeToText(body.dpsXmlGZipB64);
  }

  it('nt009: emits <subst><chSubstda> após <cLocEmi> e o XML enviado valida contra o XSD nt009', async () => {
    let captured: string | undefined;
    mockEmitSuccess((b) => {
      captured = b;
    });
    const novaDps = minimalNovaDpsNt009();
    expect(novaDps.infDPS.subst).toBeUndefined();

    // Sem skipValidation: o pipeline valida a DPS contra o XSD nt009 antes do POST.
    const r = await substituir(
      httpClient,
      cert,
      policy,
      {
        chaveOriginal: CHAVE_ORIGINAL,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Correção de valor do serviço',
        skipCepValidation: true,
        novaDps,
      },
      'nt009',
    );

    expect(r.status).toBe('ok');
    const xml = capturedDpsXml(captured);
    expect(xml).toMatch(SUBST_NT009_RE);
    expect(xml).toContain('<finNFSe>');
    await expect(validateDpsXml(xml, { layout: 'nt009' })).resolves.toBeUndefined();
  });

  it('nt009: NfseClient<nt009>.substituir envia a DPS com <subst> válida contra o XSD nt009', async () => {
    let captured: string | undefined;
    mockAgent
      .get('https://sefin.producaorestrita.nfse.gov.br')
      .intercept({ path: '/SefinNacional/nfse', method: 'POST' })
      .reply((opts) => {
        captured = opts.body as string;
        return {
          statusCode: 201,
          data: {
            tipoAmbiente: 2,
            versaoAplicativo: 'v',
            dataHoraProcessamento: '2026-12-01T12:00:00-03:00',
            idDps: 'DPS211130010057475300010000100000000000000002',
            chaveAcesso: CHAVE_NOVA,
            nfseXmlGZipB64: gzipBase64Encode(SAMPLE_XML_NT009),
          },
        };
      });
    const senha = 'senha';
    const client = new NfseClient({
      layout: 'nt009',
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx: gerarPfxTeste(senha), password: senha },
      dispatcher: mockAgent,
    });
    try {
      const r = await client.substituir({
        chaveOriginal: CHAVE_ORIGINAL,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Correção de valor do serviço',
        skipCepValidation: true,
        novaDps: minimalNovaDpsNt009(),
      });
      expect(r.status).toBe('ok');
      if (r.status === 'ok') expect(r.novaNfse.chaveAcesso).toBe(CHAVE_NOVA);
      const xml = capturedDpsXml(captured);
      expect(xml).toMatch(SUBST_NT009_RE);
      await expect(validateDpsXml(xml, { layout: 'nt009' })).resolves.toBeUndefined();
    } finally {
      await client.close();
    }
  });

  // ---------------------------------------------------------------------------
  // novaDps já com infDPS.subst: params e DPS precisam concordar (o que vai no
  // XML é o subst da DPS — divergência silenciosa enviaria outra coisa).
  // ---------------------------------------------------------------------------

  function dpsComSubst(subst: NonNullable<InfDPSNt004['subst']>): DPS {
    const dps = minimalNovaDps();
    if (dps.layout !== 'nt004') throw new Error('fixture nt004 esperada');
    return { ...dps, infDPS: { ...dps.infDPS, subst } };
  }

  it.each([
    [
      'chSubstda ≠ chaveOriginal',
      {
        chSubstda: CHAVE_NOVA,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: baseSubstParams.xMotivo,
      },
    ],
    [
      'cMotivo diferente',
      {
        chSubstda: CHAVE_ORIGINAL,
        cMotivo: JustificativaSubstituicao.DesenquadramentoSN,
        xMotivo: baseSubstParams.xMotivo,
      },
    ],
    [
      'xMotivo ausente na DPS (cMotivo=99 → E0078 no que seria enviado)',
      { chSubstda: CHAVE_ORIGINAL, cMotivo: JustificativaSubstituicao.Outros },
    ],
    [
      'xMotivo diferente',
      {
        chSubstda: CHAVE_ORIGINAL,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: 'Outro motivo qualquer aqui',
      },
    ],
  ] as const)(
    'novaDps.infDPS.subst divergente dos params (%s) → RuleViolationError sem POST',
    async (_caso, subst) => {
      const dispatch = vi.spyOn(mockAgent, 'dispatch');
      await expect(
        substituir(httpClient, cert, policy, { ...baseSubstParams, novaDps: dpsComSubst(subst) }),
      ).rejects.toMatchObject({ name: 'RuleViolationError', rule: 'infDPS/subst' });
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it('novaDps.infDPS.subst idêntico aos params é aceito e enviado como está', async () => {
    let captured: string | undefined;
    mockEmitSuccess((b) => {
      captured = b;
    });
    const r = await substituir(httpClient, cert, policy, {
      ...baseSubstParams,
      novaDps: dpsComSubst({
        chSubstda: CHAVE_ORIGINAL,
        cMotivo: JustificativaSubstituicao.Outros,
        xMotivo: baseSubstParams.xMotivo,
      }),
    });
    expect(r.status).toBe('ok');
    const xml = capturedDpsXml(captured);
    expect(xml).toContain(
      `<subst><chSubstda>${CHAVE_ORIGINAL}</chSubstda><cMotivo>99</cMotivo><xMotivo>${baseSubstParams.xMotivo}</xMotivo></subst>`,
    );
  });

  it('guards E0078/TSMotivo rodam sobre o subst efetivamente enviado (DPS com subst inválido idêntico aos params)', async () => {
    const dispatch = vi.spyOn(mockAgent, 'dispatch');
    await expect(
      substituir(httpClient, cert, policy, {
        chaveOriginal: CHAVE_ORIGINAL,
        cMotivo: JustificativaSubstituicao.Outros,
        novaDps: dpsComSubst({
          chSubstda: CHAVE_ORIGINAL,
          cMotivo: JustificativaSubstituicao.Outros,
        }),
      }),
    ).rejects.toMatchObject({ rule: 'E0078' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // E0042 (Anexo I nt004 r170 / nt009 r179, Obrig./Rej., execSefin): Cód.Mun. /
  // Tipo de Inscrição / Inscrição da chave substituída devem corresponder
  // exatamente aos do Id desta DPS.
  //   chave (TSIdNFSe sem "NFS"): cMun[0,7) ambGer[7] tpInsc[8] insc[9,23) …
  //   Id    (TSIdDPS):            "DPS" cMun[3,10) tpInsc[10] insc[11,25) …
  // ---------------------------------------------------------------------------

  function trocar(chave: string, pos: number, s: string): string {
    return chave.slice(0, pos) + s + chave.slice(pos + s.length);
  }

  it.each([
    ['Cód.Mun. diferente', trocar(CHAVE_ORIGINAL, 0, '3550308')],
    ['Tipo de Inscrição diferente', trocar(CHAVE_ORIGINAL, 8, '1')],
    ['Inscrição diferente', trocar(CHAVE_ORIGINAL, 9, '99999999000199')],
  ])(
    'E0042: chaveOriginal com %s do Id da DPS → RuleViolationError sem POST',
    async (_caso, chave) => {
      const dispatch = vi.spyOn(mockAgent, 'dispatch');
      for (const novaDps of [minimalNovaDps(), minimalNovaDpsNt009()]) {
        await expect(
          substituir(httpClient, cert, policy, {
            ...baseSubstParams,
            chaveOriginal: chave,
            novaDps,
          }),
        ).rejects.toMatchObject({ name: 'RuleViolationError', rule: 'E0042' });
      }
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it('E0042: só cMun/tpInsc/inscrição contam — ambGer e demais posições da chave podem diferir', async () => {
    mockEmitSuccess();
    // ambGer (pos 7) e nNFSe (pos 23+) diferentes do sample — mesmo emitente.
    const chave = trocar(trocar(CHAVE_ORIGINAL, 7, '1'), 23, '0000000009999');
    const r = await substituir(httpClient, cert, policy, {
      ...baseSubstParams,
      chaveOriginal: chave,
      novaDps: minimalNovaDps(),
    });
    expect(r.status).toBe('ok');
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
    await expect(validatePedRegEventoXml(signed, { layout: 'nt004' })).resolves.toBeUndefined();
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
    await expect(validatePedRegEventoXml(signed, { layout: 'nt004' })).resolves.toBeUndefined();
  });
});

// silence unused-import warning — Ambiente is imported for the barrel test above
void Ambiente;
// silence InfDPSNt004 unused
void ({} as InfDPSNt004 | undefined);
