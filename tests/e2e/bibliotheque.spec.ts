// « Ma bibliothèque », « Fond vert » et « Mèmes » au format téléphone (360 × 800), dans Chrome.
// TOUT est fabriqué ici par ffmpeg (aucun fichier de Romain) : un dossier « Pack » comme le sien (sound effect,
// son de fond, effet de fond vert, meme, un .sfk, un .wmv, et un clip sans dossier reconnu), une vidéo de jeu sans vert.
// 1. Import du dossier : rangement automatique, « Où ranger ? » pour le clip sans dossier, .wmv « à convertir ».
// 2. Habiller : un fond vert (personnage sur vert bruité, compressé), un mème « Coupure », un mème « Incrustation »
//    (sur fond vert, détouré tout seul) ; export sans erreur.
// 3. Dans le MP4 : durées, images sans vert (personnage gardé), sons de chaque clip à leur place.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });

const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest'];
const sinus = (f: number, d: number) => ['-f', 'lavfi', '-i', `sine=frequency=${f}:sample_rate=48000:duration=${d}`];

/** Un dossier « Pack » comme celui de Romain, et une vidéo de jeu (bleu nuit et formes orange : aucun vert). */
function fabriquer(): { pack: string; jeu: string } {
  const racine = mkdtempSync(join(tmpdir(), 'arko-bib-'));
  const pack = join(racine, 'Pack');
  for (const d of ['sound effect', 'son de fond', 'effet de fond vert', 'meme', 'divers']) mkdirSync(join(pack, d), { recursive: true });
  // Fond vert : personnage simple (tête couleur peau, cheveux noirs, t-shirt bleu, jambes grises) sur vert bruité.
  const perso = 'drawbox=x=280:y=60:w=80:h=24:color=0x161210:t=fill,drawbox=x=280:y=84:w=80:h=70:color=0xE0AC8C:t=fill,drawbox=x=250:y=160:w=140:h=110:color=0x1E3478:t=fill,drawbox=x=270:y=270:w=40:h=80:color=0x6E6E76:t=fill,drawbox=x=330:y=270:w=40:h=80:color=0x6E6E76:t=fill';
  ff(['-f', 'lavfi', '-i', 'color=c=0x28B946:s=640x360:r=30:d=3', ...sinus(3000, 3), '-vf', `noise=alls=24:allf=t,${perso}`, ...X264, join(pack, 'effet de fond vert', 'abonne.mp4')]);
  // Mème carré (orange, rond violet) : en coupure, bandes floues au-dessus et en dessous.
  ff(['-f', 'lavfi', '-i', 'color=c=0xE8A030:s=400x400:r=30:d=2', ...sinus(1000, 2), '-vf', 'drawbox=x=120:y=120:w=160:h=160:color=0x8030C0:t=fill', ...X264, join(pack, 'meme', 'bruh.mp4')]);
  // Mème sur fond vert (un « chat » rouge) : Arko doit proposer de l'incruster en enlevant le vert.
  ff(['-f', 'lavfi', '-i', 'color=c=0x20C040:s=480x270:r=30:d=2', ...sinus(2000, 2), '-vf', 'noise=alls=16:allf=t,drawbox=x=170:y=70:w=140:h=130:color=0xC82020:t=fill', ...X264, join(pack, 'meme', 'chat vert.mp4')]);
  // Clip sans dossier reconnu (on demandera son rayon).
  ff(['-f', 'lavfi', '-i', 'color=c=0x806040:s=320x240:r=30:d=1', ...sinus(500, 1), ...X264, join(pack, 'divers', 'clip.mp4')]);
  // Sons : un bruitage (+ son .sfk à ignorer), une musique ; une vidéo .wmv à convertir.
  ff([...sinus(700, 1), join(pack, 'sound effect', 'boom.wav')]);
  writeFileSync(join(pack, 'sound effect', 'boom.wav.sfk'), Buffer.from('SFK fichier de crêtes'));
  ff([...sinus(250, 10), join(pack, 'son de fond', 'musique.mp3')]);
  writeFileSync(join(pack, 'effet de fond vert', 'vieux.wmv'), Buffer.from('pas une vraie vidéo'));
  // Vidéo de jeu : 6 s, 1280 × 720, son à 440 Hz.
  const jeu = join(racine, 'jeu.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=0x283250:s=1280x720:r=30:d=6', ...sinus(440, 6), '-vf', "drawbox=x='mod(t*200,1100)':y=300:w=180:h=120:color=0xF07020:t=fill,drawbox=x=100:y=80:w=300:h=60:color=0x9050D0:t=fill", ...X264, jeu]);
  return { pack, jeu };
}

