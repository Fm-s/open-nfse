import { OpenNfseError } from './base.js';

export abstract class HttpError extends OpenNfseError {}

export class NetworkError extends HttpError {
  constructor(detalhe: string, options?: { cause?: unknown }) {
    super(`Erro de rede: ${detalhe}`, options);
  }
}

export class TimeoutError extends HttpError {
  constructor(
    public readonly timeoutMs: number,
    options?: { cause?: unknown },
  ) {
    super(`Requisição excedeu ${timeoutMs}ms.`, options);
  }
}

export interface HttpStatusErrorOptions {
  readonly cause?: unknown;
  readonly headers?: Record<string, string>;
}

export class HttpStatusError extends HttpError {
  public readonly headers: Readonly<Record<string, string>>;

  constructor(
    public readonly status: number,
    public readonly body: string | undefined,
    options?: HttpStatusErrorOptions,
  ) {
    super(`HTTP ${status}`, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.headers = options?.headers ?? {};
  }
}

export class UnauthorizedError extends HttpStatusError {
  constructor(body: string | undefined, options?: HttpStatusErrorOptions) {
    super(401, body, options);
    this.message =
      'Requisição não autorizada (HTTP 401). Verifique se o certificado A1 está válido, não está expirado e foi apresentado na conexão.';
  }
}

export class ForbiddenError extends HttpStatusError {
  constructor(body: string | undefined, options?: HttpStatusErrorOptions) {
    super(403, body, options);
    this.message =
      'Acesso proibido (HTTP 403). O CNPJ do certificado pode não estar habilitado no Emissor Nacional, ou o ator não tem permissão para acessar este recurso.';
  }
}

export class NotFoundError extends HttpStatusError {
  constructor(body: string | undefined, options?: HttpStatusErrorOptions) {
    super(404, body, options);
    this.message =
      'Recurso não encontrado (HTTP 404). A chave de acesso, NSU ou identificador consultado não existe na Receita.';
  }
}

export class ServerError extends HttpStatusError {
  constructor(status: number, body: string | undefined, options?: HttpStatusErrorOptions) {
    super(status, body, options);
    this.message = `Falha no servidor da Receita (HTTP ${status}). Provavelmente transitória — tente novamente em alguns minutos.`;
  }
}
