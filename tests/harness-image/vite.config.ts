// Serveur de dev minimal du banc « Améliorer l'image » (carte graphique contre référence processeur).
// Port : ARKO_PORT_BANC (4191 par défaut).
import { defineConfig } from 'vite';
import { env } from 'node:process';

const racine = new URL('../..', import.meta.url).pathname;

export default defineConfig({
  root: racine,
  server: { port: Number(env.ARKO_PORT_BANC) || 4191, strictPort: true },
  optimizeDeps: { entries: ['tests/harness-image/banc.ts'] },
  logLevel: 'warn',
});
