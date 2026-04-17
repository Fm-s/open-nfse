import { ValidationError } from '../errors/validation.js';

export type TipoInscricaoEmitente = 'CNPJ' | 'CPF';

export interface BuildDpsIdParams {
  /** Código IBGE do município emissor (7 dígitos). */
  readonly cLocEmi: string;
  /** Tipo de inscrição federal do emitente. */
  readonly tipoInsc: TipoInscricaoEmitente;
  /** CNPJ (14 dígitos) ou CPF (11 dígitos). Sem máscara; zeros à esquerda preservados. */
  readonly inscricaoFederal: string;
  /** Série do DPS (1 a 5 dígitos). */
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
const REGEX_CNPJ = /^\d{14}$/;
const REGEX_CPF = /^\d{11}$/;
const REGEX_SERIE = /^\d{1,5}$/;
const REGEX_NDPS = /^\d{1,15}$/;

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
        'CNPJ deve conter 14 dígitos.',
      );
    }
    digitoTipo = '1';
    inscFormatted = inscricaoFederal;
  } else {
    if (!REGEX_CPF.test(inscricaoFederal)) {
      throw new InvalidDpsIdParamError(
        'inscricaoFederal',
        inscricaoFederal,
        'CPF deve conter 11 dígitos.',
      );
    }
    digitoTipo = '2';
    inscFormatted = inscricaoFederal.padStart(14, '0');
  }

  if (!REGEX_SERIE.test(serie)) {
    throw new InvalidDpsIdParamError('serie', serie, 'deve conter 1 a 5 dígitos.');
  }
  if (!REGEX_NDPS.test(nDPS)) {
    throw new InvalidDpsIdParamError('nDPS', nDPS, 'deve conter 1 a 15 dígitos.');
  }

  return `DPS${cLocEmi}${digitoTipo}${inscFormatted}${serie.padStart(5, '0')}${nDPS.padStart(15, '0')}`;
}
