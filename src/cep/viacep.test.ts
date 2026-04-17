import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidCepError } from '../errors/validation.js';
import type { CepInfo } from './types.js';
import { createViaCepValidator } from './viacep.js';

describe('createViaCepValidator', () => {
  const endpoint = 'https://viacep.example.test/ws';
  let mockAgent: MockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  it('returns normalized CepInfo on a ViaCEP success payload', async () => {
    mockAgent
      .get('https://viacep.example.test')
      .intercept({ path: '/ws/01310100/json/', method: 'GET' })
      .reply(200, {
        cep: '01310-100',
        logradouro: 'Avenida Paulista',
        complemento: 'de 612 a 1510',
        bairro: 'Bela Vista',
        localidade: 'São Paulo',
        uf: 'SP',
        ibge: '3550308',
      });

    const v = createViaCepValidator({ endpoint, dispatcher: mockAgent });
    const info = await v.validate('01310100');
    expect(info).toEqual({
      cep: '01310100',
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      localidade: 'São Paulo',
      uf: 'SP',
      ibge: '3550308',
    });
  });

  it('strips dashes/spaces from the input CEP before lookup', async () => {
    mockAgent
      .get('https://viacep.example.test')
      .intercept({ path: '/ws/01310100/json/', method: 'GET' })
      .reply(200, { cep: '01310-100', uf: 'SP' });

    const v = createViaCepValidator({ endpoint, dispatcher: mockAgent });
    const info = await v.validate('01310-100');
    expect(info.cep).toBe('01310100');
  });

  it('throws InvalidCepError(format) for malformed input without hitting the network', async () => {
    const v = createViaCepValidator({ endpoint, dispatcher: mockAgent });
    await expect(v.validate('abc')).rejects.toMatchObject({
      name: 'InvalidCepError',
      reason: 'format',
    });
    await expect(v.validate('123')).rejects.toMatchObject({ reason: 'format' });
    expect(() => mockAgent.assertNoPendingInterceptors()).not.toThrow();
  });

  it('throws InvalidCepError(not_found) when ViaCEP returns { erro: true }', async () => {
    mockAgent
      .get('https://viacep.example.test')
      .intercept({ path: '/ws/99999999/json/', method: 'GET' })
      .reply(200, { erro: true });

    const v = createViaCepValidator({ endpoint, dispatcher: mockAgent });
    await expect(v.validate('99999999')).rejects.toMatchObject({
      name: 'InvalidCepError',
      reason: 'not_found',
    });
  });

  it('throws InvalidCepError(not_found) when ViaCEP returns { erro: "true" } (string)', async () => {
    mockAgent
      .get('https://viacep.example.test')
      .intercept({ path: '/ws/99999998/json/', method: 'GET' })
      .reply(200, { erro: 'true' });

    const v = createViaCepValidator({ endpoint, dispatcher: mockAgent });
    await expect(v.validate('99999998')).rejects.toMatchObject({ reason: 'not_found' });
  });

  it('throws InvalidCepError(api_unavailable) on 5xx', async () => {
    mockAgent
      .get('https://viacep.example.test')
      .intercept({ path: '/ws/01310100/json/', method: 'GET' })
      .reply(503, 'Service Unavailable');

    const v = createViaCepValidator({ endpoint, dispatcher: mockAgent });
    await expect(v.validate('01310100')).rejects.toMatchObject({ reason: 'api_unavailable' });
  });

  it('caches successful lookups in the supplied Map', async () => {
    mockAgent
      .get('https://viacep.example.test')
      .intercept({ path: '/ws/01310100/json/', method: 'GET' })
      .reply(200, { cep: '01310-100', uf: 'SP' });
    // segunda chamada — sem interceptor registrado; se a lib tentar HTTP, quebra

    const cache = new Map<string, CepInfo>();
    const v = createViaCepValidator({ endpoint, dispatcher: mockAgent, cache });

    const first = await v.validate('01310100');
    const second = await v.validate('01310100');
    expect(first).toBe(second); // mesma referência via cache
    expect(cache.get('01310100')).toBe(first);
  });
});
