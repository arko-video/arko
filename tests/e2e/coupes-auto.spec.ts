// Montage auto « Coupes » (dev 1) dans Chrome headless, au format téléphone, en YouTube 16:9 :
// import d'une capture OBS (barre de titre magenta 20 px, barre des tâches cyan 40 px) avec voix + bruit de jeu
// → « Couper les blancs » au son de la voix (aperçu, Appliquer, un seul Annuler) → « Enlever les bords de l'écran »
// (bords trouvés, Appliquer) → export 1920 × 1080 : durée = montage, et plus aucune barre dans l'image exportée.
// Vidéo de test : tests/fixtures/obs-voix-jeu.mp4 (tests/fixtures/fabriquer-obs-voix-jeu.py).
// Captures : dans le dossier de sortie du test (et ARKO_CAPTURES=/dossier si donné).

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from 'node:process';

const VIDEO = 'tests/fixtures/obs-voix-jeu.mp4';
const MODELES = 'tests/fixtures/modeles';
const port = Number(env.ARKO_PORT) || 4173;

test.use({
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
  const t = texte.replace(/ /g, ' ');
  const min = /(\d+) min/.exec(t);
  const sec = /(\d+(?:,\d)?) s/.exec(t);
  return (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]!.replace(',', '.')) : 0);
}

async function lireMp4(chemin: string) {
  const input = new Input({ source: new FilePathSource(chemin), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    return { l: video!.displayWidth, h: video!.displayHeight, duree: await input.computeDuration(), audio: !!(await input.getPrimaryAudioTrack()) };
  } finally {
    input.dispose();
  }
}

/**
 * Part des lignes [y0, y1[ de l'image qui sont « unies » (même couleur sur toute la largeur, comme une barre de titre
 * ou une barre des tâches). L'image du jeu (mire en bandes de couleur + grain) n'a aucune ligne unie.
 */
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

test('capture OBS avec voix + bruit : couper les blancs, enlever les bords, export 16:9', async ({ page }, info) => {
  test.setTimeout(600_000);
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));

  await page.goto('./');
  await expect(page.getByTestId('changer-destination')).toContainText('YouTube 16:9');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await expect(page.getByTestId('duree-finale')).toContainText('40');

  // 1. Couper les blancs, au son de la voix (sans le modèle Whisper).
  await page.getByTestId('auto-blancs-couper').click();
  await expect(page.getByTestId('panneau-blancs')).toBeVisible();
  await expect(page.getByTestId('blancs-sur-montage')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('blancs-methode-voix').click();
  await capture(page, info, 'coupes-1-reglages');
  const debut = Date.now();
  await page.getByTestId('blancs-analyser').click();
  await expect(page.getByTestId('blancs-apercu')).toBeVisible({ timeout: 180_000 });
  console.log(`[blancs] analyse en ${((Date.now() - debut) / 1000).toFixed(1)} s : ${await page.getByTestId('blancs-apercu').textContent()}`);
  await capture(page, info, 'coupes-2-apercu');
  // Serré garde moins que Large : l'aperçu change sans réécouter.
  await page.getByTestId('blancs-niveau-large').click();
  const large = await page.getByTestId('blancs-apercu').textContent();
  await page.getByTestId('blancs-niveau-normal').click();
  const normal = (await page.getByTestId('blancs-apercu').textContent())!;
  expect(large).not.toBe(normal);
  const [, apres] = normal.replace(/ /g, ' ').match(/→ (.+) de parole/)!;
  const attendu = secondes(apres!);
  console.log(`[blancs] Normal : ${normal} ; Large : ${large}`);
  // Deux phrases de ~8 s + l'explosion : entre 15 et 24 s gardées sur 40.
  expect(attendu).toBeGreaterThan(15);
  expect(attendu).toBeLessThan(24);

  await page.getByTestId('blancs-appliquer').click();
  await expect(page.getByTestId('panneau-blancs')).toHaveCount(0);
  await expect(page.getByTestId('plan-1')).toBeVisible();
  const dureeCoupee = secondes((await page.getByTestId('duree-finale').textContent())!);
  expect(Math.abs(dureeCoupee - attendu)).toBeLessThanOrEqual(1);
  await capture(page, info, 'coupes-3-coupe');
  // Un seul Annuler revient à la vidéo entière, Rétablir remet toutes les coupes.
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('plan-1')).toHaveCount(0);
  await expect(page.getByTestId('duree-finale')).toContainText('40');
  await page.getByTestId('retablir').click();
  await expect(page.getByTestId('plan-1')).toBeVisible();

  // 2. Enlever les bords de l'écran.
  await page.getByTestId('auto-rognage-couper').click();
  await expect(page.getByTestId('panneau-rognage')).toBeVisible();
  await expect(page.getByTestId('rognage-etat')).toContainText('px en haut', { timeout: 60_000 });
  const etat = (await page.getByTestId('rognage-etat').textContent())!.replace(/ /g, ' ');
  console.log(`[rognage] ${etat} ; ${await page.getByTestId('rognage-garde').textContent()}`);
  const [, haut, bas] = etat.match(/(\d+) px en haut, (\d+) px en bas/)!;
  expect(Number(haut)).toBeGreaterThanOrEqual(20);
  expect(Number(haut)).toBeLessThanOrEqual(26);
  expect(Number(bas)).toBeGreaterThanOrEqual(40);
  expect(Number(bas)).toBeLessThanOrEqual(46);
  await capture(page, info, 'coupes-4-rognage');
  await page.getByTestId('rognage-appliquer').click();
  await expect(page.getByTestId('panneau-rognage')).toHaveCount(0);
  await capture(page, info, 'coupes-5-rogne');

  // 3. Exporter (le Cadrage est sauté : la vidéo est déjà en 16:9).
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 420_000 });
  await capture(page, info, 'coupes-6-export');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const mp4 = info.outputPath('coupes-auto.mp4');
  await dl.saveAs(mp4);
  const v = await lireMp4(mp4);
  console.log(`[export] ${v.l} × ${v.h}, ${v.duree.toFixed(2)} s (montage ${dureeCoupee} s)`);
  expect(v.l).toBe(1920);
  expect(v.audio).toBe(true);
  expect(Math.abs(v.duree - dureeCoupee)).toBeLessThanOrEqual(0.6);

  // Plus de barre de titre en haut ni de barre des tâches en bas dans l'image exportée (aucune ligne unie),
  // alors que la vidéo d'origine en a (contrôle : 20 et 40 lignes unies sur 720).
  const png = info.outputPath('image-exportee.png');
  const source = info.outputPath('image-source.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2', '-i', mp4, '-frames:v', '1', png]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2', '-i', VIDEO, '-frames:v', '1', source]);
  expect(await lignesUnies(source, 2, 18)).toBeGreaterThan(0.9);
  expect(await lignesUnies(source, 684, 718)).toBeGreaterThan(0.9);
  const haute = await lignesUnies(png, 0, 30);
  const basse = await lignesUnies(png, v.h - 60, v.h);
  console.log(`[export] lignes unies : ${(haute * 100).toFixed(0)} % en haut, ${(basse * 100).toFixed(0)} % en bas`);
  expect(haute).toBe(0);
  expect(basse).toBe(0);
});

