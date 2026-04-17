import { Agent, type Dispatcher, errors as UndiciErrors, request } from 'undici';
import type { A1Certificate } from '../certificate/types.js';
import {
  ForbiddenError,
  HttpStatusError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  UnauthorizedError,
} from '../errors/http.js';
import { type Logger, noopLogger } from '../logging.js';

export interface HttpClientConfig {
  readonly baseUrl: string;
  readonly dispatcher: Dispatcher;
  readonly timeoutMs?: number;
  readonly logger?: Logger;
}

export interface RequestOptions {
  /**
   * HTTP status codes that should be treated as valid responses (body parsed
   * and returned) instead of being mapped to an error. Use for endpoints where
   * 4xx codes carry meaningful payloads — e.g. ADN Contribuintes returns 404
   * with a "no documents found" body on the NSU endpoint.
   */
  readonly acceptedStatuses?: readonly number[];
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly dispatcher: Dispatcher;
  private readonly timeoutMs: number;
  private readonly logger: Logger;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.dispatcher = config.dispatcher;
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.logger = config.logger ?? noopLogger;
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.execute<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    return this.execute<T>('POST', path, body, options);
  }

  private async execute<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = { accept: 'application/json' };
    let requestBody: string | null = null;
    if (body !== undefined) {
      requestBody = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }

    this.logger.debug('http.request', { method, url });
    const startedAt = Date.now();

    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(url, {
        method,
        headers,
        body: requestBody,
        dispatcher: this.dispatcher,
        bodyTimeout: this.timeoutMs,
        headersTimeout: this.timeoutMs,
      });
    } catch (cause) {
      throw this.mapTransportError(cause);
    }

    const responseBody = await response.body.text();
    this.logger.debug('http.response', {
      method,
      url,
      status: response.statusCode,
      latencyMs: Date.now() - startedAt,
    });

    const accepted = options.acceptedStatuses ?? [];
    if (response.statusCode >= 400 && !accepted.includes(response.statusCode)) {
      throw mapStatusError(response.statusCode, responseBody, response.headers);
    }

    if (responseBody.length === 0) {
      return undefined as T;
    }

    try {
      return JSON.parse(responseBody) as T;
    } catch (cause) {
      throw new NetworkError(`resposta JSON inválida: ${responseBody.slice(0, 200)}`, { cause });
    }
  }

  private mapTransportError(cause: unknown): Error {
    if (
      cause instanceof UndiciErrors.HeadersTimeoutError ||
      cause instanceof UndiciErrors.BodyTimeoutError ||
      cause instanceof UndiciErrors.ConnectTimeoutError
    ) {
      return new TimeoutError(this.timeoutMs, { cause });
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    return new NetworkError(message, { cause });
  }
}

export function createMtlsDispatcher(certificate: A1Certificate): Dispatcher {
  return new Agent({
    allowH2: false,
    connect: {
      key: certificate.keyPem,
      cert: certificate.certPem,
      // SEFIN Nacional rejects HTTP/2 on authenticated paths with
      // HTTP_1_1_REQUIRED. Force HTTP/1.1 at the ALPN layer so the server
      // never negotiates H2 in the first place.
      ALPNProtocols: ['http/1.1'],
    },
  });
}

function mapStatusError(
  status: number,
  body: string | undefined,
  rawHeaders: Record<string, string | string[] | undefined>,
): HttpStatusError {
  const headers = normalizeHeaders(rawHeaders);
  const options = { headers };
  if (status === 401) return new UnauthorizedError(body, options);
  if (status === 403) return new ForbiddenError(body, options);
  if (status === 404) return new NotFoundError(body, options);
  if (status >= 500) return new ServerError(status, body, options);
  return new HttpStatusError(status, body, options);
}

function normalizeHeaders(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? (value[0] ?? '') : value;
  }
  return out;
}
