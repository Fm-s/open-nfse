import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lê a versão direto do `package.json` do pacote em runtime. Funciona tanto a
 * partir do source (vitest carregando `src/version.ts` → `<root>/package.json`)
 * quanto do build publicado (`<pkg>/dist/version.js` → `<pkg>/package.json`).
 *
 * Não importamos o JSON via `import pkg from '../package.json'` porque o
 * `rootDir: src` do tsconfig.build.json proíbe arquivos fora do source tree.
 * `readFileSync(import.meta.url + '/../package.json')` evita esse limite, e o
 * custo é uma leitura síncrona única no module-init.
 */
function readLibVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, '..', 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Versão corrente da lib, lida do `package.json` em runtime. */
export const LIB_VERSION = readLibVersion();

/**
 * Valor default de `verAplic` usado pelos builders quando o caller não passa um
 * override. `TSVerAplic` (tiposSimples_v1.01.xsd) tem maxLength=20, então
 * `'open-nfse/X.Y.Z'` (≤ 17 chars até v9.9.9) cabe com folga.
 */
export const DEFAULT_VER_APLIC = `open-nfse/${LIB_VERSION}`;
