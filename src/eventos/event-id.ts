import { ValidationError } from '../errors/validation.js';

/**
 * Per Anexo II do SEFIN_ADN v1.01-20260122: `PRE` + chave(50) + tipoEvento(6)
 * = 59 chars. Pattern TSIdPedRegEvt (bundle RTC v1.01-20260727, CNPJ
 * alfanumérico): `PRE[0-9]{8}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{33}` — na chave,
 * posições 1–8 = cMun+ambGer, 9 = tpInsc (1=CPF, 2=CNPJ), 10–23 = inscrição
 * federal (alfanumérica quando CNPJ), 24–50 numéricas.
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

// Derivado do TSIdPedRegEvt: a chave embutida no Id precisa casar com este
// recorte (o Id composto é validado pelo XSD do pedRegEvento no envio).
const REGEX_CHAVE = /^[0-9]{8}(?:1[0-9]{14}|2[0-9A-Z]{14})[0-9]{27}$/;
const REGEX_TIPO_EVENTO = /^\d{6}$/;

export function buildEventoPedidoId(params: BuildEventoPedidoIdParams): string {
  const { chaveAcesso, tipoEvento } = params;
  if (!REGEX_CHAVE.test(chaveAcesso)) {
    throw new InvalidEventoPedidoIdParamError(
      'chaveAcesso',
      chaveAcesso,
      'deve conter 50 caracteres no formato da chave de acesso (posição 9 = tpInsc 1|2; inscrição federal alfanumérica apenas quando tpInsc=2).',
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
