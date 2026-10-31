import { InvalidLayoutError } from '../errors/validation.js';

/**
 * Identificador do leiaute da NFS-e.
 *
 * - `nt004`: leiaute em produção (bundle XSD 20260727).
 * - `nt009`: leiaute da NT 009 release 1 (bundle XSD 20261020).
 *
 * Ambos serializam `versao="1.01"`; o `layout` é sintético e nunca vai no XML.
 */
export type Layout = 'nt004' | 'nt009';

export const LAYOUTS: readonly Layout[] = ['nt004', 'nt009'];

/** Retorna `value` se for um {@link Layout} conhecido; senão lança `InvalidLayoutError`. */
export function assertLayout(value: unknown): Layout {
  if (typeof value === 'string' && (LAYOUTS as readonly string[]).includes(value)) {
    return value as Layout;
  }
  throw new InvalidLayoutError(value);
}
