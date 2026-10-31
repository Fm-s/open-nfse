// Helper de teste (fora do dist): ancora os campos date-only de um DTO na
// meia-noite de Brasília, como o parser faz (`coerceDateOnly`), para comparar
// `parse(build(dto))` com `dto` via `toEqual` sem perder nenhum campo.

/** Campos `TSData` (YYYY-MM-DD) dos DTOs DPS/NFS-e dos dois layouts. */
const DATE_ONLY_KEYS = new Set(['dCompet', 'dtEmiDoc', 'dtCompDoc', 'dVencOrig', 'dtIni', 'dtFim']);

function diaBrt(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function walk(value: unknown, key: string | undefined): unknown {
  if (value instanceof Date) {
    return key !== undefined && DATE_ONLY_KEYS.has(key)
      ? new Date(`${diaBrt(value)}T00:00:00-03:00`)
      : value;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, undefined));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
  }
  return value;
}

/** Cópia profunda de `dto` com os campos date-only na meia-noite de Brasília. */
export function comDatasBrt<T>(dto: T): T {
  return walk(dto, undefined) as T;
}
