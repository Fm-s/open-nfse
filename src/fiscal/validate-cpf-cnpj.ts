import { InvalidCnpjError, InvalidCpfError } from '../errors/validation.js';

const CPF_REGEX = /^\d{11}$/;
// CNPJ alfanumérico (IN RFB nº 2.229/2024, vigente desde julho/2026): 12 posições
// alfanuméricas maiúsculas + 2 dígitos verificadores sempre numéricos.
const CNPJ_REGEX = /^[A-Z0-9]{12}\d{2}$/;

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
 * Valida um CNPJ conforme o algoritmo oficial da Receita Federal, incluindo o
 * CNPJ alfanumérico (IN RFB nº 2.229/2024): 12 posições `[A-Z0-9]` + 2 dígitos
 * verificadores numéricos (módulo 11 com pesos `[5,4,3,2,9,8,7,6,5,4,3,2]` e
 * depois `[6,5,4,3,2,9,8,7,6,5,4,3,2]`). No cálculo do DV cada caractere vale
 * seu código ASCII menos 48 (dígitos mantêm 0–9; A=17 … Z=42).
 *
 * Nota: o leiaute da NFS-e Nacional só passa a aceitar CNPJ alfanumérico na
 * DPS com a NT 009/2026 (campos N → C); até lá, um CNPJ com letras é válido
 * aqui mas rejeitado na validação XSD da emissão.
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

  // ASCII − 48: dígitos mantêm o valor 0–9, letras A–Z valem 17–42.
  const digits = cnpj.split('').map((c) => c.charCodeAt(0) - 48);
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
