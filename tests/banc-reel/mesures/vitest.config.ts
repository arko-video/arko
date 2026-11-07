// Tests des mesures du banc réel (purs, hors `npm test` qui ne prend que src/**) :
//   npx vitest run --config tests/banc-reel/mesures/vitest.config.ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  test: { include: ['tests/banc-reel/mesures/**/*.test.ts'], environment: 'node' },
});
