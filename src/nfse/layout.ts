import { InvalidLayoutError, LayoutMismatchError } from '../errors/validation.js';
import type { DPS } from './domain.js';

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

/**
 * Ramo `default` de um `switch (dps.layout)` exaustivo: não compila se algum
 * layout ficar sem `case`, e em runtime (chamador JS com layout desconhecido)
 * lança `InvalidLayoutError` em vez de cair silenciosamente num dos layouts.
 */
export function unknownLayout(dps: never): never {
  throw new InvalidLayoutError((dps as { readonly layout?: unknown } | undefined)?.layout);
}

/**
 * Garante que a DPS é do layout `expected` (o do cliente). Lança
 * `InvalidLayoutError` se `dps.layout` não for um layout conhecido e
 * `LayoutMismatchError` se for de outro layout.
 */
export function assertSameLayout(expected: Layout, dps: DPS): void {
  const received = assertLayout((dps as { readonly layout?: unknown }).layout);
  if (received !== expected) {
    throw new LayoutMismatchError(expected, received);
  }
}

/** Campos exclusivos de cada layout, procurados na DPS do layout oposto. */
const FOREIGN_FIELDS: Readonly<Record<Layout, readonly (readonly string[])[]>> = {
  // Presentes só no nt004 — proibidos numa DPS nt009.
  nt009: [
    ['infDPS', 'valores', 'vDedRed'],
    ['infDPS', 'IBSCBS', 'finNFSe'],
    ['infDPS', 'IBSCBS', 'valores', 'gReeRepRes'],
  ],
  // Presentes só no nt009 — proibidos numa DPS nt004.
  nt004: [
    ['infDPS', 'finNFSe'],
    ['infDPS', 'valores', 'vAjusteBC'],
    ['infDPS', 'IBSCBS', 'bensMoveis'],
  ],
};

/**
 * Rejeita uma DPS que carrega um campo exclusivo do outro layout — o tipo TS
 * já impede isso, mas chamadores JS (ou casts) podem montar um DTO híbrido que
 * o serializer descartaria em silêncio. Lança `LayoutMismatchError` com
 * `expected = received = dps.layout` e `field` = caminho do campo.
 */
export function assertNoForeignLayoutFields(dps: DPS): void {
  const layout = assertLayout((dps as { readonly layout?: unknown }).layout);
  for (const path of FOREIGN_FIELDS[layout]) {
    let node: unknown = dps;
    for (const key of path) {
      node =
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined;
    }
    if (node !== undefined) {
      throw new LayoutMismatchError(layout, layout, path.join('.'));
    }
  }
}
