import { NetworkError, ServerError, TimeoutError } from '../errors/http.js';
import { ReceitaRejectionError } from '../errors/receita.js';

/**
 * Classificador padrão para decidir se uma falha é **transiente** (vale
 * registrar no RetryStore e retentar depois) ou **permanente** (não adianta
 * retentar — falha de regra fiscal, prazo expirado, DV inválido, etc.).
 *
 * Heurística:
 *  - `NetworkError`, `TimeoutError`, `ServerError` (5xx) → transiente
 *  - `ReceitaRejectionError` → permanente (default)
 *  - Tudo o resto → permanente (conservador — não entra no retry pipeline)
 *
 * O consumidor pode sobrescrever passando `isTransient?: (err) => boolean`
 * nas opções do método.
 */
export function defaultIsTransient(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (err instanceof TimeoutError) return true;
  if (err instanceof ServerError) return true;
  if (err instanceof ReceitaRejectionError) return false;
  return false;
}