// Même vidéo, avec les sous-titres (Whisper sur l'appareil : le modèle est lu sur le disque, tests/fixtures/modeles/,
// à la place de huggingface.co). Vérifie la transcription longue et sa reprise (mots gardés dans IndexedDB).
test.describe('avec les sous-titres', () => {
  test.use({ serviceWorkers: 'block' });

  test('couper les blancs d\'après les mots, puis « déjà écouté » à la réouverture', async ({ page, context }, info) => {
    test.skip(!existsSync(join(MODELES, 'onnx-community/whisper-base_timestamped/onnx')), 'Modèle absent de tests/fixtures/modeles/');
    test.setTimeout(420_000);
    await context.route(/^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//, async (route) => {
      const url = new URL(route.request().url());
      const m = /^\/(.+?)\/resolve\/[^/]+\/(.+)$/.exec(url.pathname);
      const chemin = m ? join(MODELES, m[1]!, m[2]!) : '';
      const entetes = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Range, Content-Length', 'content-type': 'application/octet-stream' };
      if (!chemin || !existsSync(chemin)) return route.fulfill({ status: 404, headers: entetes, body: 'absent' });
      const corps = readFileSync(chemin);
      if (route.request().headers()['range'] === 'bytes=0-0') {
        return route.fulfill({ status: 206, headers: { ...entetes, 'content-range': `bytes 0-0/${corps.length}` }, body: corps.subarray(0, 1) });
      }
      return route.fulfill({ status: 200, headers: entetes, body: corps });
    });
    page.on('pageerror', (e) => console.log('[page]', e.message));
    await page.goto('./');
    await page.getByTestId('fichier').setInputFiles(VIDEO);
    await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });

    await page.getByTestId('auto-blancs-couper').click();
    await expect(page.getByTestId('blancs-methode-mots')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('panneau-blancs')).toContainText('module sous-titres');
    const debut = Date.now();
    await page.getByTestId('blancs-analyser').click();
    await expect(page.getByTestId('blancs-progression')).toBeVisible();
    await capture(page, info, 'mots-1-analyse');
    await expect(page.getByTestId('blancs-apercu')).toBeVisible({ timeout: 360_000 });
    const texte = (await page.getByTestId('blancs-apercu').textContent())!;
    console.log(`[mots] analyse en ${((Date.now() - debut) / 1000).toFixed(1)} s : ${texte}`);
    await expect(page.getByTestId('panneau-blancs')).not.toContainText('moins précis');
    await capture(page, info, 'mots-2-apercu');
    const [, apres] = texte.replace(/ /g, ' ').match(/→ (.+) de parole/)!;
    expect(secondes(apres!)).toBeGreaterThan(14);
    expect(secondes(apres!)).toBeLessThan(24);
    await page.getByTestId('blancs-appliquer').click();
    await expect(page.getByTestId('plan-1')).toBeVisible();

    // Réouverture : « toute la vidéo » est déjà transcrite (gardée sur l'appareil), aucune nouvelle écoute.
    await page.getByTestId('auto-blancs-couper').click();
    await page.getByTestId('blancs-sur-toute').click();
    await expect(page.getByTestId('panneau-blancs')).toContainText('Déjà écouté');
    const reprise = Date.now();
    await page.getByTestId('blancs-analyser').click();
    await expect(page.getByTestId('blancs-apercu')).toBeVisible({ timeout: 30_000 });
    console.log(`[mots] reprise en ${((Date.now() - reprise) / 1000).toFixed(1)} s`);
    expect(Date.now() - reprise).toBeLessThan(15_000);
  });
});
