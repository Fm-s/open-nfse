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

/**
 * Cap defensivo no tamanho do response body antes de `JSON.parse` / buffer
 * materialization. As respostas reais da Receita (NFS-e, eventos, ADN) são
 * dezenas de KB no pior caso; 10 MB é ~100× acima do esperado e ainda assim
 * protege contra reverse proxies mal configurados, WAFs retornando HTML
 * gigante, ou responses corrompidas.
 */
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

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

  /**
   * HEAD — verifica existência sem baixar o body. Retorna o status code em
   * caso de 2xx, lança o erro mapeado em 4xx/5xx (a menos que o status esteja
   * em `acceptedStatuses`).
   */
  async head(path: string, options?: RequestOptions): Promise<number> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    this.logger.debug('http.request', { method: 'HEAD', url });
    const startedAt = Date.now();

    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(url, {
        method: 'HEAD',
        dispatcher: this.dispatcher,
        bodyTimeout: this.timeoutMs,
        headersTimeout: this.timeoutMs,
      });
    } catch (cause) {
      throw this.mapTransportError(cause);
    }
    // Drena o body (HEAD não deveria ter, mas undici às vezes devolve — evita
    // socket leak).
    try {
      await response.body.dump();
    } catch {
      /* ignore */
    }
    this.logger.debug('http.response', {
      method: 'HEAD',
      url,
      status: response.statusCode,
      latencyMs: Date.now() - startedAt,
    });

    const accepted = options?.acceptedStatuses ?? [];
    if (response.statusCode >= 400 && !accepted.includes(response.statusCode)) {
      throw mapStatusError(response.statusCode, undefined, response.headers);
    }
    return response.statusCode;
  }

  /**
   * GET binário — devolve o corpo cru como `Buffer` em vez de parsear JSON.
   * Usado pelo endpoint DANFSe (`application/pdf`). Segue as mesmas regras
   * de timeout, mTLS e `acceptedStatuses`.
   */
  async getPdf(path: string, options?: RequestOptions): Promise<Buffer> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    this.logger.debug('http.request', { method: 'GET', url });
    const startedAt = Date.now();

    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(url, {
        method: 'GET',
        headers: { accept: 'application/pdf' },
        dispatcher: this.dispatcher,
        bodyTimeout: this.timeoutMs,
        headersTimeout: this.timeoutMs,
      });
    } catch (cause) {
      throw this.mapTransportError(cause);
    }

    let buf: Buffer;
    try {
      buf = await readBodyBuffer(response.body);
    } catch (cause) {
      throw this.mapTransportError(cause);
    }
    this.logger.debug('http.response', {
      method: 'GET',
      url,
      status: response.statusCode,
      latencyMs: Date.now() - startedAt,
    });

    const accepted = options?.acceptedStatuses ?? [];
    if (response.statusCode >= 400 && !accepted.includes(response.statusCode)) {
      throw mapStatusError(
        response.statusCode,
        buf.toString('utf-8').slice(0, 200),
        response.headers,
      );
    }
    return buf;
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

    let responseBody: string;
    try {
      responseBody = (await readBodyBuffer(response.body)).toString('utf-8');
    } catch (cause) {
      throw this.mapTransportError(cause);
    }
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

/**
 * Lê o corpo do response em chunks, abortando se passar de
 * `MAX_RESPONSE_BYTES`. Evita que um proxy mal configurado, uma página HTML
 * gigante de WAF ou um response corrompido explodam a heap do processo.
 */
async function readBodyBuffer(stream: Dispatcher.ResponseData['body']): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      // Consome o resto do stream para não vazar o socket e então lança.
      stream.destroy?.();
      throw new NetworkError(
        `response body excedeu limite de ${MAX_RESPONSE_BYTES} bytes — provavelmente proxy/WAF devolveu payload inesperado`,
      );
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks, total);
}