async function teteA(page: Page, n: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < n; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(n));
}

/** Pixels d'une image du MP4 au temps t (RVB, 270 × 480). */
async function image(mp4: string, t: number, png: string): Promise<{ d: Buffer; l: number; h: number }> {
  ff(['-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=270:480', png]);
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: data, l: info.width, h: info.height };
}

/** Part des pixels nettement verts, et part des pixels « couleur peau » / « rouge » (personnage, chat). */
function parts(img: { d: Buffer }) {
  let vert = 0;
  let peau = 0;
  let rouge = 0;
  const n = img.d.length / 3;
  for (let i = 0; i < img.d.length; i += 3) {
    const [r, g, b] = [img.d[i]!, img.d[i + 1]!, img.d[i + 2]!];
    if (g > 90 && g - Math.max(r, b) > 40) vert++;
    if (r > 180 && g > 130 && g < 200 && b > 100 && b < 170) peau++;
    if (r > 150 && g < 70 && b < 70) rouge++;
  }
  return { vert: vert / n, peau: peau / n, rouge: rouge / n };
}

/** Amplitude d'une fréquence dans [de, a] du son du MP4. */
function amplitudes(mp4: string, wav: string) {
  ff(['-i', mp4, '-ac', '1', '-ar', '48000', '-f', 'f32le', wav]);
  const brut = readFileSync(wav);
  const pcm = new Float32Array(brut.buffer, brut.byteOffset, brut.length / 4);
  return (de: number, a: number, f: number) => {
    const [i0, i1] = [Math.round(de * 48000), Math.round(a * 48000)];
    let re = 0;
    let im = 0;
    for (let i = i0; i < i1; i++) {
      re += pcm[i]! * Math.cos((2 * Math.PI * f * i) / 48000);
      im += pcm[i]! * Math.sin((2 * Math.PI * f * i) / 48000);
    }
    return (2 * Math.hypot(re, im)) / (i1 - i0);
  };
}

