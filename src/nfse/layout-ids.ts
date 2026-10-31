// Módulo-folha (sem imports): `errors/validation.ts` lê `LAYOUTS` daqui sem
// criar ciclo com `layout.ts`, que importa os erros.

/**
 * Identificador do leiaute da NFS-e.
 *
 * - `nt004`: leiaute em produção (bundle XSD 20260727).
 * - `nt009`: leiaute da NT 009 release 1 (bundle XSD 20261020).
 *
 * Ambos serializam `versao="1.01"`; o `layout` é sintético e nunca vai no XML.
 */
export type Layout = 'nt004' | 'nt009';

/** Todos os {@link Layout} conhecidos — checado em compilação contra o tipo. */
export const LAYOUTS = ['nt004', 'nt009'] as const satisfies readonly Layout[];

// Não compila se algum membro de `Layout` faltar em `LAYOUTS` (o `satisfies`
// acima cobre o sentido oposto: nada em `LAYOUTS` fora de `Layout`).
type LayoutsFaltando = Exclude<Layout, (typeof LAYOUTS)[number]>;
const layoutsCompletos: [LayoutsFaltando] extends [never] ? true : false = true;
void layoutsCompletos;
