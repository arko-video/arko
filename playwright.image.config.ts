// Configuration Playwright de « Améliorer l'image » (dossier tests/e2e-image) :
//   ARKO_PORT=4195 npx playwright test --config playwright.image.config.ts
// Deux serveurs : l'appli construite à part (dist-image, pour ne pas toucher dist/) et le banc carte graphique
// (tests/harness-image, serveur de dev) sur le port suivant.
import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

const port = Number(env.ARKO_PORT) || 4195;
const portBanc = port + 1;

export default defineConfig({
  testDir: 'tests/e2e-image',
  timeout: 900_000,
  workers: 1,
  reporter: [['line']],
  outputDir: 'test-results/image',
  use: { baseURL: `http://localhost:${port}/arko/`, channel: 'chrome', headless: true, serviceWorkers: 'block' },
  webServer: [
    {
      command: `npx vite build --outDir dist-image && npx vite preview --outDir dist-image --port ${port} --strictPort`,
      url: `http://localhost:${port}/arko/`,
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      command: `npx vite --config tests/harness-image/vite.config.ts`,
      url: `http://localhost:${portBanc}/tests/harness-image/index.html`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ARKO_PORT_BANC: String(portBanc) },
    },
  ],
});
