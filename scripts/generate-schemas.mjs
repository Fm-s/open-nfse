#!/usr/bin/env node
// Reads schemas/rtc-v1.01/*.xsd and emits src/nfse/_rtc-schemas.generated.ts
// with the contents inlined as template literals. Run this whenever a new
// Nota Técnica lands and the XSDs are updated:
//
//   node scripts/generate-schemas.mjs
//
// The output file is committed — there's no build-time transform.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SCHEMA_DIR = join(REPO_ROOT, 'schemas', 'rtc-v1.01');
const OUTPUT = join(REPO_ROOT, 'src', 'nfse', '_rtc-schemas.generated.ts');

const files = readdirSync(SCHEMA_DIR)
  .filter((f) => f.endsWith('.xsd'))
  .sort();

const entries = files
  .map((f) => {
    const contents = readFileSync(join(SCHEMA_DIR, f), 'utf-8');
    // escape backticks and ${ for template literals
    const escaped = contents.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return `  {\n    fileName: ${JSON.stringify(f)},\n    contents: \`${escaped}\`,\n  },`;
  })
  .join('\n');

const output = `// AUTO-GENERATED from schemas/rtc-v1.01/*.xsd by scripts/generate-schemas.mjs.
// Do not edit by hand. Regenerate when a new Nota Técnica updates the XSDs.

export interface RtcSchemaFile {
  readonly fileName: string;
  readonly contents: string;
}

export const RTC_V1_01_SCHEMAS: readonly RtcSchemaFile[] = [
${entries}
];
`;

writeFileSync(OUTPUT, output, 'utf-8');
console.log(`wrote ${files.length} schemas to ${OUTPUT}`);
