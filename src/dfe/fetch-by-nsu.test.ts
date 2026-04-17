import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TipoAmbiente } from '../ambiente.js';
import { HttpClient } from '../http/client.js';
import { gzipBase64Encode } from '../http/encoding.js';
import { fetchByNsu } from './fetch-by-nsu.js';
import { StatusDistribuicao, TipoDocumento, TipoEvento } from './types.js';

const ADN_ORIGIN = 'https://adn.example.test';
const ADN_BASE = `${ADN_ORIGIN}/contribuintes`;

const XML_DOC_1 = '<NFSe><id>doc-1</id></NFSe>';
const XML_DOC_2 = '<Evento><tipo>CANC</tipo></Evento>';

describe('fetchByNsu', () => {
  let mockAgent: MockAgent;
  let httpClient: HttpClient;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    httpClient = new HttpClient({ baseUrl: ADN_BASE, dispatcher: mockAgent });
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  it('returns DOCUMENTOS_LOCALIZADOS with decoded XML per document', async () => {
    mockAgent
      .get(ADN_ORIGIN)
      .intercept({ path: '/contribuintes/DFe/0', method: 'GET' })
      .reply(200, {
        StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
        LoteDFe: [
          {
            NSU: 101,
            ChaveAcesso: '1'.repeat(50),
            TipoDocumento: 'NFSE',
            TipoEvento: null,
            ArquivoXml: gzipBase64Encode(XML_DOC_1),
            DataHoraGeracao: '2026-04-16T10:00:00-03:00',
          },
          {
            NSU: 102,
            ChaveAcesso: '2'.repeat(50),
            TipoDocumento: 'EVENTO',
            TipoEvento: 'CANCELAMENTO',
            ArquivoXml: gzipBase64Encode(XML_DOC_2),
            DataHoraGeracao: '2026-04-16T11:00:00-03:00',
          },
        ],
        Alertas: null,
        Erros: null,
        TipoAmbiente: 'HOMOLOGACAO',
        VersaoAplicativo: '1.0.0',
        DataHoraProcessamento: '2026-04-16T12:00:00-03:00',
      });

    const result = await fetchByNsu(httpClient, 0);

    expect(result.status).toBe(StatusDistribuicao.DocumentosEncontrados);
    expect(result.tipoAmbiente).toBe(TipoAmbiente.Homologacao);
    expect(result.documentos).toHaveLength(2);

    expect(result.documentos[0]?.nsu).toBe(101);
    expect(result.documentos[0]?.tipoDocumento).toBe(TipoDocumento.Nfse);
    expect(result.documentos[0]?.tipoEvento).toBeNull();
    expect(result.documentos[0]?.xmlDocumento).toBe(XML_DOC_1);

    expect(result.documentos[1]?.tipoDocumento).toBe(TipoDocumento.Evento);
    expect(result.documentos[1]?.tipoEvento).toBe(TipoEvento.Cancelamento);
    expect(result.documentos[1]?.xmlDocumento).toBe(XML_DOC_2);

    expect(result.ultimoNsu).toBe(102);
  });

  it('keeps the input ultimoNsu when the batch is empty', async () => {
    mockAgent
      .get(ADN_ORIGIN)
      .intercept({ path: '/contribuintes/DFe/999', method: 'GET' })
      .reply(200, {
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
        TipoAmbiente: 'HOMOLOGACAO',
        VersaoAplicativo: '1.0.0',
        DataHoraProcessamento: '2026-04-16T12:00:00-03:00',
      });

    const result = await fetchByNsu(httpClient, 999);
    expect(result.ultimoNsu).toBe(999);
  });

  it('returns NENHUM_DOCUMENTO_LOCALIZADO with empty documentos array', async () => {
    mockAgent
      .get(ADN_ORIGIN)
      .intercept({ path: '/contribuintes/DFe/500', method: 'GET' })
      .reply(200, {
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
        TipoAmbiente: 'HOMOLOGACAO',
        VersaoAplicativo: '1.0.0',
        DataHoraProcessamento: '2026-04-16T12:00:00-03:00',
      });

    const result = await fetchByNsu(httpClient, 500);
    expect(result.status).toBe(StatusDistribuicao.NenhumDocumento);
    expect(result.documentos).toEqual([]);
  });

  it('accepts a 404 response body (ADN uses 404 for "nenhum documento")', async () => {
    mockAgent
      .get(ADN_ORIGIN)
      .intercept({ path: '/contribuintes/DFe/0', method: 'GET' })
      .reply(404, {
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: [],
        Alertas: [],
        Erros: [
          {
            Codigo: 'E2220',
            Descricao: 'Nenhum documento localizado',
            Complemento: null,
          },
        ],
        TipoAmbiente: 'HOMOLOGACAO',
        VersaoAplicativo: '1.0.0.0',
        DataHoraProcessamento: '2026-04-16T21:17:24-03:00',
      });

    const result = await fetchByNsu(httpClient, 0);
    expect(result.status).toBe(StatusDistribuicao.NenhumDocumento);
    expect(result.documentos).toEqual([]);
    expect(result.erros[0]?.codigo).toBe('E2220');
  });

  it('treats 400 REJEICAO as a normal response (ADN uses 400 for rejection bodies)', async () => {
    mockAgent
      .get(ADN_ORIGIN)
      .intercept({ path: '/contribuintes/DFe/0', method: 'GET' })
      .reply(400, {
        StatusProcessamento: 'REJEICAO',
        LoteDFe: null,
        Alertas: null,
        Erros: [{ Codigo: 'E001', Descricao: 'CNPJ inválido', Complemento: null }],
        TipoAmbiente: 'HOMOLOGACAO',
        VersaoAplicativo: '1.0.0',
        DataHoraProcessamento: '2026-04-16T12:00:00-03:00',
      });

    const result = await fetchByNsu(httpClient, 0);
    expect(result.status).toBe(StatusDistribuicao.Rejeicao);
    expect(result.erros).toHaveLength(1);
    expect(result.erros[0]?.codigo).toBe('E001');
  });

  it('normalizes REJEICAO returned with 200 status', async () => {
    mockAgent
      .get(ADN_ORIGIN)
      .intercept({ path: '/contribuintes/DFe/0', method: 'GET' })
      .reply(200, {
        StatusProcessamento: 'REJEICAO',
        LoteDFe: null,
        Alertas: [{ Codigo: 'W10', Descricao: 'deprecated param', Complemento: 'use X' }],
        Erros: [{ Codigo: 'E001', Descricao: 'CNPJ inválido', Complemento: null }],
        TipoAmbiente: 'HOMOLOGACAO',
        VersaoAplicativo: '1.0.0',
        DataHoraProcessamento: '2026-04-16T12:00:00-03:00',
      });

    const result = await fetchByNsu(httpClient, 0);
    expect(result.status).toBe(StatusDistribuicao.Rejeicao);
    expect(result.documentos).toEqual([]);
    expect(result.erros).toHaveLength(1);
    expect(result.erros[0]?.codigo).toBe('E001');
    expect(result.alertas[0]?.complemento).toBe('use X');
  });

  it('serializes cnpjConsulta and lote query params', async () => {
    mockAgent
      .get(ADN_ORIGIN)
      .intercept({
        path: '/contribuintes/DFe/42?cnpjConsulta=12345678000190&lote=false',
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

    const result = await fetchByNsu(httpClient, 42, {
      cnpjConsulta: '12345678000190',
      lote: false,
    });
    expect(result.status).toBe(StatusDistribuicao.NenhumDocumento);
  });
});
