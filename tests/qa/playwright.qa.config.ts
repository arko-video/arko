// Configuration Playwright de la QA indépendante (scénarios supplémentaires). Lancer depuis app/ :
//   npx playwright test --config tests/qa/playwright.qa.config.ts
// Port 4184 et build dans dist-qa/ : ne gêne pas les autres serveurs (4173, 4183).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.qa\.ts$/,
  timeout: 600_000,
  workers: 1,
  reporter: [['line'], ['json', { outputFile: 'resultats-qa.json' }]],
  outputDir: '../../test-results/qa',
  use: {
    baseURL: 'http://localhost:4184/arko/',
    channel: 'chrome',
    headless: true,
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    hasTouch: false,
    acceptDownloads: true,
    // QA finale : un clic sur un élément disparu échoue en 15 s au lieu d'attendre la fin du scénario (10 min).
    actionTimeout: 15_000,
    // Plateforme déjà choisie (TikTok) : les scénarios commencent à l'accueil, comme avant l'écran de départ.
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:4184', localStorage: [{ name: 'arko.destination', value: 'tiktok' }] }] },
  },
  webServer: {
    command: 'npx vite build --outDir dist-qa && npx vite preview --outDir dist-qa --port 4184 --strictPort',
    cwd: '../..',
    url: 'http://localhost:4184/arko/',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
