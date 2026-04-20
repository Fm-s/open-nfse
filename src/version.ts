/**
 * Versão corrente da lib. Mantida manualmente em sync com `package.json` —
 * o `rootDir: src` do tsconfig impede que importemos o JSON de fora do
 * source tree. Bumpado junto com `package.json` no processo de release.
 */
export const LIB_VERSION = '0.7.3';

/**
 * Valor default de `verAplic` usado pelos builders quando o caller não
 * passa um override. `TSVerAplic` (tiposSimples_v1.01.xsd) tem maxLength=20,
 * então `'open-nfse/X.Y.Z'` (≤ 17 chars até v9.9.9) cabe com folga.
 */
export const DEFAULT_VER_APLIC = `open-nfse/${LIB_VERSION}`;
