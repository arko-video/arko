// Configuration Playwright du test des sous-titres (vrai modèle Whisper, servi depuis le disque).
//   npx playwright test --config playwright.sous-titres.config.ts
// Le build ajoute le banc tests/harness-sous-titres/ (variable ARKO_BANC_SOUS_TITRES, voir vite.config.ts).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /sous-titres\.spec\.ts$/,
  timeout: 600_000,
  workers: 1,
  reporter: [['line']],
  outputDir: 'test-results/st',
  use: { baseURL: 'http://localhost:4183/arko/', channel: 'chrome', headless: true, serviceWorkers: 'block' },
  webServer: {
    command: 'npx vite build --outDir dist-st && npx vite preview --outDir dist-st --port 4183 --strictPort',
    url: 'http://localhost:4183/arko/',
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ARKO_BANC_SOUS_TITRES: '1' },
  },
});
