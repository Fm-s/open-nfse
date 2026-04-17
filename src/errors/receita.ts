import { OpenNfseError } from './base.js';

export class ReceitaRejectionError extends OpenNfseError {
  constructor(
    public readonly code: string,
    public readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`Rejeição da Receita [${code}]: ${reason}`, options);
  }
}
