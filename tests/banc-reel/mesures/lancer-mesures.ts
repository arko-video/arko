// Banc réel — lanceur des commandes de mesure (hors `npm test`) :
//
//   node tests/banc-reel/mesures/lancer-mesures.ts plafond [--ecrire]
//   node tests/banc-reel/mesures/lancer-mesures.ts mesurer /home/claude/banc-cache/sortie/<mode>
//   node tests/banc-reel/mesures/lancer-mesures.ts calibrer
//
// Lancé par Node lui-même (types retirés à la volée) : il démarre Vite en mode serveur pour importer le code de
// src/ (imports sans extension) exactement comme l'appli le compile (même principe que tests/banc-reel/lancer.ts).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, createServerModuleRunner } from 'vite';
import type * as Outils from './outils';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const serveur = await createServer({
  root: racine,
  configFile: false,
  logLevel: 'warn',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const runner = createServerModuleRunner(serveur.environments.ssr, { hmr: false });
let code = 0;
try {
  const outils = await runner.import<typeof Outils>('/tests/banc-reel/mesures/outils.ts');
  code = await outils.commande(process.argv.slice(2));
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  await runner.close();
  await serveur.close();
}
process.exit(code);
