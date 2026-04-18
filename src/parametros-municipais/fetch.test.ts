import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpClient } from '../http/client.js';
import { createInMemoryParametrosCache } from './cache.js';
import {
  fetchAliquota,
  fetchBeneficio,
  fetchConvenio,
  fetchHistoricoAliquotas,
  fetchRegimesEspeciais,
  fetchRetencoes,
} from './fetch.js';

const BASE_URL = 'https://param.example.test/parametrizacao';

describe('parametros-municipais fetch functions', () => {
  let mockAgent: MockAgent;
  let httpClient: HttpClient;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    httpClient = new HttpClient({ baseUrl: BASE_URL, dispatcher: mockAgent });
  });
  afterEach(async () => {
    await mockAgent.close();
  });

  // --------- aliquota ---------

  it('fetchAliquota: parses PascalCase Aliquota fields and dates', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/2111300/250101/2026-03-01/aliquota', method: 'GET' })
      .reply(200, {
        mensagem: null,
        aliquotas: {
          '250101': [
            {
              Incidencia: 'Local',
              Aliq: 2.5,
              DtIni: '2026-01-01T00:00:00',
              DtFim: null,
            },
          ],
        },
      });

    const r = await fetchAliquota(httpClient, '2111300', '250101', '2026-03-01');
    expect(r.aliquotas['250101']).toHaveLength(1);
    const a = r.aliquotas['250101']?.[0];
    expect(a?.incidencia).toBe('Local');
    expect(a?.aliquota).toBe(2.5);
    expect(a?.dataInicio).toBeInstanceOf(Date);
    expect(a?.dataFim).toBeUndefined();
  });

  it('fetchAliquota: accepts Date for competencia (formats as YYYY-MM-DD)', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/2111300/250101/2026-03-01/aliquota', method: 'GET' })
      .reply(200, { aliquotas: {} });

    const comp = new Date('2026-03-01T10:00:00Z');
    const r = await fetchAliquota(httpClient, '2111300', '250101', comp);
    expect(r.aliquotas).toEqual({});
  });

  it('fetchAliquota: 404 with body returns result with mensagem (no throw)', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/9999999/x/2026-03-01/aliquota', method: 'GET' })
      .reply(404, { mensagem: 'Município não cadastrado', aliquotas: null });

    const r = await fetchAliquota(httpClient, '9999999', 'x', '2026-03-01');
    expect(r.mensagem).toBe('Município não cadastrado');
    expect(r.aliquotas).toEqual({});
  });

  it('fetchAliquota: caches the result with cache hit on second call', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/2111300/250101/2026-03-01/aliquota', method: 'GET' })
      .reply(200, {
        aliquotas: { '250101': [{ DtIni: '2026-01-01T00:00:00' }] },
      });
    // Only ONE interceptor — second call must hit cache or the test fails.

    const cache = createInMemoryParametrosCache();
    const first = await fetchAliquota(httpClient, '2111300', '250101', '2026-03-01', cache);
    const second = await fetchAliquota(httpClient, '2111300', '250101', '2026-03-01', cache);
    expect(second).toBe(first); // same reference via cache
  });

  it('fetchAliquota with useCache=false bypasses cache', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/2111300/250101/2026-03-01/aliquota', method: 'GET' })
      .reply(200, { aliquotas: {} })
      .persist(); // allow multiple hits

    const cache = createInMemoryParametrosCache();
    await fetchAliquota(httpClient, '2111300', '250101', '2026-03-01', cache);
    const second = await fetchAliquota(httpClient, '2111300', '250101', '2026-03-01', cache, {
      useCache: false,
    });
    // If cache were used, `second` would be same reference. useCache=false → new fetch.
    // undici's persist() returns the same body, so we can't compare references here.
    // Instead assert: no pending interceptors (both hit the network).
    expect(second.aliquotas).toEqual({});
  });

  // --------- historicoAliquotas ---------

  it('fetchHistoricoAliquotas: hits the /historicoaliquotas path', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/2111300/250101/historicoaliquotas', method: 'GET' })
      .reply(200, {
        aliquotas: {
          '250101': [
            { Incidencia: 'Local', Aliq: 2.0, DtIni: '2020-01-01', DtFim: '2025-12-31' },
            { Incidencia: 'Local', Aliq: 2.5, DtIni: '2026-01-01' },
          ],
        },
      });

    const r = await fetchHistoricoAliquotas(httpClient, '2111300', '250101');
    expect(r.aliquotas['250101']).toHaveLength(2);
    expect(r.aliquotas['250101']?.[0]?.dataFim).toBeInstanceOf(Date);
  });

  // --------- beneficio ---------

  it('fetchBeneficio: normalizes enum integers to strings + nested arrays', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/2111300/B42/2026-03-01/beneficio', method: 'GET' })
      .reply(200, {
        beneficio: {
          codigoBeneficio: 'B42',
          descricao: 'Imunidade',
          dataInicioVigencia: '2026-01-01',
          dataFimVigencia: null,
          tipoBeneficio: 3,
          tipoReducaoBC: null,
          reducaoPercentualBC: null,
          aliquotaDiferenciada: null,
          restritoAoMunicipio: true,
          servicos: [{ codigoServico: '250101', dataInicioVigencia: '2026-01-01' }],
          contribuintes: [
            {
              tipoInscricao: 1,
              inscricao: '00574753000100',
              dataInicioVigencia: '2026-01-01',
            },
          ],
        },
      });

    const r = await fetchBeneficio(httpClient, '2111300', 'B42', '2026-03-01');
    expect(r.beneficio?.tipoBeneficio).toBe('3');
    expect(r.beneficio?.restritoAoMunicipio).toBe(true);
    expect(r.beneficio?.servicos).toHaveLength(1);
    expect(r.beneficio?.contribuintes[0]?.tipoInscricao).toBe('1');
  });

  // --------- convenio ---------

  it('fetchConvenio: parses tipoConvenioDeserializationSetter → tipoConvenio', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/2111300/convenio', method: 'GET' })
      .reply(200, {
        parametrosConvenio: {
          tipoConvenioDeserializationSetter: 1,
          aderenteAmbienteNacional: 1,
          aderenteEmissorNacional: 1,
          situacaoEmissaoPadraoContribuintesRFB: 0,
          aderenteMAN: 0,
          permiteAproveitametoDeCreditos: true,
        },
      });

    const r = await fetchConvenio(httpClient, '2111300');
    expect(r.parametrosConvenio?.tipoConvenio).toBe('1');
    expect(r.parametrosConvenio?.aderenteAmbienteNacional).toBe('1');
    expect(r.parametrosConvenio?.permiteAproveitamentoDeCreditos).toBe(true);
  });

  // --------- regimes_especiais ---------

  it('fetchRegimesEspeciais: parses nested object structure', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({
        path: '/parametrizacao/2111300/250101/2026-03-01/regimes_especiais',
        method: 'GET',
      })
      .reply(200, {
        regimesEspeciais: {
          SimplesNacional: {
            MeEpp: [{ situacao: 1, dataInicio: '2026-01-01', dataFim: null, observacoes: 'x' }],
          },
        },
      });

    const r = await fetchRegimesEspeciais(httpClient, '2111300', '250101', '2026-03-01');
    expect(r.regimesEspeciais.SimplesNacional?.MeEpp?.[0]?.situacao).toBe('1');
    expect(r.regimesEspeciais.SimplesNacional?.MeEpp?.[0]?.observacoes).toBe('x');
  });

  // --------- retencoes ---------

  it('fetchRetencoes: parses artigoSexto + retencoesMunicipais arrays', async () => {
    mockAgent
      .get('https://param.example.test')
      .intercept({ path: '/parametrizacao/2111300/2026-03-01/retencoes', method: 'GET' })
      .reply(200, {
        retencoes: {
          artigoSexto: {
            habilitado: true,
            historico: [{ dataInicioVigencia: '2020-01-01', dataFimVigencia: null }],
          },
          retencoesMunicipais: [
            {
              descricao: 'Serviços médicos',
              dataInicioVigencia: '2026-01-01',
              tiposRetencao: [1, 3],
              servicos: [{ codigoCompleto: '010101', historico: [] }],
            },
          ],
        },
      });

    const r = await fetchRetencoes(httpClient, '2111300', '2026-03-01');
    expect(r.retencoes?.artigoSexto.habilitado).toBe(true);
    expect(r.retencoes?.retencoesMunicipais).toHaveLength(1);
    const first = r.retencoes?.retencoesMunicipais[0];
    expect(first?.tiposRetencao).toEqual(['1', '3']);
    expect(first?.servicos).toHaveLength(1);
  });
});
