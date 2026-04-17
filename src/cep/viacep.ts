import { type Dispatcher, request } from 'undici';
import { InvalidCepError } from '../errors/validation.js';
import type { CepInfo, CepValidator } from './types.js';

const CEP_REGEX = /^\d{8}$/;
const DEFAULT_ENDPOINT = 'https://viacep.com.br/ws';
const DEFAULT_TIMEOUT_MS = 5_000;

export interface ViaCepOptions {
  /** Endpoint base (default `https://viacep.com.br/ws`). */
  readonly endpoint?: string;
  /** Timeout por lookup em ms. Default 5000. */
  readonly timeoutMs?: number;
  /** Dispatcher undici opcional — útil para reuso de pool ou testes (MockAgent). */
  readonly dispatcher?: Dispatcher;
  /**
   * Cache em memória compartilhada para deduplicar lookups. Use o mesmo Map
   * em chamadas repetidas (lote) para cortar RTT e respeitar rate-limit do
   * ViaCEP. Default: `new Map()` por validador.
   */
  readonly cache?: Map<string, CepInfo>;
}

interface ViaCepSuccess {
  cep: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: undefined;
}

interface ViaCepNotFound {
  erro: true | 'true';
}

type ViaCepResponse = ViaCepSuccess | ViaCepNotFound;

/**
 * Validador de CEP baseado no [ViaCEP](https://viacep.com.br/) — gratuito, sem
 * chave, usado como default pela lib. Cacheia resultados em memória por
 * instância (passe `cache` custom para compartilhar entre validadores).
 */
export function createViaCepValidator(options: ViaCepOptions = {}): CepValidator {
  const endpoint = (options.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const dispatcher = options.dispatcher;
  const cache = options.cache ?? new Map<string, CepInfo>();

  return {
    async validate(cep: string): Promise<CepInfo> {
      const normalized = normalize(cep);

      const cached = cache.get(normalized);
      if (cached) return cached;

      const url = `${endpoint}/${normalized}/json/`;
      let response: Awaited<ReturnType<typeof request>>;
      try {
        response = await request(url, {
          method: 'GET',
          bodyTimeout: timeoutMs,
          headersTimeout: timeoutMs,
          ...(dispatcher !== undefined ? { dispatcher } : {}),
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new InvalidCepError(normalized, 'api_unavailable', message);
      }

      // ViaCEP devolve 400 para CEPs malformados (improvável aqui — já filtramos
      // pelo regex) e 200 para válidos e "não encontrados". Tratamos 5xx como
      // indisponibilidade.
      if (response.statusCode === 400) {
        await response.body.dump();
        throw new InvalidCepError(normalized, 'format');
      }
      if (response.statusCode >= 500) {
        await response.body.dump();
        throw new InvalidCepError(
          normalized,
          'api_unavailable',
          `ViaCEP respondeu HTTP ${response.statusCode}`,
        );
      }
      if (response.statusCode !== 200) {
        await response.body.dump();
        throw new InvalidCepError(
          normalized,
          'api_unavailable',
          `ViaCEP respondeu HTTP ${response.statusCode}`,
        );
      }

      const bodyText = await response.body.text();
      let parsed: ViaCepResponse;
      try {
        parsed = JSON.parse(bodyText) as ViaCepResponse;
      } catch (cause) {
        throw new InvalidCepError(
          normalized,
          'api_unavailable',
          `resposta ViaCEP não é JSON: ${bodyText.slice(0, 120)}`,
        );
      }

      if ('erro' in parsed && parsed.erro) {
        throw new InvalidCepError(normalized, 'not_found');
      }

      const info: CepInfo = toInfo(normalized, parsed as ViaCepSuccess);
      cache.set(normalized, info);
      return info;
    },
  };
}

function normalize(cep: string): string {
  const stripped = cep.replace(/\D/g, '');
  if (!CEP_REGEX.test(stripped)) {
    throw new InvalidCepError(cep, 'format');
  }
  return stripped;
}

function toInfo(cep: string, raw: ViaCepSuccess): CepInfo {
  return {
    cep,
    ...(raw.logradouro ? { logradouro: raw.logradouro } : {}),
    ...(raw.bairro ? { bairro: raw.bairro } : {}),
    ...(raw.localidade ? { localidade: raw.localidade } : {}),
    ...(raw.uf ? { uf: raw.uf } : {}),
    ...(raw.ibge ? { ibge: raw.ibge } : {}),
  };
}
