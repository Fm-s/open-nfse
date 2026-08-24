import { InvalidChaveAcessoError } from '../errors/validation.js';
import type { HttpClient } from '../http/client.js';

// TSChaveNFSe (bundle RTC v1.01-20260727): posições 7–20 aceitam alfanumérico.
const REGEX_CHAVE_ACESSO = /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/;

/**
 * Baixa o DANFSe oficial do ADN para uma chave de acesso. Retorna os bytes
 * do PDF. Requer mTLS (o cliente do `NfseClient` já está configurado pra isso).
 *
 * Lança `InvalidChaveAcessoError` se a chave não casar com o TSChaveNFSe,
 * `NotFoundError` (HTTP 404) se a chave não existir, `ForbiddenError`
 * (403) se o CNPJ do certificado não tiver autorização para ver a nota,
 * `ServerError` (5xx) em indisponibilidade.
 */
export async function consultarDanfse(
  httpClient: HttpClient,
  chaveAcesso: string,
): Promise<Buffer> {
  if (!REGEX_CHAVE_ACESSO.test(chaveAcesso)) {
    throw new InvalidChaveAcessoError(chaveAcesso);
  }
  return httpClient.getPdf(`/${chaveAcesso}`);
}
