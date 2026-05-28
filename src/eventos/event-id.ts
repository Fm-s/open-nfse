import { ValidationError } from '../errors/validation.js';

/**
 * Per Anexo II do SEFIN_ADN v1.00-20251226 (publicado 2025-12-27):
 * `PRE` + chave(50) + tipoEvento(6) = 59 chars. Pattern `PRE[0-9]{56}`.
 *
 * **Mudança breaking vs RTC v1.01 original**: o `nPedRegEvento` (3 dígitos)
 * foi removido tanto da composição do `Id` quanto do corpo de `infPedReg`.
 * Manter o formato antigo causa rejeição E1235 ("Falha no esquema XML do
 * DF-e — The Pattern constraint failed") em produção.
 */
export interface BuildEventoPedidoIdParams {
  readonly chaveAcesso: string;
  readonly tipoEvento: string;
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

export function buildEventoPedidoId(params: BuildEventoPedidoIdParams): string {
  const { chaveAcesso, tipoEvento } = params;
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
  return `PRE${chaveAcesso}${tipoEvento}`;
}
