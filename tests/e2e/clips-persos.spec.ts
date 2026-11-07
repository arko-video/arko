// Persos de qui parle dans le monteur SANS IA (7/11/2026), en TikTok 9:16, dans Chrome headless au format téléphone.
// 1. Session fabriquée de 5 min 20 (fond vert foncé 1280 × 720) : 2 voix synthétiques dans UN mélange (−40 / −25 dB,
//    comme la session de Romain), bruit de jeu, un fou rire de 4 s à 150 s et un cri à 240 s ; les mots posés comme une
//    transcription déjà faite (Montage express) : le monteur les reprend.
// 2. Monteur IA → Sans IA, 2 clips, « Persos de qui parle » coché d'office → revue : lien « Qui parle ? », 2 voix,
//    on nomme la voix 1 → Garder le 1er clip → Retoucher → export 1080 × 1920.
// 3. Dans les images exportées : le perso de la voix qui parle à SA place (voix 1 à gauche, voix 2 plus à droite),
//    avec SON perso (couleur de sa tenue), au-dessus des sous-titres, hors des 20 % du bas et de la bande de droite ;
//    jamais de perso dans les sous-titres. Aucune erreur.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { bruitDeJeu, fabriquerVoix, FREQ_TEST, mixer, toursAlternes, VOIX_A, VOIX_B, type TourVrai } from '../../src/auto/voix/voix-test';
import { boitePerso, placeAuto, type Boite } from '../../src/moteur/couches/places-persos';
import { calculerEmpreinte } from '../../src/stockage/fichiers';
import { lireRecette, motsDesTours, png, wav16k } from './outils-best-of';

const DUREE = 320;
const FOND = [0x18, 0x50, 0x28] as const;
const TIKTOK = { l: 1080, h: 1920 };

test.use({ actionTimeout: 20_000, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });

async function capture(page: Page, info: TestInfo, nom: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath(`${nom}.png`), fullPage: true });
  if (env.ARKO_CAPTURES) await page.screenshot({ path: `${env.ARKO_CAPTURES}/${nom}.png`, fullPage: true });
}

