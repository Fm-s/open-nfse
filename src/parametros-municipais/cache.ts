/**
 * Cache plugável para respostas da API de Parâmetros Municipais. Implemente
 * esta interface contra Redis, Memcached, DynamoDB ou qualquer outro backend
 * se quiser compartilhar cache entre processos. A lib inclui
 * `createInMemoryParametrosCache()` como default (Map em memória).
 *
 * Contrato:
 *  - `get` retorna `undefined` em miss ou item expirado.
 *  - `set` guarda por `ttlMs` milissegundos a partir de agora.
 *  - As chaves são opacas — não assuma formato (a lib pode mudar).
 */
export interface ParametrosCache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
}

interface Entry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export function createInMemoryParametrosCache(): ParametrosCache {
  const map = new Map<string, Entry<unknown>>();
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) {
        map.delete(key);
        return undefined;
      }
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      map.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

/** TTLs defaults, em milissegundos. */
export const DEFAULT_TTL_MS = {
  aliquota: 6 * 60 * 60 * 1_000, // 6h
  historicoAliquotas: 24 * 60 * 60 * 1_000, // 24h — histórico não muda
  beneficio: 60 * 60 * 1_000, // 1h
  convenio: 24 * 60 * 60 * 1_000, // 24h
  regimesEspeciais: 12 * 60 * 60 * 1_000, // 12h
  retencoes: 12 * 60 * 60 * 1_000, // 12h
} as const;