test('Ma bibliothèque : import d\'un dossier, fond vert + mème coupure + mème incrustation, export sans vert', async ({ page }, testInfo) => {
  const { pack, jeu } = fabriquer();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('./');

  // 1. Import du dossier entier dans Ma bibliothèque.
  await page.getByTestId('ouvrir-bibliotheque').click();
  await expect(page.getByTestId('bibliotheque')).toBeVisible();
  await page.getByTestId('bibliotheque-dossier-input').setInputFiles(pack);
  await expect(page.getByTestId('demande-rayon')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('demande-rayon')).toContainText('1');
  await page.getByTestId('demande-rayon-memes').click();
  await expect(page.getByTestId('bibliotheque-progres')).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId('bibliotheque-a-convertir')).toContainText('vieux.wmv');
  await expect(page.getByTestId('bibliotheque-a-convertir')).toContainText('convertis-le en .mp4');
  await expect(page.getByTestId('bibliotheque-ignores')).toBeVisible();
  const compter = async (rayon: string) => {
    await page.getByTestId(`rayon-${rayon}`).click();
    return page.getByTestId(`liste-rayon-${rayon}`).locator('li').count();
  };
  expect(await compter('bruitages')).toBe(1);
  expect(await compter('musiques')).toBe(1);
  expect(await compter('fondsVerts')).toBe(1);
  expect(await compter('memes')).toBe(3);
  // Le mème sur fond vert est reconnu (pastille « fond vert »).
  await expect(page.getByTestId('liste-rayon-memes').locator('li', { hasText: 'chat vert' })).toContainText('fond vert');
  await page.screenshot({ path: testInfo.outputPath('1-bibliotheque.png') });
  await page.getByTestId('bibliotheque-fermer').click();
  await expect(page.getByTestId('bibliotheque')).toHaveCount(0);

  // 2. Montage : vidéo de jeu → Habiller.
  await page.getByTestId('fichier').setInputFiles(jeu);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');

  // Fond vert à 1 s.
  await teteA(page, 1);
  await page.getByTestId('outil-fondVert').click();
  await page.getByTestId('liste-fondsVerts').locator('li', { hasText: 'abonne' }).getByRole('button').click();
  await expect(page.getByTestId('reglages-clip')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('clip-detourer')).toBeChecked();
  await expect(page.getByTestId('cadre-clip')).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath('2-fond-vert.png') });
  await page.getByTestId('clip-retour').click();
  await page.getByTestId('panneau-fermer').click();

  // Mème « Coupure » à 4 s, puis mème « Incrustation » (sur fond vert) au début.
  await teteA(page, 4);
  await page.getByTestId('outil-memes').click();
  await page.getByTestId('liste-memes').locator('li', { hasText: 'bruh' }).getByRole('button', { name: /Couper la vidéo/ }).click();
  await expect(page.getByTestId('reglages-coupure')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('clip-retour').click();
  await page.getByTestId('panneau-fermer').click();
  await teteA(page, 0);
  await page.getByTestId('outil-memes').click();
  await page.getByTestId('liste-memes').locator('li', { hasText: 'chat vert' }).getByRole('button', { name: /dans un coin/ }).click();
  await expect(page.getByTestId('reglages-clip')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('clip-detourer')).toBeChecked(); // bord vert trouvé : détouré d'office
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath('3-meme-incrustation.png') });
  await page.getByTestId('clip-retour').click();
  await page.getByTestId('panneau-fermer').click();

  // 3. Export.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  const t0 = Date.now();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 360_000 });
  console.log(`[bibliothèque] export en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const mp4 = testInfo.outputPath('bibliotheque.mp4');
  await dl.saveAs(mp4);
  expect(erreurs).toEqual([]);

  const duree = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString());
  console.log(`[bibliothèque] durée ${duree.toFixed(2)} s`);
  expect(Math.abs(duree - 8)).toBeLessThan(0.15); // 6 s de jeu + 2 s de mème

  // Images : fond vert + mème incrusté (1,5 s), fond vert seul (3 s), mème coupure (5 s), jeu (7 s).
  for (const [t, nom] of [[1.5, 'a-fond-vert-et-meme'], [3, 'b-fond-vert'], [5, 'c-meme-coupure'], [7, 'd-jeu']] as const) {
    const p = parts(await image(mp4, t, testInfo.outputPath(`image-${nom}.png`)));
    console.log(`[bibliothèque] ${t} s : vert ${(p.vert * 100).toFixed(3)} %, peau ${(p.peau * 100).toFixed(2)} %, rouge ${(p.rouge * 100).toFixed(2)} %`);
    expect(p.vert).toBeLessThan(0.002); // plus aucun vert (ni fond ni liseré)
    if (t === 1.5 || t === 3) expect(p.peau).toBeGreaterThan(0.002); // le personnage est là, visage gardé
    if (t === 1.5) expect(p.rouge).toBeGreaterThan(0.002); // le « chat » du mème incrusté est là
  }
  const coupure = await image(mp4, 5, testInfo.outputPath('image-c-meme-coupure.png'));
  const centre = ((240 * 270 + 60) * 3);
  expect(coupure.d[centre]!).toBeGreaterThan(150); // orange du mème au milieu de l'image (bord du carré)

  // Son : mème incrusté (2 kHz) 0–2 s, fond vert (3 kHz) 1–4 s, mème coupure (1 kHz) 4–6 s à la place du jeu.
  const amp = amplitudes(mp4, testInfo.outputPath('son.f32'));
  const mesures = { chat: amp(0.2, 1.8, 2000), vert: amp(1.2, 3.8, 3000), vertApres: amp(4.2, 5.8, 3000), meme: amp(4.2, 5.8, 1000), jeuPendantMeme: amp(4.3, 5.7, 440), jeuApres: amp(6.2, 7.8, 440) };
  console.log(`[bibliothèque] son ${JSON.stringify(mesures)}`);
  expect(mesures.chat).toBeGreaterThan(0.03);
  expect(mesures.vert).toBeGreaterThan(0.03);
  expect(mesures.vertApres).toBeLessThan(mesures.vert / 10);
  expect(mesures.meme).toBeGreaterThan(0.03);
  expect(mesures.jeuPendantMeme).toBeLessThan(mesures.jeuApres / 10);
  expect(mesures.jeuApres).toBeGreaterThan(0.03);
});

test('Reprise : les clips sont rouverts depuis Ma bibliothèque ; un clip supprimé est retiré proprement, avec un message', async ({ page }) => {
  const { pack, jeu } = fabriquer();
  await page.goto('./');
  await page.getByTestId('ouvrir-bibliotheque').click();
  await page.getByTestId('bibliotheque-dossier-input').setInputFiles(pack);
  await page.getByTestId('demande-rayon-passer').click(); // le clip sans dossier reconnu est laissé de côté
  await expect(page.getByTestId('bibliotheque-progres')).toHaveCount(0, { timeout: 120_000 });
  await page.getByTestId('bibliotheque-fermer').click();
  await page.getByTestId('fichier').setInputFiles(jeu);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await teteA(page, 1);
  await page.getByTestId('outil-fondVert').click();
  await page.getByTestId('liste-fondsVerts').locator('li', { hasText: 'abonne' }).getByRole('button').click();
  await expect(page.getByTestId('reglages-clip')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('clip-retour').click();
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('outil-memes').click();
  await page.getByTestId('liste-memes').locator('li', { hasText: 'bruh' }).getByRole('button', { name: /Couper la vidéo/ }).click();
  await expect(page.getByTestId('reglages-coupure')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('panneau-fermer').click();

  // Reprise : seule la vidéo de jeu est re-choisie ; le fond vert et le mème reviennent tout seuls.
  const rouvrir = async () => {
    await page.waitForTimeout(2500); // la sauvegarde automatique (1 s après la dernière modification) est écrite
    await page.reload();
    const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
    await choix.setFiles(jeu);
    await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 30_000 });
  };
  await rouvrir();
  await page.getByTestId('outil-memes').click();
  await expect(page.locator('[data-testid^="calque-meme-"]')).toHaveCount(1);
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('outil-fondVert').click();
  await expect(page.locator('[data-testid^="calque-clip-"]')).toHaveCount(1);

  // Le fond vert est supprimé de Ma bibliothèque…
  await page.getByTestId('fondsVerts-bibliotheque').click();
  await page.getByTestId('liste-rayon-fondsVerts').locator('[data-testid^="element-modifier-"]').click();
  await page.getByTestId('element-supprimer').click();
  await page.getByTestId('dialogue-supprimer-element').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByTestId('liste-rayon-fondsVerts').locator('li')).toHaveCount(0);
  await page.getByTestId('bibliotheque-fermer').click();
  await page.getByTestId('panneau-fermer').click();

  // … à la reprise : message, fond vert retiré, le mème reste, et l'export marche.
  await rouvrir();
  await expect(page.getByTestId('toast')).toContainText("n'est plus dans Ma bibliothèque");
  await page.getByTestId('outil-fondVert').click();
  await expect(page.locator('[data-testid^="calque-clip-"]')).toHaveCount(0);
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('outil-memes').click();
  await expect(page.locator('[data-testid^="calque-meme-"]')).toHaveCount(1);
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('suivant').click();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 360_000 });
});
