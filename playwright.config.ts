// Tests de bout en bout dans Chrome (sans interface).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  use: { baseURL: 'http://localhost:4173/arko/', channel: 'chrome', headless: true },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/arko/', reuseExistingServer: true, timeout: 180_000 },
});
