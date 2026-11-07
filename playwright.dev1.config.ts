// e2e du dev 1 de la v3 « Best-of » (monteur sans IA + titre retiré + export ; Qui parle ? à deux voix).
// Construire d'abord : npx vite build --outDir dist-dev1 ; puis ARKO_PORT=xxxx npx playwright test --config playwright.dev1.config.ts
// (CAPTURES=/un/dossier pour garder des captures). Le serveur sert dist-dev1 sur un port libre.
import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

const port = Number(env.ARKO_PORT) || 4391;

export default defineConfig({
  testDir: 'tests/e2e-v3-dev1',
  timeout: 300_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}/arko/`,
    channel: 'chrome',
    headless: true,
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'arko.destination', value: 'tiktok' }] }],
    },
  },
  webServer: {
    command: `npx vite preview --outDir dist-dev1 --port ${port} --strictPort`,
    url: `http://localhost:${port}/arko/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
