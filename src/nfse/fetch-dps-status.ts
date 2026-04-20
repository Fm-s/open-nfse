import { TipoAmbiente } from '../ambiente.js';
import { NotFoundError } from '../errors/http.js';
import { InvalidIdDpsError } from '../errors/validation.js';
import type { HttpClient } from '../http/client.js';

/**
 * Pattern do `infDPS.Id` — `DPS` + 42 dígitos (cLocEmi 7 + AAMM 4 + tpInsc 1 +
 * inscFederal 14 + serie 5 + nDPS 15 + tpEmis 1). Total 45 chars.
 */
const REGEX_DPS_ID = /^DPS\d{42}$/;

/** Resposta de `GET /dps/{id}` quando há NFS-e gerada. */
export interface DpsStatusResult {
  readonly chaveAcesso: string;
  readonly idDps: string;
  readonly tipoAmbiente: TipoAmbiente;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: Date;
}

interface SefinDpsGetResponse {
  readonly tipoAmbiente: 1 | 2;
  readonly versaoAplicativo: string;
  readonly dataHoraProcessamento: string;
  readonly idDps: string;
  readonly chaveAcesso: string;
}

/**
 * `GET /dps/{id}` — consulta o SEFIN pela chave de acesso da NFS-e a partir
 * de um `infDPS.Id`. Uso primário: **reconciliação pós-timeout** — se um
 * `emitir()` não retornou e você tem o idDps persistido, essa chamada revela
 * se a Receita chegou a gerar a NFS-e.
 *
 * Retorna `DpsStatusResult` (com `chaveAcesso`) quando há NFS-e; lança
 * `NotFoundError` (HTTP 404) quando não há; lança `InvalidDpsIdParamError`
 * se o formato do id for inválido.
 */
export async function fetchDpsStatus(
  httpClient: HttpClient,
  idDps: string,
): Promise<DpsStatusResult> {
  if (!REGEX_DPS_ID.test(idDps)) {
    throw new InvalidIdDpsError(idDps);
  }
  const raw = await httpClient.get<SefinDpsGetResponse>(`/dps/${idDps}`);
  return {
    chaveAcesso: raw.chaveAcesso,
    idDps: raw.idDps,
    tipoAmbiente: raw.tipoAmbiente === 1 ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
    versaoAplicativo: raw.versaoAplicativo,
    dataHoraProcessamento: new Date(raw.dataHoraProcessamento),
  };
}

/**
 * `HEAD /dps/{id}` — verifica existência sem baixar o body. Mais barato que
 * `fetchDpsStatus` para checks bulk de reconciliação. Retorna `true` se há
 * NFS-e gerada, `false` se não (404). Propaga outros erros HTTP.
 */
export async function existsDpsStatus(httpClient: HttpClient, idDps: string): Promise<boolean> {
  if (!REGEX_DPS_ID.test(idDps)) {
    throw new InvalidIdDpsError(idDps);
  }
  try {
    await httpClient.head(`/dps/${idDps}`);
    return true;
  } catch (err) {
    if (err instanceof NotFoundError) return false;
    throw err;
  }
}
