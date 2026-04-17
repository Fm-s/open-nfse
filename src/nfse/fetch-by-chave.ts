import { TipoAmbiente } from '../ambiente.js';
import { InvalidChaveAcessoError } from '../errors/validation.js';
import type { HttpClient } from '../http/client.js';
import { gzipBase64DecodeToText } from '../http/encoding.js';
import { parseNfseXml } from './parse-xml.js';
import type { NfseQueryResult } from './types.js';

const REGEX_CHAVE_ACESSO = /^\d{50}$/;

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
