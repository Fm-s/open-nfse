import { TipoAmbiente } from '../ambiente.js';
import { InvalidChaveAcessoError } from '../errors/validation.js';
import type { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText } from '../http/encoding.js';
import { parseNfseXml } from './parse-xml.js';
import type { NfseQueryResult } from './types.js';

// TSChaveNFSe (bundle RTC v1.01-20260727): posições 7–20 aceitam alfanumérico
// (CNPJ alfanumérico, IN RFB nº 2.229/2024); demais posições numéricas.
const REGEX_CHAVE_ACESSO = /^[0-9]{6}[0-9A-Z]{14}[0-9]{30}$/;

interface SefinNfseGetResponse {
  readonly tipoAmbiente: 1 | 2;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: string;
  readonly chaveAcesso: string;
  readonly nfseXmlGZipB64: string;
}

export async function fetchByChave(
  httpClient: HttpClient,
  chaveAcesso: string,
): Promise<NfseQueryResult> {
  if (!REGEX_CHAVE_ACESSO.test(chaveAcesso)) {
    throw new InvalidChaveAcessoError(chaveAcesso);
  }

  const raw = await httpClient.get<SefinNfseGetResponse>(`/nfse/${chaveAcesso}`);
  const xmlNfse = gzipBase64DecodeToText(raw.nfseXmlGZipB64);

  return {
    chaveAcesso: raw.chaveAcesso,
    xmlNfse,
    nfse: parseNfseXml(xmlNfse),
    tipoAmbiente: raw.tipoAmbiente === 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
    versaoAplicativo: raw.versaoAplicativo,
    dataHoraProcessamento: new Date(raw.dataHoraProcessamento),
  };
}
