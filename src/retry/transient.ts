import { NetworkError, ServerError, TimeoutError } from '../errors/http.js';
import { ReceitaRejectionError } from '../errors/receita.js';

/**
 * Códigos da camada de recepção do SEFIN que são **genuinamente transientes**,
 * apesar de chegarem como `ReceitaRejectionError`. Anexo I v1.01 lista 428
 * códigos de rejeição de DPS — todos permanentes por intenção, **exceto**:
 *
 * - `E1217` — "Serviço paralisado para manutenção" (janela de manutenção).
 * - `E1206` — "Certificado de Transmissão — Erro de acesso a LCR" (CRL
 *   distribution unreachable — tipicamente intermitente).
 *
 * Tratar essas duas como permanentes fazia o caller logar como falha dura
 * quando o retry em minutos resolveria — e, em `emitir(params)`, impedia o
 * item de ir para o `RetryStore`.
 */
const TRANSIENT_REJECTION_CODES = new Set<string>(['E1217', 'E1206']);

/**
 * Classificador padrão para decidir se uma falha é **transiente** (vale
 * registrar no RetryStore e retentar depois) ou **permanente** (não adianta
 * retentar — falha de regra fiscal, prazo expirado, DV inválido, etc.).
 *
 * Heurística:
 *  - `NetworkError`, `TimeoutError`, `ServerError` (5xx) → transiente
 *  - `ReceitaRejectionError` com código em `TRANSIENT_REJECTION_CODES` → transiente
 *  - `ReceitaRejectionError` em qualquer outro código → permanente (default)
 *  - Tudo o resto → permanente (conservador — não entra no retry pipeline)
 *
 * O consumidor pode sobrescrever passando `isTransient?: (err) => boolean`
 * nas opções do método.
 */
export function defaultIsTransient(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (err instanceof TimeoutError) return true;
  if (err instanceof ServerError) return true;
  if (err instanceof ReceitaRejectionError) {
    return TRANSIENT_REJECTION_CODES.has(err.codigo);
  }
  return false;
}
