// Montage auto, H : « Montage express » dans Chrome headless, au format téléphone, en YouTube 16:9.
// 1. Import d'une capture OBS (tests/fixtures/obs-voix-jeu.mp4 : voix à 6 s et 24 s + bruit de jeu + explosion,
//    barre de titre et barre des tâches) ; petit pack .zip À DOSSIERS dans Mes sons (rire, wow, extinction Windows,
//    une musique « Kevin MacLeod ») ;
// 2. les mots de la voix sont posés comme une transcription déjà faite (IndexedDB `arko.transcription.<empreinte>`,
//    comme après « Couper les blancs ») : pas de modèle Whisper à télécharger, la reprise est vérifiée au passage ;
// 3. Mes montages → ⋮ → Montage express : réglages (transcrire, musique), analyse, revue, « Monter la vidéo » ;
// 4. un seul Annuler revient à la vidéo brute ; export 1920 × 1080 sans erreur : durée = montage, −14 LUFS ±1
//    (mesure d'Arko et ffmpeg ebur128), et plus aucune barre (titre, tâches) dans l'image.
// Captures : dans le dossier de sortie du test (et ARKO_CAPTURES=/dossier si donné).

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import sharp from 'sharp';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';

const VIDEO = 'tests/fixtures/obs-voix-jeu.mp4';
const PAROLE = JSON.parse(readFileSync('tests/fixtures/parole-fr.json', 'utf-8')) as { mots: { txt: string; ts: number; fin: number }[] };
const port = Number(env.ARKO_PORT) || 4173;

test.use({
  actionTimeout: 20_000,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  storageState: { cookies: [], origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'arko.destination', value: 'youtube' }] }] },
});

async function capture(page: Page, info: TestInfo, nom: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath(`${nom}.png`) });
  if (env.ARKO_CAPTURES) await page.screenshot({ path: `${env.ARKO_CAPTURES}/${nom}.png` });
}

/** « 18 s », « 1 min 12 s », « 9,5 s » → secondes. */
function secondes(texte: string): number {
  const t = texte.replace(/\u00a0/g, ' ');
  const min = /(\d+) min/.exec(t);
  const sec = /(\d+(?:,\d)?) s/.exec(t);
  return (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]!.replace(',', '.')) : 0);
}

/** WAV stéréo 48 kHz : somme de sinus (fréquences, amplitude totale). */
function wav(freqs: number[], duree: number, amplitude = 0.5): Buffer {
  const n = Math.round(duree * 48000);
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8);
  [16, 0x20001, 48000, 192000, 0x100004].forEach((v, k) => b.writeUInt32LE(v, 16 + k * 4));
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = freqs.reduce((s, f) => s + Math.sin((2 * Math.PI * f * i) / 48000), 0) / freqs.length;
    const x = Math.round(32767 * amplitude * v * Math.min(1, i / 480, (n - i) / 480));
    b.writeInt16LE(x, 44 + i * 4);
    b.writeInt16LE(x, 46 + i * 4);
  }
  return b;
}

/** .zip « stocké » (sans compression). */
function zip(entrees: { nom: string; donnees: Buffer }[]): Buffer {
  const parties: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = Buffer.from(e.nom);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(e.donnees.length, 18);
    local.writeUInt32LE(e.donnees.length, 22);
    local.writeUInt16LE(nom.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(e.donnees.length, 20);
    central.writeUInt32LE(e.donnees.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    parties.push(local, nom, e.donnees);
    centraux.push(central, nom);
    decalage += 30 + nom.length + e.donnees.length;
  }
  const rep = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(rep.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...parties, rep, fin]);
}

/** Sonie intégrée et crête vraie d'un fichier, mesurées par ffmpeg (ebur128, BS.1770). */
function mesurerFfmpeg(chemin: string): { lufs: number; crete: number } {
  const texte = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', chemin, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf-8' }).stderr;
  const resume = texte.slice(texte.lastIndexOf('Summary:'));
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(resume)?.[1]), crete: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(resume)?.[1]) };
}

