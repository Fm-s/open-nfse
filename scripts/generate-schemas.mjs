#!/usr/bin/env node
// Reads the official XSD bundle of each layout (schemas/1.01 = nt004,
// schemas/1.01-nt009 = nt009) and emits src/nfse/_rtc-schemas.generated.ts
// with the contents inlined as template literals. Run this whenever a new
// Nota Técnica lands and the XSDs are updated:
//
//   node scripts/generate-schemas.mjs
//
// The output file is committed — there's no build-time transform.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
// layout -> diretório do bundle (relativo à raiz do repo)
const BUNDLES = { nt004: 'schemas/1.01', nt009: 'schemas/1.01-nt009' };
const OUTPUT = join(REPO_ROOT, 'src', 'nfse', '_rtc-schemas.generated.ts');

function renderBundle(dir) {
  const files = readdirSync(join(REPO_ROOT, dir))
    .filter((f) => f.endsWith('.xsd'))
    .sort();
  const entries = files
    .map((f) => {
      const contents = readFileSync(join(REPO_ROOT, dir, f), 'utf-8');
      // escape backticks and ${ for template literals
      const escaped = contents.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      return `    {\n      fileName: ${JSON.stringify(f)},\n      contents: \`${escaped}\`,\n    },`;
    })
    .join('\n');
  return { count: files.length, entries };
}

const blocks = Object.entries(BUNDLES).map(([layout, dir]) => {
  const { count, entries } = renderBundle(dir);
  console.log(`${layout}: ${count} schemas from ${dir}`);
  return `  ${layout}: [\n${entries}\n  ],`;
});

const output = `// AUTO-GENERATED from schemas/<dir>/*.xsd per layout by scripts/generate-schemas.mjs.
// Do not edit by hand. Regenerate when a new Nota Técnica updates the XSDs.

import type { Layout } from './layout.js';

export interface RtcSchemaFile {
  readonly fileName: string;
  readonly contents: string;
}

export const RTC_SCHEMAS = {
${blocks.join('\n')}
} as const satisfies Record<Layout, readonly RtcSchemaFile[]>;
`;

writeFileSync(OUTPUT, output, 'utf-8');
console.log(`wrote ${OUTPUT}`);
