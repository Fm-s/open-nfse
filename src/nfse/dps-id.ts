import { ValidationError } from '../errors/validation.js';

export type TipoInscricaoEmitente = 'CNPJ' | 'CPF';

export interface BuildDpsIdParams {
  /** Código IBGE do município emissor (7 dígitos). */
  readonly cLocEmi: string;
  /** Tipo de inscrição federal do emitente. */
  readonly tipoInsc: TipoInscricaoEmitente;
  /**
   * CNPJ (14 caracteres, alfanumérico maiúsculo — IN RFB nº 2.229/2024) ou
   * CPF (11 dígitos). Sem máscara; zeros à esquerda preservados.
   */
  readonly inscricaoFederal: string;
  /** Série do DPS (1 a 5 dígitos; séries de 5 dígitos vão até 89999). */
  readonly serie: string;
  /** Número do DPS (1 a 15 dígitos). */
  readonly nDPS: string;
}

export class InvalidDpsIdParamError extends ValidationError {
  constructor(
    public readonly field: keyof BuildDpsIdParams,
    public readonly value: string,
    detail: string,
  ) {
    super(`Parâmetro inválido para ID do DPS (${field}="${value}"): ${detail}`);
  }
}

const REGEX_COD_MUN = /^\d{7}$/;
// TSCNPJ (bundle RTC v1.01-20260727): CNPJ alfanumérico, `[0-9A-Z]{14}`.
const REGEX_CNPJ = /^[0-9A-Z]{14}$/;
const REGEX_CPF = /^\d{11}$/;
// TSSerieDPS (bundle 20260727): `[0-9]{1,4}|[0-8][0-9]{4}` — 90000–99999 é inválido.
const REGEX_SERIE = /^(?:[0-9]{1,4}|[0-8][0-9]{4})$/;
// TSNumDPS: primeiro dígito 1-9 (sem zero à esquerda), 1 a 15 dígitos. O <nDPS>
// emitido no XML segue esse pattern; o Id usa padStart e tolera zeros.
const REGEX_NDPS = /^[1-9]\d{0,14}$/;

export function buildDpsId(params: BuildDpsIdParams): string {
  const { cLocEmi, tipoInsc, inscricaoFederal, serie, nDPS } = params;

  if (!REGEX_COD_MUN.test(cLocEmi)) {
    throw new InvalidDpsIdParamError('cLocEmi', cLocEmi, 'deve conter exatamente 7 dígitos.');
  }

  let inscFormatted: string;
  let digitoTipo: '1' | '2';
  if (tipoInsc === 'CNPJ') {
    if (!REGEX_CNPJ.test(inscricaoFederal)) {
      throw new InvalidDpsIdParamError(
        'inscricaoFederal',
        inscricaoFederal,
        'CNPJ deve conter 14 caracteres alfanuméricos maiúsculos (0-9, A-Z).',
      );
    }
    digitoTipo = '2';
    inscFormatted = inscricaoFederal;
  } else {
    if (!REGEX_CPF.test(inscricaoFederal)) {
      throw new InvalidDpsIdParamError(
        'inscricaoFederal',
        inscricaoFederal,
        'CPF deve conter 11 dígitos.',
      );
    }
    digitoTipo = '1';
    inscFormatted = inscricaoFederal.padStart(14, '0');
  }

  if (!REGEX_SERIE.test(serie)) {
    throw new InvalidDpsIdParamError('serie', serie, 'deve conter 1 a 5 dígitos (máximo 89999).');
  }
  if (!REGEX_NDPS.test(nDPS)) {
    throw new InvalidDpsIdParamError(
      'nDPS',
      nDPS,
      'deve conter 1 a 15 dígitos, sem zero à esquerda.',
    );
  }

  return `DPS${cLocEmi}${digitoTipo}${inscFormatted}${serie.padStart(5, '0')}${nDPS.padStart(15, '0')}`;
}
