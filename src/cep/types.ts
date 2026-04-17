/** Informações canônicas sobre um CEP, normalizadas entre provedores. */
export interface CepInfo {
  /** CEP normalizado (apenas dígitos, 8 caracteres). */
  readonly cep: string;
  readonly logradouro?: string;
  readonly bairro?: string;
  /** Município, conforme retornado pelo provedor. */
  readonly localidade?: string;
  /** Sigla de UF (2 letras). */
  readonly uf?: string;
  /** Código IBGE do município, quando disponível. */
  readonly ibge?: string;
}

/**
 * Validador de CEP pluggable. Implementações podem consultar ViaCEP,
 * BrasilAPI, o banco de endereços dos Correios, um cache local, etc.
 *
 * Contrato:
 *  - Se o formato for inválido → lance `InvalidCepError('format')`.
 *  - Se o CEP não existir → lance `InvalidCepError('not_found')`.
 *  - Se a API externa falhar → lance `InvalidCepError('api_unavailable')`.
 *  - Se for válido → retorne `CepInfo`.
 */
export interface CepValidator {
  validate(cep: string): Promise<CepInfo>;
}
