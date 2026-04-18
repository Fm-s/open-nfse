import type { HttpClient } from '../http/client.js';
import { DEFAULT_TTL_MS, type ParametrosCache } from './cache.js';
import {
  type RawResultadoConsultaAliquotas,
  type RawResultadoConsultaBeneficio,
  type RawResultadoConsultaConvenio,
  type RawResultadoConsultaRegimesEspeciais,
  type RawResultadoConsultaRetencoes,
  parseAliquotasResult,
  parseBeneficioResult,
  parseConvenioResult,
  parseRegimesEspeciaisResult,
  parseRetencoesResult,
} from './parse.js';
import type {
  ConsultaAliquotasResult,
  ConsultaBeneficioResult,
  ConsultaConvenioResult,
  ConsultaRegimesEspeciaisResult,
  ConsultaRetencoesResult,
} from './types.js';

/** Opções comuns aos consultores — cache override per-call + TTL override. */
export interface ConsultaOptions {
  /** Passe `false` para forçar miss (bater direto no ADN). Default `true`. */
  readonly useCache?: boolean;
  /** Override do TTL para esta chamada específica. */
  readonly ttlMs?: number;
  /**
   * Cache específica para esta chamada. Sobrescreve a do cliente. Útil para
   * testes e cenários com cache compartilhada entre processos.
   */
  readonly cache?: ParametrosCache;
}

/** Aceita 400/404 com body (ADN devolve payload com `mensagem` em vez de erro HTTP). */
const ACCEPTED_STATUSES = [400, 404] as const;

/**
 * Formata `competencia` para o path do ADN.
 * Aceita Date ou string — se string, pass-through; se Date, usa ISO completo.
 * O ADN aceita tanto `AAAA-MM-DD` quanto `AAAA-MM-DDTHH:MM:SS`.
 */
function formatCompetencia(competencia: Date | string): string {
  if (typeof competencia === 'string') return competencia;
  return competencia.toISOString().slice(0, 10); // YYYY-MM-DD
}

function cacheKey(op: string, ...parts: (string | number)[]): string {
  return `parametros:${op}:${parts.join(':')}`;
}

// ---------------------------------------------------------------------------
// GET /{codigoMunicipio}/{codigoServico}/{competencia}/aliquota
// ---------------------------------------------------------------------------

export async function fetchAliquota(
  httpClient: HttpClient,
  codigoMunicipio: string,
  codigoServico: string,
  competencia: Date | string,
  cache?: ParametrosCache,
  options?: ConsultaOptions,
): Promise<ConsultaAliquotasResult> {
  const comp = formatCompetencia(competencia);
  const key = cacheKey('aliquota', codigoMunicipio, codigoServico, comp);
  const useCache = options?.useCache !== false;
  const effectiveCache = options?.cache ?? cache;
  if (useCache && effectiveCache) {
    const hit = await effectiveCache.get<ConsultaAliquotasResult>(key);
    if (hit) return hit;
  }
  const raw = await httpClient.get<RawResultadoConsultaAliquotas>(
    `/${encodeURIComponent(codigoMunicipio)}/${encodeURIComponent(codigoServico)}/${encodeURIComponent(comp)}/aliquota`,
    { acceptedStatuses: [...ACCEPTED_STATUSES] },
  );
  const result = parseAliquotasResult(raw);
  if (useCache && effectiveCache) {
    await effectiveCache.set(key, result, options?.ttlMs ?? DEFAULT_TTL_MS.aliquota);
  }
  return result;
}

// ---------------------------------------------------------------------------
// GET /{codigoMunicipio}/{codigoServico}/historicoaliquotas
// ---------------------------------------------------------------------------

export async function fetchHistoricoAliquotas(
  httpClient: HttpClient,
  codigoMunicipio: string,
  codigoServico: string,
  cache?: ParametrosCache,
  options?: ConsultaOptions,
): Promise<ConsultaAliquotasResult> {
  const key = cacheKey('historicoAliquotas', codigoMunicipio, codigoServico);
  const useCache = options?.useCache !== false;
  const effectiveCache = options?.cache ?? cache;
  if (useCache && effectiveCache) {
    const hit = await effectiveCache.get<ConsultaAliquotasResult>(key);
    if (hit) return hit;
  }
  const raw = await httpClient.get<RawResultadoConsultaAliquotas>(
    `/${encodeURIComponent(codigoMunicipio)}/${encodeURIComponent(codigoServico)}/historicoaliquotas`,
    { acceptedStatuses: [...ACCEPTED_STATUSES] },
  );
  const result = parseAliquotasResult(raw);
  if (useCache && effectiveCache) {
    await effectiveCache.set(key, result, options?.ttlMs ?? DEFAULT_TTL_MS.historicoAliquotas);
  }
  return result;
}

// ---------------------------------------------------------------------------
// GET /{codigoMunicipio}/{numeroBeneficio}/{competencia}/beneficio
// ---------------------------------------------------------------------------

