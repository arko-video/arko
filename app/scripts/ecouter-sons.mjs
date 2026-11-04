// Écouter (et regarder) les 20 sons d'Arko sans navigateur.
// Utilisation : node scripts/ecouter-sons.mjs [dossier de sortie]
//  - fabrique chaque son avec le vrai code (src/sons/synthese), mesure son temps de calcul ;
//  - écrit tous-les-sons.wav (les sons à la suite, 0,4 s de silence entre deux) ;
//  - si ffmpeg est installé, dessine les spectrogrammes en images PNG (10 sons par image).
// Le dossier de sortie par défaut est un dossier temporaire (rien n'est écrit dans le projet).

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const FREQ = 48000;
const SILENCE_S = 0.4;
const dossier = process.argv[2] ?? join(tmpdir(), 'arko-ecoute-sons');
mkdirSync(dossier, { recursive: true });

// Vite sait lire le TypeScript du projet : on charge la synthèse telle quelle.
const serveur = await createServer({
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const synthese = await serveur.ssrLoadModule('/src/sons/synthese/index.ts');
const { CATALOGUE } = await serveur.ssrLoadModule('/src/sons/catalogue.ts');
await serveur.close();

/** Écrit un WAV mono 16 bits. */
function ecrireWav(chemin, echantillons) {
  const tampon = Buffer.alloc(44 + echantillons.length * 2);
  tampon.write('RIFF', 0);
  tampon.writeUInt32LE(36 + echantillons.length * 2, 4);
  tampon.write('WAVEfmt ', 8);
  tampon.writeUInt32LE(16, 16);
  tampon.writeUInt16LE(1, 20); // PCM
  tampon.writeUInt16LE(1, 22); // mono
  tampon.writeUInt32LE(FREQ, 24);
  tampon.writeUInt32LE(FREQ * 2, 28);
  tampon.writeUInt16LE(2, 32);
  tampon.writeUInt16LE(16, 34);
  tampon.write('data', 36);
  tampon.writeUInt32LE(echantillons.length * 2, 40);
  echantillons.forEach((v, i) => tampon.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  writeFileSync(chemin, tampon);
}

/** Met des sons bout à bout avec un silence entre eux ; renvoie le signal et le temps de début de chacun. */
function aLaSuite(sons) {
  const silence = Math.round(SILENCE_S * FREQ);
  const total = sons.reduce((n, s) => n + s.pcm.length + silence, silence);
  const sortie = new Float32Array(total);
  let k = silence;
  const reperes = [];
  for (const s of sons) {
    sortie.set(s.pcm, k);
    reperes.push(`${(k / FREQ).toFixed(1).padStart(5)} s  ${s.id}`);
    k += s.pcm.length + silence;
  }
  return { sortie, reperes };
}

const sons = [];
for (const s of CATALOGUE) {
  for (let k = 0; k < 3; k++) synthese.synthetiser(s.id); // le moteur JavaScript « chauffe »
  const t0 = performance.now();
  const pcm = synthese.synthetiser(s.id);
  const ms = performance.now() - t0;
  sons.push({ id: s.id, pcm });
  console.log(`${s.id.padEnd(26)} ${s.duree.toFixed(2)} s   calcul ${ms.toFixed(1)} ms`);
}

const tout = aLaSuite(sons);
const wav = join(dossier, 'tous-les-sons.wav');
ecrireWav(wav, tout.sortie);
console.log(`\nWAV : ${wav}`);

// Spectrogrammes : 10 sons par image, échelle de fréquences logarithmique (les graves sont lisibles).
try {
  for (let partie = 0; partie < 2; partie++) {
    const groupe = aLaSuite(sons.slice(partie * 10, partie * 10 + 10));
    const wavPartie = join(dossier, `partie-${partie + 1}.wav`);
    ecrireWav(wavPartie, groupe.sortie);
    const png = join(dossier, `spectrogramme-${partie + 1}.png`);
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', wavPartie,
      '-lavfi', 'showspectrumpic=s=2000x600:legend=1:fscale=log:scale=log:color=intensity',
      png,
    ]);
    console.log(`\nSpectrogramme : ${png}\n${groupe.reperes.join('\n')}`);
  }
} catch (e) {
  console.log('\nffmpeg introuvable ou en erreur : pas de spectrogramme.', e.message);
}
