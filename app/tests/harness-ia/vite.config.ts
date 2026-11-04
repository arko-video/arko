// Serveur de dev minimal pour le banc d'essai de l'analyse (phase 6), sans PWA ni base /arko/. Port 4185.
import { defineConfig } from 'vite';

const racine = new URL('../..', import.meta.url).pathname;

export default defineConfig({
  root: racine,
  worker: { format: 'es' },
  server: { port: 4185, strictPort: true, hmr: false },
  // Pré-optimisation fixée : sinon Vite découvre mediabunny dans le Worker et recharge la page en plein test.
  optimizeDeps: {
    entries: ['tests/harness-ia/banc.ts', 'src/ia/worker-analyse.ts'],
    include: ['mediabunny', 'idb-keyval'],
  },
  logLevel: 'warn',
});
