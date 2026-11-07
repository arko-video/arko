// Serveur de dev minimal du banc des chibis (planches de toutes les variantes, à regarder à l'œil).
// Port : ARKO_PORT_BANC (4281 par défaut). Lancer : node tests/harness-chibis/planches.mjs <dossier>
import { defineConfig } from 'vite';
import { env } from 'node:process';

const racine = new URL('../..', import.meta.url).pathname;

export default defineConfig({
  root: racine,
  server: { port: Number(env.ARKO_PORT_BANC) || 4281, strictPort: true },
  optimizeDeps: { entries: ['tests/harness-chibis/banc.ts'] },
  logLevel: 'warn',
});
