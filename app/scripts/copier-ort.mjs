// Copie les fichiers WASM d'onnxruntime-web dans public/ort/ : les sous-titres (Whisper) les lisent
// depuis l'appli, jamais depuis un CDN. Lancé tout seul après « npm install » et avant dev/build.
// On prend la version simple (sans WebGPU) : Arko utilise seulement le WASM, sur 1 fil.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const depuis = join(racine, 'node_modules', 'onnxruntime-web', 'dist');
const vers = join(racine, 'public', 'ort');
const fichiers = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

if (!existsSync(depuis)) {
  console.error('copier-ort : onnxruntime-web est absent. Lance « npm install » d\'abord.');
  process.exit(1);
}
mkdirSync(vers, { recursive: true });
for (const f of fichiers) {
  const source = join(depuis, f);
  const cible = join(vers, f);
  // On ne recopie que si le fichier a changé (taille ou date différente).
  const a = statSync(source);
  const dejaLa = existsSync(cible) && statSync(cible).size === a.size && statSync(cible).mtimeMs >= a.mtimeMs;
  if (!dejaLa) copyFileSync(source, cible);
}
console.log(`copier-ort : ${fichiers.length} fichiers prêts dans public/ort/`);
