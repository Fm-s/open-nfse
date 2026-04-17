import { ValidationError } from '../errors/validation.js';

/**
 * Per XSD `TSIdPedRefEvt`: `PRE` + chave(50) + tipoEvento(6) + nPedReg(3).
 * Total 62 chars. Pattern `PRE[0-9]{59}`.
 */
export interface BuildEventoPedidoIdParams {
  readonly chaveAcesso: string;
  readonly tipoEvento: string;
  readonly nPedRegEvento: string;
}

export class InvalidEventoPedidoIdParamError extends ValidationError {
  constructor(
    public readonly field: keyof BuildEventoPedidoIdParams,
    public readonly value: string,
    detail: string,
  ) {
    super(`Parâmetro inválido para ID do pedido de evento (${field}="${value}"): ${detail}`);
  }
}

const REGEX_CHAVE = /^\d{50}$/;
const REGEX_TIPO_EVENTO = /^\d{6}$/;
const REGEX_N_PED_REG = /^\d{1,3}$/;

export function buildEventoPedidoId(params: BuildEventoPedidoIdParams): string {
  const { chaveAcesso, tipoEvento, nPedRegEvento } = params;
  if (!REGEX_CHAVE.test(chaveAcesso)) {
    throw new InvalidEventoPedidoIdParamError(
      'chaveAcesso',
      chaveAcesso,
      'deve conter exatamente 50 dígitos.',
    );
  }
  if (!REGEX_TIPO_EVENTO.test(tipoEvento)) {
    throw new InvalidEventoPedidoIdParamError(
      'tipoEvento',
      tipoEvento,
      'deve conter exatamente 6 dígitos.',
    );
  }
  if (!REGEX_N_PED_REG.test(nPedRegEvento)) {
    throw new InvalidEventoPedidoIdParamError(
      'nPedRegEvento',
      nPedRegEvento,
      'deve conter 1 a 3 dígitos.',
    );
  }
  return `PRE${chaveAcesso}${tipoEvento}${nPedRegEvento.padStart(3, '0')}`;
}
