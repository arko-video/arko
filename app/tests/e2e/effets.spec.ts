// Phase 3 au format téléphone (360 × 740), dans Chrome headless : son guide dans Couper, puis dans Habiller
// un son (volume 150 %), une transition « Flash » sur toutes les coupes et un zoom ; Annuler / Rétablir ;
// export, puis le MP4 lu avec ffmpeg : énergie du son autour du son posé, image de la coupe éclaircie par le flash,
// et le rappel du son guide ; un son importé (bip à 1 kHz) est dans le MP4, le son guide (3 kHz) n'y est pas.
// Reprise : sons importés et son guide rouverts sans les re-choisir. Captures facultatives : ARKO_CAPTURES=/dossier.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const VIDEO = 'tests/fixtures/test-1920x1080.mp4';
const CAPTURES = process.env.ARKO_CAPTURES;
const SON = 'impact.boom';

test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  await page.waitForTimeout(800); // l'aperçu finit de dessiner, les icônes tournent
  await page.screenshot({ path: `${CAPTURES}/${nom}.png` });
}

/** Tête de lecture à n secondes, au clavier (Début puis n × « +1 s »). */
async function teteA(page: Page, n: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < n; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(n));
}

async function importer(page: Page) {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
}

/** Échantillons mono 48 kHz (f32) de la piste son du MP4. */
function lireSon(mp4: string): Float32Array {
  const brut = execFileSync('ffmpeg', ['-v', 'error', '-i', mp4, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 64 << 20 });
  return new Float32Array(brut.buffer, brut.byteOffset, brut.byteLength / 4);
}

function rms(pcm: Float32Array, de: number, a: number): number {
  const [i0, i1] = [Math.round(de * 48000), Math.round(a * 48000)];
  let s = 0;
  for (let i = i0; i < i1; i++) s += pcm[i]! * pcm[i]!;
  return Math.sqrt(s / Math.max(1, i1 - i0));
}

/**
 * WAV mono 48 kHz : une sinusoïde (la vidéo de test sonne à 440 Hz, loin de 1 et 3 kHz). Écrit dans le dossier
 * temporaire : setInputFiles échoue sans bruit sur certains chemins accentués (dossiers de résultats).
 */
function wav(testInfo: TestInfo, nom: string, freq: number, duree: number): string {
  const n = Math.round(duree * 48000);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  [16, 0x10001, 48000, 96000, 0x100002].forEach((v, k) => b.writeUInt32LE(v, 16 + k * 4));
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(26000 * Math.sin((2 * Math.PI * freq * i) / 48000)), 44 + i * 2);
  const chemin = join(tmpdir(), `arko-${testInfo.testId}-${nom}`);
  writeFileSync(chemin, b);
  return chemin;
}

/** Amplitude de la fréquence `freq` entre `de` et `a` (≈ moitié de l'amplitude d'une sinusoïde présente). */
function amplitude(pcm: Float32Array, de: number, a: number, freq: number): number {
  const [i0, i1] = [Math.round(de * 48000), Math.min(pcm.length, Math.round(a * 48000))];
  let [re, im] = [0, 0];
  for (let i = i0; i < i1; i++) {
    const w = (2 * Math.PI * freq * i) / 48000;
    re += pcm[i]! * Math.cos(w);
    im += pcm[i]! * Math.sin(w);
  }
  return Math.hypot(re, im) / Math.max(1, i1 - i0);
}

/** Luminance moyenne (0 à 255) de l'image du MP4 au temps t. */
function luminance(mp4: string, t: number): number {
  const brut = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=54:96,format=gray', '-f', 'rawvideo', '-']);
  return brut.reduce((s, x) => s + x, 0) / brut.length;
}

test('Transitions : un seul plan → message pour aller couper', async ({ page }) => {
  await importer(page);
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await page.getByTestId('outil-transitions').click();
  await expect(page.getByTestId('transitions-un-plan')).toContainText('Coupe ta vidéo dans l\'étape Couper');
  await capture(page, 'transitions-un-plan');
});

