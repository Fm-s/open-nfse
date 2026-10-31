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

const VER_APLIC_PREFIX = 'open-nfse/';
/** `maxLength` do `TSVerAplic` (tiposSimples_v1.01.xsd). */
const VER_APLIC_MAX = 20;
/** Abreviações de identificadores de pré-release (grafias do PEP 440: `a`, `b`, `c`). */
const PRE_RELEASE_ABBREV: Readonly<Record<string, string>> = { alpha: 'a', beta: 'b', rc: 'c' };

/**
 * Monta o `verAplic` (`TSVerAplic`: 1 a 20 chars imprimíveis) a partir de uma
 * versão semver, sempre com o prefixo `open-nfse/`. Determinístico; regras, na
 * ordem:
 *
 * 1. Build metadata (`+…`) é descartado — não identifica a release.
 * 2. Pré-release é compactado juntando os identificadores sem `-`/`.`:
 *    `0.12.0-rc.1` → `open-nfse/0.12.0rc1`.
 * 3. Se passar de 20 chars, os identificadores conhecidos são abreviados
 *    (`alpha` → `a`, `beta` → `b`, `rc` → `c`), preservando todos os dígitos:
 *    `0.12.0-beta.1` → `open-nfse/0.12.0b1`, `1.10.10-rc.10` → `open-nfse/1.10.10c10`.
 * 4. Se ainda passar de 20 chars (pré-release longo/desconhecido), o resultado é
 *    truncado em 20 chars — último recurso, para nunca violar o `maxLength`.
 *
 * Versão estável (`X.Y.Z`) fica intacta: `open-nfse/X.Y.Z` cabe até `99.99.9`.
 */
export function toVerAplic(version: string): string {
  const semver = version.split('+', 1)[0] ?? '';
  const dash = semver.indexOf('-');
  const core = dash === -1 ? semver : semver.slice(0, dash);
  const pre = dash === -1 ? [] : semver.slice(dash + 1).split('.');

  const compacta = `${VER_APLIC_PREFIX}${core}${pre.join('')}`;
  if (compacta.length <= VER_APLIC_MAX) return compacta;
  const abreviada = `${VER_APLIC_PREFIX}${core}${pre.map((id) => PRE_RELEASE_ABBREV[id] ?? id).join('')}`;
  return abreviada.slice(0, VER_APLIC_MAX);
}

/**
 * Valor default de `verAplic` usado pelos builders quando o caller não passa um
 * override: {@link toVerAplic} da versão corrente (`open-nfse/<versão>`, ≤ 20
 * chars do `TSVerAplic`).
 */
export const DEFAULT_VER_APLIC = toVerAplic(LIB_VERSION);
