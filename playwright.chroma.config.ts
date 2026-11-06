// Banc « Fond vert » (dossier tests/e2e-chroma) : carte graphique contre référence processeur, temps par image.
//   ARKO_PORT_BANC=4197 npx playwright test --config playwright.chroma.config.ts
import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

const port = Number(env.ARKO_PORT_BANC) || 4197;

export default defineConfig({
  testDir: 'tests/e2e-chroma',
  timeout: 300_000,
  workers: 1,
  reporter: [['line']],
  outputDir: 'test-results/chroma',
  use: { channel: 'chrome', headless: true },
  webServer: {
    command: `npx vite --config tests/harness-chroma/vite.config.ts`,
    url: `http://localhost:${port}/tests/harness-chroma/index.html`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ARKO_PORT_BANC: String(port) },
  },
});
