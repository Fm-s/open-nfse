import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        '**/index.ts',
        // Pure type declaration files — compile to empty JS, v8 can't cover them
        'src/nfse/domain.ts',
        'src/nfse/types.ts',
        'src/dfe/types.ts',
        'src/certificado/types.ts',
      ],
    },
  },
});
