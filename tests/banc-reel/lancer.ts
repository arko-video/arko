// Banc réel (hors `npm test`) : fait passer la vraie session dans la chaîne d'Arko, dans Node, puis la mesure.
//
//   npm run banc-reel                         → les 2 modes (mots, voix) depuis les caches + mesures + tableau
//   npm run banc-reel -- --mode voix          → un seul mode
//   npm run banc-reel -- --etape coupes       → s'arrêter après une étape (voix | coupes | scenes)
//   npm run banc-reel -- --plage 0-1800       → seulement cette partie de la session (temps source, s)
//   npm run banc-reel -- --musique <fichier>  → donner une musique (sinon : aucune, comme Romain)
//   npm run banc-reel -- transcrire [--plage 0-2400]   → Whisper d'Arko (long, en arrière-plan, reprise)
//   npm run banc-reel -- vitesse              → vitesse de Whisper sur 60 s
//   npm run banc-reel -- signaux [--refaire]  → (re)calcule les caches de signaux, voix, empreintes
//
// Ce fichier est lancé par Node lui-même (types retirés à la volée) : il démarre Vite en mode serveur pour
// importer le code de src/ (imports sans extension, import.meta.env) exactement comme l'appli le compile.
// Voir tests/banc-reel/LISEZ-MOI.md.

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, createServerModuleRunner } from 'vite';
import type * as Principal from './chaine/principal';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// BANC_ORT=web : Whisper tourne sur onnxruntime-web (WASM, comme dans le navigateur) au lieu d'onnxruntime-node.
// transformers.js prend le moteur posé sous Symbol.for('onnxruntime') (à faire AVANT de l'importer).
if (process.env.BANC_ORT === 'web') {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = `${pathToFileURL(resolve(racine, 'node_modules/onnxruntime-web/dist')).href}/`;
  ort.env.wasm.numThreads = 1;
  (globalThis as Record<symbol, unknown>)[Symbol.for('onnxruntime')] = ort;
}
const adaptateurs = resolve(racine, 'tests/banc-reel/chaine/adaptateurs');

/** IndexedDB n'existe pas dans Node : `idb-keyval` est remplacé par une table en mémoire (chaine/adaptateurs). */
const remplacements = { 'idb-keyval': resolve(adaptateurs, 'idb-keyval.ts') };

const serveur = await createServer({
  root: racine,
  configFile: false,
  logLevel: 'warn',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: remplacements },
  ssr: { noExternal: Object.keys(remplacements) },
});
const runner = createServerModuleRunner(serveur.environments.ssr, { hmr: false });
let code = 0;
try {
  const principal = await runner.import<typeof Principal>(process.env.BANC_MODULE ?? '/tests/banc-reel/chaine/principal.ts');
  code = await principal.principal(process.argv.slice(2));
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await runner.close();
  await serveur.close();
}
process.exit(code);
