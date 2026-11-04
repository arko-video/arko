// Serveur de dev minimal pour le banc d'essai du moteur (sans PWA ni base /arko/).
import { defineConfig } from 'vite';

const racine = new URL('../..', import.meta.url).pathname;

export default defineConfig({
  root: racine,
  worker: { format: 'es' },
  server: { port: 4181, strictPort: true },
  // Pré-optimisation fixée : sinon Vite découvre mediabunny dans le Worker et recharge la page en plein test.
  optimizeDeps: {
    entries: ['tests/harness-moteur/banc.ts', 'src/moteur/export/worker.ts'],
    include: ['mediabunny', '@mediabunny/aac-encoder', 'idb-keyval'],
  },
  logLevel: 'warn',
});