/** Part des lignes [y0, y1[ « unies » (même couleur sur toute la largeur, comme une barre des tâches). */
async function lignesUnies(png: string, y0: number, y1: number): Promise<number> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let unies = 0;
  for (let y = y0; y < y1; y++) {
    let s = 0;
    let s2 = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const v = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      s += v;
      s2 += v * v;
    }
    const m = s / info.width;
    if (Math.sqrt(Math.max(0, s2 / info.width - m * m)) < 20) unies++;
  }
  return unies / (y1 - y0);
}

/** Mots de la voix (mêmes temps que la vraie phrase, à 6 s et à 24 s) : la 2ᵉ fois, des phrases fortes. */
function motsDeLaVoix(): [string, number, number][] {
  const fortes = ['Non!', 'putain', 'le', 'creeper.', 'On', 'a', 'gagné!', 'gg', 'les', 'gars.', 'bon', 'allez', 'à', 'la', 'prochaine', 'ensemble!'];
  const r = (x: number) => Math.round(x * 100) / 100;
  return [
    ...PAROLE.mots.map((m): [string, number, number] => [m.txt, r(m.ts + 6), r(m.fin + 6)]),
    ...PAROLE.mots.map((m, i): [string, number, number] => [fortes[i] ?? m.txt, r(m.ts + 24), r(m.fin + 24)]),
  ];
}

/** Lit le projet courant enregistré (IndexedDB de idb-keyval). */
async function projetCourant(page: Page): Promise<{ recette: Record<string, unknown> & { titre?: string; sources: { emp: string; duree: number }[] } }> {
  return page.evaluate(async () => {
    const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
    const db = await attendre(indexedDB.open('keyval-store'));
    const store = db.transaction('keyval', 'readonly').objectStore('keyval');
    const index = await attendre(store.get('arko.projets'));
    if (!index?.courant) return null;
    return attendre(db.transaction('keyval', 'readonly').objectStore('keyval').get(`arko.projet.${index.courant}`));
  });
}

