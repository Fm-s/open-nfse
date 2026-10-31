import { describe, expect, expectTypeOf, it } from 'vitest';
import { RTC_SCHEMAS, type RtcSchemaFile } from './_rtc-schemas.generated.js';
import { LAYOUTS, type Layout } from './layout.js';

describe('RTC_SCHEMAS (gerado por scripts/generate-schemas.mjs)', () => {
  it('é tipado pela interface, sem literais dos XSDs (o .d.ts não pode inlinear os esquemas)', () => {
    // Com `as const`, `contents` vira o literal do XSD inteiro e o tsc copia
    // todos os esquemas para o `.d.ts` publicado (~500 kB de peso morto).
    expectTypeOf(RTC_SCHEMAS).toEqualTypeOf<Readonly<Record<Layout, readonly RtcSchemaFile[]>>>();
    expectTypeOf<(typeof RTC_SCHEMAS)['nt004'][number]['contents']>().toEqualTypeOf<string>();
  });

  it('traz um bundle de XSDs para cada layout, com o DPS_v1.01.xsd raiz', () => {
    expect(Object.keys(RTC_SCHEMAS).sort()).toEqual([...LAYOUTS].sort());
    for (const layout of LAYOUTS) {
      const nomes = RTC_SCHEMAS[layout].map((s) => s.fileName);
      expect(nomes).toContain('DPS_v1.01.xsd');
      for (const s of RTC_SCHEMAS[layout]) expect(s.contents).toMatch(/<(?:xs:)?schema\b/);
    }
  });
});
