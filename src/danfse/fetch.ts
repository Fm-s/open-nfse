import { InvalidChaveAcessoError } from '../errors/validation.js';
import type { HttpClient } from '../http/client.js';

const REGEX_CHAVE_ACESSO = /^\d{50}$/;

/**
 * Baixa o DANFSe oficial do ADN para uma chave de acesso. Retorna os bytes
 * do PDF. Requer mTLS (o cliente do `NfseClient` já está configurado pra isso).
 *
 * Lança `InvalidChaveAcessoError` se a chave não tiver 50 dígitos,
 * `NotFoundError` (HTTP 404) se a chave não existir, `ForbiddenError`
 * (403) se o CNPJ do certificado não tiver autorização para ver a nota,
 * `ServerError` (5xx) em indisponibilidade.
 */
export async function fetchDanfse(httpClient: HttpClient, chaveAcesso: string): Promise<Buffer> {
  if (!REGEX_CHAVE_ACESSO.test(chaveAcesso)) {
    throw new InvalidChaveAcessoError(chaveAcesso);
  }
  return httpClient.getPdf(`/${chaveAcesso}`);
}