test('Effets : son guide, son, transition partout, zoom, export vérifié dans le MP4', async ({ page }, testInfo) => {
  await importer(page);

  // --- Couper : son guide (bandeau permanent, début réglé), puis deux coupes à 2 s et 4 s.
  await page.getByTestId('son-guide-bouton-fichier').setInputFiles(wav(testInfo, 'guide-3k.wav', 3000, 10));
  await expect(page.getByTestId('bandeau-guide')).toContainText('ne sera pas dans ta vidéo');
  await page.getByTestId('debut-guide').fill('5');
  await expect(page.getByTestId('decaler-guide-valeur')).toHaveText('0:05,0');
  await page.getByTestId('decaler-guide-plus').click();
  await expect(page.getByTestId('decaler-guide-valeur')).toHaveText('0:05,1');
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('decaler-guide-valeur')).toHaveText('0:05,0');
  await page.getByTestId('cale-rythme').check();
  await page.getByTestId('son-guide').scrollIntoViewIfNeeded();
  await capture(page, 'couper-son-guide');
  await page.getByTestId('cale-rythme').uncheck(); // coupes à des temps exacts pour la suite
  for (const n of [2, 4]) {
    await teteA(page, n);
    await page.getByTestId('scinder').click();
  }
  await expect(page.getByTestId('plan-2')).toBeVisible();
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  for (const o of ['sons', 'transitions', 'zoom']) await expect(page.getByTestId(`outil-${o}`)).toBeVisible();
  await page.getByTestId('barre-outils').evaluate((e) => (e.scrollLeft = e.scrollWidth));
  await capture(page, 'habiller-barre-phase3');

  // --- Sons : « + » à 1 s, attaché au temps source ; repère sur la mini-frise ; volume 150 %.
  await teteA(page, 1);
  await page.getByTestId('outil-sons').click();
  // Le panneau s'ouvre sur « Mes sons » ; les sons d'Arko sont dans les familles.
  await page.getByTestId('famille-impact').click();
  await expect(page.getByTestId('droits-sons')).toContainText('le droit de publier');
  await capture(page, 'sons-liste');
  await page.getByTestId(`son-ajouter-${SON}`).click();
  const repere = page.locator('[data-testid^="calque-son-"]').first();
  await expect(repere).toBeVisible();
  await repere.click();
  await expect(page.getByTestId('reglages-son')).toBeVisible();
  await page.getByTestId('volume-son').fill('150');
  await expect(page.getByTestId('volume-son-valeur')).toHaveText(/^150\s%$/);
  await page.getByTestId('decaler-son-plus').click();
  await expect(page.getByTestId('decaler-son-valeur')).toHaveText('À 0:01,1');
  await capture(page, 'sons-reglages');
  await page.getByTestId('annuler').click();
  // Après Annuler, la sélection est remise à zéro (on ne règle jamais le mauvais son) : on rouvre le son.
  await page.locator('[data-testid^="calque-son-"]').first().click();
  await expect(page.getByTestId('decaler-son-valeur')).toHaveText('À 0:01,0');
  await page.getByTestId('retour-sons').click();

  // --- Son importé (bip à 1 kHz) posé à 3 s : il arrive dans « Mes sons ».
  await teteA(page, 3);
  await page.getByTestId('importer-son-fichier').setInputFiles(wav(testInfo, 'bip-1k.wav', 1000, 0.6));
  await expect(page.getByTestId('famille-mes')).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-testid^="son-ajouter-"]').first().click();
  await expect(page.locator('[data-testid^="calque-son-"]')).toHaveCount(2);
  await page.getByTestId('panneau-fermer').click();

  // --- Transitions : Flash sur la coupe 1, puis sur toutes ; Annuler / Rétablir.
  await page.getByTestId('outil-transitions').click();
  await expect(page.getByTestId('calque-coupe-1')).toBeVisible();
  await page.getByTestId('calque-coupe-1').click();
  await page.getByTestId('transition-flash').click();
  await expect(page.getByTestId('transition-flash')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('transition-avec-son')).toBeChecked();
  await page.getByTestId('transition-partout').click();
  await page.getByTestId('coupe-2').click();
  await expect(page.getByTestId('transition-flash')).toHaveAttribute('aria-checked', 'true');
  // Annuler / Rétablir remettent la sélection à zéro : on rouvre la coupe à chaque fois.
  await page.getByTestId('annuler').click();
  await page.getByTestId('coupe-2').click();
  await expect(page.getByTestId('transition-coupe')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('retablir').click();
  await page.getByTestId('coupe-2').click();
  await expect(page.getByTestId('transition-flash')).toHaveAttribute('aria-checked', 'true');
  await capture(page, 'transitions-grille');
  await page.getByTestId('panneau-fermer').click();

  // --- Zoom à 3 s : cible glissée sur l'aperçu, style Doux, force 2.
  await teteA(page, 3);
  await page.getByTestId('outil-zoom').click();
  await capture(page, 'zoom-ajouter');
  await page.getByTestId('ajouter-zoom').click();
  const cible = page.getByTestId('cible-zoom');
  await expect(cible).toBeVisible();
  const b = (await cible.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 - 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await cible.boundingBox())!.y).toBeLessThan(b.y - 20);
  await page.getByTestId('style-zoom-doux').click();
  await page.getByTestId('force-zoom').fill('2');
  await expect(page.getByTestId('force-zoom-valeur')).toHaveText('×2,0');
  await expect(page.locator('[data-testid^="calque-zoom-"]').first()).toBeVisible();
  await capture(page, 'zoom-reglages');
  await page.getByTestId('panneau-fermer').click();

  // --- Export, puis le MP4.
  await page.getByTestId('suivant').click();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('rappel-guide')).toHaveText('Dans TikTok, ajoute ton son et démarre-le à 0:05');
  await capture(page, 'export-rappel-guide');

  // Le MP4 par le bouton Télécharger (la CSP interdit fetch() sur un blob:).
  const mp4 = testInfo.outputPath('effets.mp4');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  await telechargement.saveAs(mp4);

  // Son : nettement plus d'énergie juste après 1 s (le boom à 150 %) que dans le passage d'avant.
  const pcm = lireSon(mp4);
  const avant = rms(pcm, 0.3, 0.8);
  const pendant = rms(pcm, 1.0, 1.3);
  expect(pendant, `RMS ${pendant.toFixed(4)} contre ${avant.toFixed(4)} avant le son`).toBeGreaterThan(avant * 1.5);
  // Son importé : le bip à 1 kHz est là après 3 s, pas avant. Son guide (3 kHz) : absent de tout le MP4.
  const bip = amplitude(pcm, 3.05, 3.5, 1000);
  expect(bip, 'bip importé dans le MP4').toBeGreaterThan(Math.max(0.05, 10 * amplitude(pcm, 2.3, 2.9, 1000)));
  expect(amplitude(pcm, 0, pcm.length / 48000, 3000), 'son guide absent du MP4').toBeLessThan(bip / 50);

  // Transition : le flash blanc éclaircit l'image de la coupe (2 s) par rapport au milieu du plan (1,5 s).
  const coupe = luminance(mp4, 2.0);
  const milieu = luminance(mp4, 1.5);
  expect(coupe, `luminance ${coupe.toFixed(0)} à la coupe contre ${milieu.toFixed(0)}`).toBeGreaterThan(milieu + 40);
});

