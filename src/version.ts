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
 * Prefixos que identificam a lib no `verAplic`, em ordem de preferência. O curto
 * só entra quando a versão não cabe com o longo — trocar o prefixo nunca corta
 * dígito da versão.
 */
const VER_APLIC_PREFIXES = ['open-nfse/', 'onfse/'] as const;
/** `maxLength` do `TSVerAplic` (tiposSimples_v1.01.xsd, nos dois layouts). */
const VER_APLIC_MAX = 20;
/** Grafias compactas (PEP 440: `a`, `b`, `rc`) dos pré-releases convencionais. */
const PRE_RELEASE_COMPACTO: Readonly<Record<string, string>> = { alpha: 'a', beta: 'b', rc: 'rc' };
/** Pré-release convencional: exatamente `<alpha|beta|rc>.<n>`, `n` sem zero à esquerda. */
const PRE_RELEASE_CONVENCIONAL = /^(alpha|beta|rc)\.(0|[1-9]\d*)$/;

/**
 * Monta o `verAplic` (`TSVerAplic`: 1 a 20 chars imprimíveis) a partir de uma
 * versão semver. Determinístico e **injetivo**: versões distintas (ignorando
 * build metadata) nunca geram o mesmo `verAplic`. Regras:
 *
 * 1. Build metadata (`+…`) é descartado — não identifica a release.
 * 2. Pré-release convencional `<alpha|beta|rc>.<n>` é compactado colado ao core
 *    (sem `-`): `0.12.0-rc.1` → `0.12.0rc1`, `1.0.0-beta.2` → `1.0.0b2`,
 *    `1.0.0-alpha.2` → `1.0.0a2`. Sem ambiguidade: o core só tem dígitos e `.`,
 *    e o número vem inteiro depois da tag.
 * 3. Qualquer outro pré-release é mantido literal, com `-` e `.`
 *    (`0.12.1-0` → `0.12.1-0`, nunca `0.12.10`).
 * 4. Prefixo `open-nfse/`; se não couber em 20 chars, `onfse/`
 *    (`10.20.30-rc.123` → `onfse/10.20.30rc123`). Os dois prefixos são
 *    distintos, então trocar de prefixo não cria colisão.
 * 5. Se nem com o prefixo curto couber, lança — nunca trunca (truncar faria
 *    duas releases dividirem o mesmo `verAplic`). Como o default é calculado no
 *    load do módulo, uma versão assim quebra a suíte de testes antes do publish.
 *
 * Versão estável (`X.Y.Z`) fica intacta e usa `open-nfse/` enquanto tiver até
 * 10 chars (`99.99.99`, `100.100.10`); acima disso (`100.100.100`) cai em `onfse/`.
 */
export function toVerAplic(version: string): string {
  const semver = version.split('+', 1)[0] ?? '';
  const dash = semver.indexOf('-');
  const core = dash === -1 ? semver : semver.slice(0, dash);
  const pre = dash === -1 ? '' : semver.slice(dash + 1);

  const conv = PRE_RELEASE_CONVENCIONAL.exec(pre);
  const corpo =
    pre === ''
      ? core
      : conv
        ? `${core}${PRE_RELEASE_COMPACTO[conv[1] as string]}${conv[2]}`
        : `${core}-${pre}`;

  for (const prefixo of VER_APLIC_PREFIXES) {
    const v = `${prefixo}${corpo}`;
    if (v.length <= VER_APLIC_MAX) return v;
  }
  throw new RangeError(
    `versão ${JSON.stringify(version)} não cabe sem perda no verAplic (TSVerAplic, máx. ${VER_APLIC_MAX} chars)`,
  );
}

/**
 * Valor default de `verAplic` usado pelos builders quando o caller não passa um
 * override: {@link toVerAplic} da versão corrente — `open-nfse/<versão
 * compactada>`, ou `onfse/<versão compactada>` quando aquele não cabe nos 20
 * chars do `TSVerAplic`. Nunca trunca: se nem o prefixo curto couber, o
 * `RangeError` de {@link toVerAplic} é lançado no load do módulo.
 */
export const DEFAULT_VER_APLIC = toVerAplic(LIB_VERSION);
