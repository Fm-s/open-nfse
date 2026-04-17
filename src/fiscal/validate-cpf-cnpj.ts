import { InvalidCnpjError, InvalidCpfError } from '../errors/validation.js';

const CPF_REGEX = /^\d{11}$/;
const CNPJ_REGEX = /^\d{14}$/;

/**
 * Valida um CPF conforme o algoritmo oficial da Receita Federal:
 * formato (11 dígitos) + dígitos verificadores (módulo 11 sobre os 9 primeiros,
 * depois sobre os 10 primeiros).
 *
 * Lança `InvalidCpfError` com `reason: 'format' | 'known_invalid' | 'check_digit'`.
 */
export function validateCpf(cpf: string): void {
  if (!CPF_REGEX.test(cpf)) {
    throw new InvalidCpfError(cpf, 'format');
  }
  if (/^(\d)\1{10}$/.test(cpf)) {
    // CPFs como 00000000000, 11111111111 etc. passam pelo check-digit mas
    // são rejeitados pela Receita.
    throw new InvalidCpfError(cpf, 'known_invalid');
  }

  const digits = cpf.split('').map(Number);
  if (checkDigit(digits.slice(0, 9), 10) !== digits[9]) {
    throw new InvalidCpfError(cpf, 'check_digit');
  }
  if (checkDigit(digits.slice(0, 10), 11) !== digits[10]) {
    throw new InvalidCpfError(cpf, 'check_digit');
  }
}

/**
 * Valida um CNPJ conforme o algoritmo oficial da Receita Federal:
 * formato (14 dígitos) + dígitos verificadores (módulo 11 com pesos
 * `[5,4,3,2,9,8,7,6,5,4,3,2]` e depois `[6,5,4,3,2,9,8,7,6,5,4,3,2]`).
 *
 * Lança `InvalidCnpjError` com `reason: 'format' | 'known_invalid' | 'check_digit'`.
 */
export function validateCnpj(cnpj: string): void {
  if (!CNPJ_REGEX.test(cnpj)) {
    throw new InvalidCnpjError(cnpj, 'format');
  }
  if (/^(\d)\1{13}$/.test(cnpj)) {
    throw new InvalidCnpjError(cnpj, 'known_invalid');
  }

  const digits = cnpj.split('').map(Number);
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  if (checkDigitWeighted(digits.slice(0, 12), weights1) !== digits[12]) {
    throw new InvalidCnpjError(cnpj, 'check_digit');
  }
  if (checkDigitWeighted(digits.slice(0, 13), weights2) !== digits[13]) {
    throw new InvalidCnpjError(cnpj, 'check_digit');
  }
}

// Algoritmo CPF: pesos decrescentes começando em `startWeight`.
function checkDigit(digits: number[], startWeight: number): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += (digits[i] as number) * (startWeight - i);
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

// Algoritmo CNPJ: pesos fixos por posição.
function checkDigitWeighted(digits: number[], weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += (digits[i] as number) * (weights[i] as number);
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}