test('Reprise : sons importés et son guide rouverts sans les re-choisir', async ({ page }, testInfo) => {
  await importer(page);
  await page.getByTestId('son-guide-bouton-fichier').setInputFiles(wav(testInfo, 'guide.wav', 3000, 4));
  await expect(page.getByTestId('bandeau-guide')).toBeVisible();
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await teteA(page, 1);
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('famille-mes').click(); // « Importer un son » est sous « Importés » (Mes sons s'ouvre en premier)
  await page.getByTestId('importer-son-fichier').setInputFiles(wav(testInfo, 'bip.wav', 1000, 0.5));
  await page.locator('[data-testid^="son-ajouter-"]').first().click();
  await expect(page.locator('[data-testid^="calque-son-"]')).toHaveCount(1);
  await page.getByTestId('panneau-fermer').click();
  await expect(page.getByTestId('enregistre')).toHaveAttribute('data-etat', 'enregistre', { timeout: 10_000 });

  // Rechargement, puis reprise : seule la vidéo est re-choisie.
  await page.reload();
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await choix.setFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 30_000 });
  await page.getByTestId('outil-sons').click();
  await expect(page.locator('[data-testid^="calque-son-"]')).toHaveCount(1);
  await page.getByTestId('famille-mes').click();
  await expect(page.locator('[data-testid^="son-ajouter-"]')).toHaveCount(1);
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await expect(page.getByTestId('bandeau-guide')).toBeVisible();
  await expect(page.getByTestId('decaler-guide-valeur')).toHaveText('0:00,0');
});
