import { OpenNfseError } from './base.js';

export abstract class ValidationError extends OpenNfseError {}

export class InvalidChaveAcessoError extends ValidationError {
  constructor(
    public readonly value: string,
    options?: { cause?: unknown },
  ) {
    super(
      `Chave de acesso inválida: "${value}". Deve conter exatamente 50 dígitos numéricos.`,
      options,
    );
  }
}

export class InvalidXmlError extends ValidationError {
  constructor(detalhe: string, options?: { cause?: unknown }) {
    super(`XML inválido: ${detalhe}`, options);
  }
}
