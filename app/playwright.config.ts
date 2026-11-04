// Tests de bout en bout dans Chrome (sans interface).
// Port : 4173 par défaut, ou ARKO_PORT=xxxx pour en prendre un libre.
// Les tests existants jouent un utilisateur qui a DÉJÀ choisi TikTok sur l'écran de départ (choix mémorisé) ;
// le test YouTube (youtube.spec.ts) repart d'un appareil vierge et fait le choix lui-même.
import { defineConfig } from '@playwright/test';
import { env } from 'node:process';

const port = Number(env.ARKO_PORT) || 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
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
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/arko/`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