export async function fetchBeneficio(
  httpClient: HttpClient,
  codigoMunicipio: string,
  numeroBeneficio: string,
  competencia: Date | string,
  cache?: ParametrosCache,
  options?: ConsultaOptions,
): Promise<ConsultaBeneficioResult> {
  const comp = formatCompetencia(competencia);
  const key = cacheKey('beneficio', codigoMunicipio, numeroBeneficio, comp);
  const useCache = options?.useCache !== false;
  const effectiveCache = options?.cache ?? cache;
  if (useCache && effectiveCache) {
    const hit = await effectiveCache.get<ConsultaBeneficioResult>(key);
    if (hit) return hit;
  }
  const raw = await httpClient.get<RawResultadoConsultaBeneficio>(
    `/${encodeURIComponent(codigoMunicipio)}/${encodeURIComponent(numeroBeneficio)}/${encodeURIComponent(comp)}/beneficio`,
    { acceptedStatuses: [...ACCEPTED_STATUSES] },
  );
  const result = parseBeneficioResult(raw);
  if (useCache && effectiveCache) {
    await effectiveCache.set(key, result, options?.ttlMs ?? DEFAULT_TTL_MS.beneficio);
  }
  return result;
}

// ---------------------------------------------------------------------------
// GET /{codigoMunicipio}/convenio
// ---------------------------------------------------------------------------

export async function fetchConvenio(
  httpClient: HttpClient,
  codigoMunicipio: string,
  cache?: ParametrosCache,
  options?: ConsultaOptions,
): Promise<ConsultaConvenioResult> {
  const key = cacheKey('convenio', codigoMunicipio);
  const useCache = options?.useCache !== false;
  const effectiveCache = options?.cache ?? cache;
  if (useCache && effectiveCache) {
    const hit = await effectiveCache.get<ConsultaConvenioResult>(key);
    if (hit) return hit;
  }
  const raw = await httpClient.get<RawResultadoConsultaConvenio>(
    `/${encodeURIComponent(codigoMunicipio)}/convenio`,
    { acceptedStatuses: [...ACCEPTED_STATUSES] },
  );
  const result = parseConvenioResult(raw);
  if (useCache && effectiveCache) {
    await effectiveCache.set(key, result, options?.ttlMs ?? DEFAULT_TTL_MS.convenio);
  }
  return result;
}

// ---------------------------------------------------------------------------
// GET /{codigoMunicipio}/{codigoServico}/{competencia}/regimes_especiais
// ---------------------------------------------------------------------------

export async function fetchRegimesEspeciais(
  httpClient: HttpClient,
  codigoMunicipio: string,
  codigoServico: string,
  competencia: Date | string,
  cache?: ParametrosCache,
  options?: ConsultaOptions,
): Promise<ConsultaRegimesEspeciaisResult> {
  const comp = formatCompetencia(competencia);
  const key = cacheKey('regimesEspeciais', codigoMunicipio, codigoServico, comp);
  const useCache = options?.useCache !== false;
  const effectiveCache = options?.cache ?? cache;
  if (useCache && effectiveCache) {
    const hit = await effectiveCache.get<ConsultaRegimesEspeciaisResult>(key);
    if (hit) return hit;
  }
  const raw = await httpClient.get<RawResultadoConsultaRegimesEspeciais>(
    `/${encodeURIComponent(codigoMunicipio)}/${encodeURIComponent(codigoServico)}/${encodeURIComponent(comp)}/regimes_especiais`,
    { acceptedStatuses: [...ACCEPTED_STATUSES] },
  );
  const result = parseRegimesEspeciaisResult(raw);
  if (useCache && effectiveCache) {
    await effectiveCache.set(key, result, options?.ttlMs ?? DEFAULT_TTL_MS.regimesEspeciais);
  }
  return result;
}

// ---------------------------------------------------------------------------
// GET /{codigoMunicipio}/{competencia}/retencoes
// ---------------------------------------------------------------------------

export async function fetchRetencoes(
  httpClient: HttpClient,
  codigoMunicipio: string,
  competencia: Date | string,
  cache?: ParametrosCache,
  options?: ConsultaOptions,
): Promise<ConsultaRetencoesResult> {
  const comp = formatCompetencia(competencia);
  const key = cacheKey('retencoes', codigoMunicipio, comp);
  const useCache = options?.useCache !== false;
  const effectiveCache = options?.cache ?? cache;
  if (useCache && effectiveCache) {
    const hit = await effectiveCache.get<ConsultaRetencoesResult>(key);
    if (hit) return hit;
  }
  const raw = await httpClient.get<RawResultadoConsultaRetencoes>(
    `/${encodeURIComponent(codigoMunicipio)}/${encodeURIComponent(comp)}/retencoes`,
    { acceptedStatuses: [...ACCEPTED_STATUSES] },
  );
  const result = parseRetencoesResult(raw);
  if (useCache && effectiveCache) {
    await effectiveCache.set(key, result, options?.ttlMs ?? DEFAULT_TTL_MS.retencoes);
  }
  return result;
}