test('Montage express : capture OBS + pack de sons + musique → montage 16:9 → export −14 LUFS', async ({ page }, info) => {
  test.setTimeout(600_000);
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));

  // 1. La vidéo, puis le pack de sons à dossiers dans Mes sons.
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('outil-sons').click();
  const pack = join(tmpdir(), `arko-${info.testId}-pack.zip`);
  writeFileSync(
    pack,
    zip([
      { nom: 'Pack/Laughs/sitcom laugh.wav', donnees: wav([500, 750], 2) },
      { nom: 'Pack/MLG Sound Effects/wow.wav', donnees: wav([800], 1.5) },
      { nom: 'Pack/Windows/windows shutdown.wav', donnees: wav([600, 450, 300], 2.5) },
      { nom: 'Pack/Musique/Kevin MacLeod - Sneaky Test.wav', donnees: wav([220, 277, 330], 12, 0.6) },
    ]),
  );
  await page.getByTestId('mes-sons-fichiers').setInputFiles([pack]);
  await expect(page.getByTestId('toast')).toContainText('4 sons gardés dans Mes sons', { timeout: 30_000 });

  // 2. La voix déjà transcrite (comme après « Couper les blancs »), gardée sur l'appareil.
  await expect.poll(async () => !!(await projetCourant(page))?.recette, { timeout: 10_000 }).toBe(true);
  const { recette } = await projetCourant(page);
  const { emp, duree } = recette.sources[0]!;
  await page.evaluate(
    async ({ emp, duree, mots }) => {
      const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
      const db = await attendre(indexedDB.open('keyval-store'));
      const g = { version: 1, duree, langue: 'fr', plages: [{ de: 0, a: duree }], mots };
      await attendre(db.transaction('keyval', 'readwrite').objectStore('keyval').put(g, `arko.transcription.${emp}`));
    },
    { emp, duree, mots: motsDeLaVoix() },
  );

  // 3. Mes montages → ⋮ → Montage express.
  // Retour jusqu'à l'accueil (le panneau Sons ouvert compte comme une étape de l'historique).
  for (let i = 0; i < 5 && !(await page.getByTestId('mes-montages').isVisible()); i++) {
    await page.getByTestId('retour').click();
    await page.waitForTimeout(300);
  }
  await expect(page.getByTestId('montage-0')).toBeVisible();
  await page.getByTestId('montage-menu-0').click();
  await page.getByTestId('action-express').click();
  await expect(page.getByTestId('express-reglages')).toBeVisible();
  await expect(page.getByTestId('express-pour-youtube')).toHaveAttribute('aria-checked', 'true');
  if (!(await page.getByTestId('express-transcrire').isChecked())) await page.getByTestId('express-transcrire').click();
  await expect(page.getByTestId('express-transcrire')).toBeChecked();
  // Bruitages : décochés d'office (retour de Romain) ; cochés, ils sont seulement PROPOSÉS après le montage.
  await expect(page.getByTestId('express-bruitages')).not.toBeChecked();
  await page.getByTestId('express-bruitages').click();
  await expect(page.getByTestId('express-bruitages')).toBeChecked();
  const morceau = page.getByTestId('express-musique').locator('label', { hasText: 'Kevin MacLeod' }).locator('input');
  await morceau.click();
  await expect(morceau).toBeChecked();
  await expect(page.getByTestId('express-musique')).toContainText('Creative Commons: By Attribution 4.0');
  await expect(page.getByTestId('express-musique')).not.toContainText('windows shutdown'); // trop court pour une musique
  await capture(page, info, 'express-1-reglages');

  const debut = Date.now();
  await page.getByTestId('express-lancer').click();
  await expect(page.getByTestId('express-revue')).toBeVisible({ timeout: 240_000 });
  console.log(`[express] analyse en ${((Date.now() - debut) / 1000).toFixed(1)} s ; ${await page.getByTestId('express-total').textContent()}`);
  await expect(page.getByTestId('express-scene-0')).toBeVisible();
  await expect(page.getByTestId('express-cocher-0')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('express-aucune')).toHaveCount(0);
  await capture(page, info, 'express-2-revue');
  // Décocher puis recocher : la durée totale suit.
  const total = await page.getByTestId('express-total').textContent();
  await page.getByTestId('express-cocher-0').click();
  await expect(page.getByTestId('express-total')).not.toHaveText(total!);
  await expect(page.getByTestId('express-monter')).toBeDisabled();
  await page.getByTestId('express-cocher-0').click();
  await expect(page.getByTestId('express-total')).toHaveText(total!);

  await page.getByTestId('express-monter').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 60_000 });
  await expect(page.getByTestId('toast')).toContainText('Montage express prêt');
  const pret = (await page.getByTestId('toast').textContent())!;
  const dureeMontage = secondes(/\((.+)\)/.exec(pret)![1]!);
  console.log(`[express] ${pret}`);
  // La revue des bruitages s'ouvre : rien n'est posé tant qu'on n'a pas coché.
  await expect(page.getByTestId('panneau-bruitages')).toBeVisible();
  await expect(page.getByTestId('bruitage-0')).toBeVisible({ timeout: 60_000 });
  await capture(page, info, 'express-3-bruitages');
  await expect(page.getByTestId('bruitages-tout-poser')).toBeDisabled();
  await expect.poll(async () => (await projetCourant(page))?.recette?.titre, { timeout: 10_000 }).toBe('Montage express — obs-voix-jeu');
  expect(((await projetCourant(page)).recette as Record<string, any>).sons.filter((x: { role?: string }) => x.role === 'bruitage')).toHaveLength(0);
  await page.getByTestId('bruitage-garder-0').check();
  await page.getByTestId('bruitages-tout-poser').click();
  await expect(page.getByTestId('toast')).toContainText('1 bruitage posé');
  await page.getByTestId('panneau-fermer').click();
  await capture(page, info, 'express-3-habiller');

  // Le montage enregistré : toutes les parties A à G, et son titre.
  await expect.poll(async () => ((await projetCourant(page))?.recette as Record<string, any>)?.sons?.some((x: { role?: string }) => x.role === 'bruitage'), { timeout: 10_000 }).toBe(true);
  const r = (await projetCourant(page)).recette as Record<string, any>;
  console.log(`[express] ${r.plans.length} plans, ${r.sons.length} sons (${r.sons.map((s: { id: string; role?: string }) => `${s.id}:${s.role ?? ''}`).join(', ')})`);
  expect(r.titre).toBe('Montage express — obs-voix-jeu');
  expect(r.blancs).toMatchObject({ niveau: 'normal' });
  expect(r.rognages).toHaveLength(1);
  expect(r.sousTitres).toMatchObject({ mode: 'punchlines', style: 'punchline' });
  expect(r.sousTitres.punchlines.length).toBeGreaterThanOrEqual(2);
  expect(r.sons.filter((s: { role?: string }) => s.role === 'bruitage')).toHaveLength(1);
  expect(r.musique.morceaux).toHaveLength(1);
  expect(r.volumeFinal).toEqual({ lufs: -13, crete: -1.5 });
  expect(r.textes.some((x: { role?: string }) => x.role === 'accroche')).toBe(true);
  // Voix (2 × ~8,5 s) + explosion + accroche de 6 s.
  expect(dureeMontage).toBeGreaterThan(18);
  expect(dureeMontage).toBeLessThan(38);

  // 4. Annuler (les bruitages, puis le Montage express en une fois) revient à la vidéo brute ; Rétablir remet tout.
  await page.getByTestId('annuler').click();
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await expect(page.getByTestId('plan-1')).toBeVisible();
  expect(Math.abs(secondes((await page.getByTestId('duree-finale').textContent())!) - dureeMontage)).toBeLessThanOrEqual(0.5);
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('plan-1')).toHaveCount(0);
  await expect(page.getByTestId('duree-finale')).toContainText('40');
  await page.getByTestId('retablir').click();
  await expect(page.getByTestId('plan-1')).toBeVisible();
  await page.getByTestId('retablir').click(); // le bruitage coché
  await capture(page, info, 'express-4-couper');

  // 5. Export 16:9.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 420_000 });
  const bilan = page.getByTestId('auto-bilan-volume');
  await expect(bilan).toContainText('LUFS');
  await capture(page, info, 'express-5-export');
  const lufsAffiche = Number(await bilan.getAttribute('data-lufs'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const mp4 = info.outputPath('montage-express.mp4');
  await dl.saveAs(mp4);
  const input = new Input({ source: new FilePathSource(mp4), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const v = { l: video!.displayWidth, h: video!.displayHeight, duree: await input.computeDuration(), audio: !!(await input.getPrimaryAudioTrack()) };
  input.dispose();
  const mesure = mesurerFfmpeg(mp4);
  console.log(`[export] ${v.l} × ${v.h}, ${v.duree.toFixed(2)} s (montage ${dureeMontage} s) ; Arko ${lufsAffiche} LUFS ; ffmpeg ${mesure.lufs} LUFS, crête ${mesure.crete} dBFS`);
  expect(v.l).toBe(1920);
  expect(v.h).toBe(1080);
  expect(v.audio).toBe(true);
  expect(Math.abs(v.duree - dureeMontage)).toBeLessThanOrEqual(0.6);
  expect(Math.abs(lufsAffiche + 14)).toBeLessThanOrEqual(1);
  expect(Math.abs(mesure.lufs + 14)).toBeLessThanOrEqual(1);

  // Plus de barre de titre ni de barre des tâches (aucune ligne unie en haut ni en bas), après l'accroche.
  const png = info.outputPath('image-exportee.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '9', '-i', mp4, '-frames:v', '1', png]);
  const haute = await lignesUnies(png, 0, 30);
  const basse = await lignesUnies(png, v.h - 60, v.h);
  console.log(`[export] lignes unies : ${(haute * 100).toFixed(0)} % en haut, ${(basse * 100).toFixed(0)} % en bas`);
  expect(haute).toBe(0);
  expect(basse).toBe(0);
});
