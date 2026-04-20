import { OpenNfseError } from './base.js';

export abstract class ValidationError extends OpenNfseError {}

export class InvalidCpfError extends ValidationError {
  constructor(
    public readonly cpf: string,
    public readonly reason: 'format' | 'check_digit' | 'known_invalid',
  ) {
    const texto = {
      format: 'formato inválido (esperado 11 dígitos sem máscara)',
      check_digit: 'dígitos verificadores não conferem',
      known_invalid: 'sequência repetida inválida',
    }[reason];
    super(`CPF "${cpf}" ${texto}`);
  }
}

export class InvalidCnpjError extends ValidationError {
  constructor(
    public readonly cnpj: string,
    public readonly reason: 'format' | 'check_digit' | 'known_invalid',
  ) {
    const texto = {
      format: 'formato inválido (esperado 14 dígitos sem máscara)',
      check_digit: 'dígitos verificadores não conferem',
      known_invalid: 'sequência repetida inválida',
    }[reason];
    super(`CNPJ "${cnpj}" ${texto}`);
  }
}

export class InvalidCepError extends ValidationError {
  constructor(
    public readonly cep: string,
    public readonly reason: 'format' | 'not_found' | 'api_unavailable',
    detalhe?: string,
  ) {
    const reasonText = {
      format: 'formato inválido (esperado 8 dígitos sem máscara)',
      not_found: 'não encontrado nos Correios',
      api_unavailable: 'API de consulta indisponível',
    }[reason];
    super(`CEP "${cep}" ${reasonText}${detalhe ? `: ${detalhe}` : ''}`);
  }
}

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

export class InvalidIdDpsError extends ValidationError {
  constructor(
    public readonly value: string,
    options?: { cause?: unknown },
  ) {
    super(
      `Id do DPS inválido: "${value}". Deve bater com o pattern "DPS" + 42 dígitos (TSIdDPS do RTC v1.01).`,
      options,
    );
  }
}

export class InvalidXmlError extends ValidationError {
  constructor(detalhe: string, options?: { cause?: unknown }) {
    super(`XML inválido: ${detalhe}`, options);
  }
}

/** Uma violação de XSD individual. */
export interface XsdViolation {
  readonly message: string;
  readonly line?: number;
}

/**
 * Violação de regra de negócio local. Usado para regras que o lib verifica
 * antes de ir para a rede — tipicamente regras enumeradas no Manual do
 * Contribuinte / Anexo I (e.g. E0078: cMotivo=99 exige xMotivo) que evitamos
 * disparar um round-trip inútil + queima de `nDPS`.
 */
export class RuleViolationError extends ValidationError {
  readonly rule: string | undefined;
  constructor(message: string, rule?: string) {
    super(message);
    this.rule = rule;
  }
}

/**
 * Lançado quando um XML falha validação XSD contra a RTC v1.01. Carrega a
 * lista completa de violações detectadas pelo xmllint — útil para mostrar
 * todos os erros de uma vez em vez de só o primeiro.
 */
export class XsdValidationError extends ValidationError {
  readonly violations: readonly XsdViolation[];

  constructor(violations: readonly XsdViolation[], options?: { cause?: unknown }) {
    const first = violations[0];
    const extras = violations.length - 1;
    const sufixo = extras > 0 ? ` (+${extras} violação${extras > 1 ? 'ões' : ''})` : '';
    const base = first ? first.message : 'violação desconhecida';
    super(`Validação XSD falhou: ${base}${sufixo}`, options);
    this.violations = violations;
  }
}