function fabriquer(dossier: string, tours: TourVrai[]): string {
  const a = fabriquerVoix(VOIX_A, tours.filter((t) => t.v === 0), DUREE, -40, 1);
  const b = fabriquerVoix(VOIX_B, tours.filter((t) => t.v === 1), DUREE, -25, 2);
  const fort = new Float32Array(DUREE * FREQ_TEST);
  for (let i = 150 * FREQ_TEST; i < 154 * FREQ_TEST; i++) {
    const t = i / FREQ_TEST;
    fort[i] = 0.35 * Math.max(0, Math.sin(2 * Math.PI * 5 * t)) * (Math.sin(2 * Math.PI * 420 * t) + 0.5 * Math.sin(2 * Math.PI * 840 * t));
  }
  for (let i = 240 * FREQ_TEST; i < 241.2 * FREQ_TEST; i++) fort[i] = 0.6 * Math.sin((2 * Math.PI * 900 * i) / FREQ_TEST);
  const son = join(dossier, 'son.wav');
  writeFileSync(son, wav16k(mixer(a, b, fort, bruitDeJeu(DUREE, -52))));
  const mp4 = join(dossier, 'session-clips.mp4');
  const c = FOND.map((x) => x.toString(16).padStart(2, '0')).join('');
  execFileSync('ffmpeg', [
    ...'-y -v error -f lavfi'.split(' '),
    '-i', `color=c=0x${c}:s=1280x720:r=10:d=${DUREE}`,
    '-i', son,
    ...'-map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 30 -g 30 -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 128k -shortest'.split(' '),
    mp4,
  ]);
  return mp4;
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Image 270 × 480 (RGB) de l'export. */
async function lire(fichier: string) {
  return sharp(fichier).removeAlpha().resize(270, 480, { fit: 'fill' }).raw().toBuffer();
}

/** Part des pixels proches de `rgb` dans la boîte (parts de l'image). */
function part(data: Buffer, b: Boite, rgb: number[], tol = 70): number {
  let n = 0;
  let oui = 0;
  for (let y = Math.max(0, Math.floor(b.y0 * 480)); y < Math.min(480, Math.ceil(b.y1 * 480)); y++)
    for (let x = Math.max(0, Math.floor(b.x0 * 270)); x < Math.min(270, Math.ceil(b.x1 * 270)); x++) {
      const i = (y * 270 + x) * 3;
      n++;
      if (Math.abs(data[i]! - rgb[0]!) + Math.abs(data[i + 1]! - rgb[1]!) + Math.abs(data[i + 2]! - rgb[2]!) < tol) oui++;
    }
  return n === 0 ? 0 : oui / n;
}

/** Plus haute ligne de texte blanc (sous-titres) au milieu de l'image, entre 0,45 et 0,85 (null : pas de texte). */
function hautDuTexte(data: Buffer): number | null {
  for (let y = Math.floor(0.45 * 480); y < 0.85 * 480; y++) {
    let blancs = 0;
    for (let x = Math.floor(0.3 * 270); x < 0.7 * 270; x++) {
      const i = (y * 270 + x) * 3;
      if (data[i]! > 225 && data[i + 1]! > 225 && data[i + 2]! > 225) blancs++;
    }
    if (blancs >= 3) return y / 480;
  }
  return null;
}

test('Clip 9:16 sans IA, 2 voix : le perso de la voix qui parle à sa place, au-dessus des sous-titres, export sans erreur', async ({ page }, info) => {
  test.setTimeout(900_000);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  await page.addInitScript(() => localStorage.setItem('arko.conseils.vus', '1'));
  const dossier = mkdtempSync(join(tmpdir(), 'arko-clips-persos-'));
  const tours = toursAlternes(DUREE, 5);
  const mp4 = fabriquer(dossier, tours);
  const emp = await calculerEmpreinte(new Blob([readFileSync(mp4)]));
  const mots = motsDesTours(tours);

  // 1. La transcription déjà faite (comme après un Montage express), puis la vidéo → Monteur IA.
  await page.goto('./');
  await page.evaluate(
    async ({ emp, duree, mots }) => {
      const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
      const ouverture = indexedDB.open('keyval-store');
      ouverture.onupgradeneeded = () => ouverture.result.createObjectStore('keyval');
      const db = await attendre(ouverture);
      const g = { version: 1, duree, langue: 'fr', plages: [{ de: 0, a: duree + 1 }], mots };
      await attendre(db.transaction('keyval', 'readwrite').objectStore('keyval').put(g, `arko.transcription.${emp}`));
      db.close();
    },
    { emp, duree: DUREE, mots },
  );
  await page.getByTestId('fichier').setInputFiles(mp4);
  await expect(page.getByTestId('choix-monteur')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('choix-monteur-ia').click();
  await expect(page.getByTestId('monteur-demande')).toBeVisible();
  for (let i = 10; i > 2; i--) await page.getByTestId('nombre-moins').click();
  await expect(page.getByTestId('mode-sansIA')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('persos-clips')).toBeChecked(); // coché d'office
  await capture(page, info, 'clips-1-demande');
  const debut = Date.now();
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('voir-clips')).toBeVisible({ timeout: 300_000 });
  console.log(`[clips] analyse + voix en ${((Date.now() - debut) / 1000).toFixed(1)} s`);
  await page.getByTestId('voir-clips').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('1 / 2');

  // 2. Revue : « Qui parle ? » → 2 voix ; on nomme la voix 1.
  await expect(page.getByTestId('revue-lien-qui-parle')).toBeVisible();
  await page.getByTestId('revue-lien-qui-parle').click();
  await expect(page.getByTestId('v3-cartes-voix').locator('li')).toHaveCount(2);
  await page.getByTestId('v3-voix-nom-p1').fill('Romain');
  await page.getByTestId('v3-voix-nom-p1').press('Tab');
  await capture(page, info, 'clips-2-revue');
  await page.getByTestId('garder').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('2 / 2');
  await page.getByTestId('jeter').click();
  await expect(page.getByTestId('revue-fin')).toBeVisible();
  await page.getByTestId('retoucher-premier').click();
  await expect.poll(async () => (await lireRecette(page))?.personnes?.length ?? 0, { timeout: 15_000 }).toBe(2);
  const r = (await lireRecette(page)) as Awaited<ReturnType<typeof lireRecette>> & {
    personnes: { id: string; nom: string; chibi: { couleur: string } }[];
    sousTitres?: { y?: number; mots?: unknown };
    destination?: string;
  };
  console.log(`[clips] clip ${r.plans[0]!.de}–${r.plans[0]!.a} s, ${r.paroles?.length} tours, personnes ${r.personnes.map((p) => `${p.id}=${p.nom}`).join(', ')}`);
  expect(r.personnes.map((p) => p.nom)).toEqual(['Romain', 'Voix 2']);
  expect(r.avatars).toEqual({ mode: 'parle', rebond: true });
  expect(Array.isArray(r.sousTitres?.mots)).toBe(true); // les mots repris de la transcription gardée

  // 3. Export 9:16.
  for (let i = 0; i < 4 && (await page.getByTestId('etape').textContent()) !== 'Étape 4 sur 5'; i++) await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await capture(page, info, 'clips-3-habiller');
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 600_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const sortie = info.outputPath('clip-9-16.mp4');
  await dl.saveAs(sortie);
  const input = new Input({ source: new FilePathSource(sortie), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  expect([video!.displayWidth, video!.displayHeight]).toEqual([1080, 1920]);
  const duree = await input.computeDuration();
  input.dispose();

  // Places attendues (les mêmes règles que le rendu) : rang dans la recette, sous-titres à 0,66 (fond flou).
  const yST = r.sousTitres?.y ?? 0.66;
  const boites = r.personnes.map((_, rang) => boitePerso(placeAuto(rang, r.personnes.length, TIKTOK, true, yST), TIKTOK));
  for (const b of boites) {
    expect(b.x1).toBeLessThanOrEqual(0.85);
    expect(b.y1).toBeLessThanOrEqual(0.8);
    expect(b.y1).toBeLessThan(yST - 0.04);
  }
  expect(boites[0]!.x1).toBeLessThan(boites[1]!.x0); // sans chevauchement
  const couleurs = r.personnes.map((p) => hex((p.chibi as { couleur: string }).couleur));

  // Images où une seule voix parle depuis 0,9 s (vérité), loin des bords du plan.
  const de = r.plans[0]!.de;
  const qui = (ts: number) => tours.filter((t) => ts >= t.de && ts < t.a).map((t) => t.v);
  const ids = ['p1', 'p2'];
  const vus = { bons: 0, total: 0, texte: 0, texteSousPieds: 0, horsPlace: 0 };
  let deux: string | null = null;
  for (let t = 0.8; t < duree - 0.6; t += 0.5) {
    const ts = de + t;
    const ici = qui(ts);
    const image = png(sortie, t, info.outputPath(`f-${t.toFixed(1)}.png`));
    const data = await lire(image);
    const presents = couleurs.map((c, k) => part(data, boites[k]!, c));
    // Jamais de perso sous ses pieds (dans la bande des sous-titres et en bas).
    for (let k = 0; k < 2; k++) if (part(data, { ...boites[k]!, y0: boites[k]!.y1 + 0.012, y1: 0.85 }, couleurs[k]!) > 0.01) vus.horsPlace++;
    const haut = hautDuTexte(data);
    if (haut !== null) {
      vus.texte++;
      if (haut >= Math.max(...boites.map((b) => b.y1)) - 0.005) vus.texteSousPieds++;
    }
    if (!deux && presents.every((x) => x > 0.03)) deux = image;
    if (ici.length !== 1 || qui(ts - 0.9).some((v) => v !== ici[0]) || qui(ts + 0.2).some((v) => v !== ici[0])) continue;
    // La personne qui parle : l'id de la recette dont les tours couvrent ce moment.
    const p = (r.paroles ?? []).find((x) => ts >= x.ts && ts < x.fin)?.p;
    const k = p ? ids.indexOf(p) : -1;
    if (k < 0) continue;
    vus.total++;
    if (presents[k]! > 0.03 && presents[1 - k]! < 0.01) vus.bons++;
  }
  console.log(`[clips] ${vus.bons}/${vus.total} images : le bon perso à la bonne place ; texte vu ${vus.texte} fois, sous les pieds ${vus.texteSousPieds} ; perso hors place ${vus.horsPlace}`);
  expect(vus.total).toBeGreaterThanOrEqual(6);
  expect(vus.bons).toBeGreaterThanOrEqual(vus.total * 0.85);
  expect(vus.texte).toBeGreaterThan(3);
  expect(vus.texteSousPieds).toBe(vus.texte);
  expect(vus.horsPlace).toBe(0);
  if (deux) {
    copyFileSync(deux, info.outputPath('placement-9-16.png'));
    if (env.ARKO_CAPTURES) copyFileSync(deux, `${env.ARKO_CAPTURES}/placement-9-16.png`);
  }
  expect(erreurs).toEqual([]);
});
