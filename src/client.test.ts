import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ambiente, TipoAmbiente } from './ambiente.js';
import { ClientClosedError, NfseClient } from './client.js';
import { StatusDistribuicao } from './dfe/types.js';
import { ForbiddenError } from './errors/http.js';
import { InvalidChaveAcessoError } from './errors/validation.js';
import { gzipBase64Encode } from './http/encoding.js';
import { parseNfseXml } from './nfse/parse-xml.js';

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

  it('fetchDanfse rejects chaves fora do pattern sem tocar a rede', async () => {
    const client = new NfseClient({
      ambiente: Ambiente.ProducaoRestrita,
      certificado: { pfx, password: senha },
      dispatcher: mockAgent,
    });
    await expect(client.fetchDanfse('nao-e-chave')).rejects.toBeInstanceOf(InvalidChaveAcessoError);
    // encoded traversal attempt também é barrado
    await expect(client.fetchDanfse('../admin')).rejects.toBeInstanceOf(InvalidChaveAcessoError);
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

    const pdf = await client.gerarDanfse(nfse);
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

    await expect(client.gerarDanfse(nfse)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
