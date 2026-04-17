import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  HttpStatusError,
  NetworkError,
  NotFoundError,
  ServerError,
  UnauthorizedError,
} from '../errors/http.js';
import { HttpClient } from './client.js';

describe('HttpClient', () => {
  const baseUrl = 'https://example.test';
  let mockAgent: MockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
  });

  afterEach(async () => {
    await mockAgent.close();
  });

  it('performs a GET and parses the JSON body', async () => {
    mockAgent
      .get(baseUrl)
      .intercept({ path: '/foo', method: 'GET' })
      .reply(200, { hello: 'world' });

    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    const res = await client.get<{ hello: string }>('/foo');
    expect(res.hello).toBe('world');
  });

  it('performs a POST with a JSON body and content-type', async () => {
    mockAgent
      .get(baseUrl)
      .intercept({
        path: '/bar',
        method: 'POST',
        body: JSON.stringify({ x: 1 }),
      })
      .reply(200, { ok: true });

    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    const res = await client.post<{ ok: boolean }>('/bar', { x: 1 });
    expect(res.ok).toBe(true);
  });

  it('throws NotFoundError on 404 with status and body exposed', async () => {
    mockAgent
      .get(baseUrl)
      .intercept({ path: '/missing', method: 'GET' })
      .reply(404, 'não encontrado');

    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    try {
      await client.get('/missing');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      const httpErr = err as NotFoundError;
      expect(httpErr.status).toBe(404);
      expect(httpErr.body).toContain('não encontrado');
    }
  });

  it('throws UnauthorizedError on 401', async () => {
    mockAgent.get(baseUrl).intercept({ path: '/private', method: 'GET' }).reply(401, 'nope');
    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    await expect(client.get('/private')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws ForbiddenError on 403', async () => {
    mockAgent.get(baseUrl).intercept({ path: '/forbidden', method: 'GET' }).reply(403, 'blocked');
    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    await expect(client.get('/forbidden')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ServerError on 5xx with the original status preserved', async () => {
    mockAgent.get(baseUrl).intercept({ path: '/boom', method: 'GET' }).reply(503, 'busy');
    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    try {
      await client.get('/boom');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ServerError);
      expect((err as ServerError).status).toBe(503);
    }
  });

  it('attaches response headers (lowercased) to HttpStatusError — e.g. Retry-After on 429', async () => {
    mockAgent
      .get(baseUrl)
      .intercept({ path: '/throttled', method: 'GET' })
      .reply(429, 'Too Many Requests', {
        headers: { 'Retry-After': '42', 'X-Custom': 'whatever' },
      });

    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    try {
      await client.get('/throttled');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpStatusError);
      const httpErr = err as HttpStatusError;
      expect(httpErr.status).toBe(429);
      expect(httpErr.headers['retry-after']).toBe('42');
      expect(httpErr.headers['x-custom']).toBe('whatever');
    }
  });

  it('falls back to generic HttpStatusError for unmapped 4xx (e.g. 422)', async () => {
    mockAgent.get(baseUrl).intercept({ path: '/rejected', method: 'GET' }).reply(422, 'regra');
    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    try {
      await client.get('/rejected');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpStatusError);
      expect(err).not.toBeInstanceOf(NotFoundError);
      expect((err as HttpStatusError).status).toBe(422);
    }
  });

  it('throws NetworkError when the body is not valid JSON', async () => {
    mockAgent.get(baseUrl).intercept({ path: '/weird', method: 'GET' }).reply(200, 'not json');

    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    await expect(client.get('/weird')).rejects.toBeInstanceOf(NetworkError);
  });

  it('normalizes trailing slash on baseUrl and missing leading slash on path', async () => {
    mockAgent.get(baseUrl).intercept({ path: '/foo', method: 'GET' }).reply(200, { ok: true });

    const client = new HttpClient({ baseUrl: `${baseUrl}/`, dispatcher: mockAgent });
    await expect(client.get('foo')).resolves.toEqual({ ok: true });
  });

  it('emits debug logs for request and response when a logger is provided', async () => {
    const calls: Array<{ level: string; message: string; context?: Record<string, unknown> }> = [];
    const logger = {
      debug(message: string, context?: Record<string, unknown>) {
        calls.push({ level: 'debug', message, ...(context ? { context } : {}) });
      },
      info() {},
      warn() {},
      error() {},
    };

    mockAgent.get(baseUrl).intercept({ path: '/logged', method: 'GET' }).reply(200, { ok: true });
    const client = new HttpClient({ baseUrl, dispatcher: mockAgent, logger });
    await client.get('/logged');

    const events = calls.map((c) => c.message);
    expect(events).toEqual(['http.request', 'http.response']);
    expect(calls[0]?.context).toMatchObject({ method: 'GET', url: `${baseUrl}/logged` });
    expect(calls[1]?.context).toMatchObject({
      method: 'GET',
      url: `${baseUrl}/logged`,
      status: 200,
    });
    expect(typeof (calls[1]?.context as { latencyMs?: number })?.latencyMs).toBe('number');
  });

  it('falls back silently to no-op logging when no logger is provided', async () => {
    mockAgent.get(baseUrl).intercept({ path: '/silent', method: 'GET' }).reply(200, {});
    const client = new HttpClient({ baseUrl, dispatcher: mockAgent });
    await expect(client.get('/silent')).resolves.toEqual({});
  });
});
