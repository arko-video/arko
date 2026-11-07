// v3 « Insérer ici » (B) et pistes audio (E), dev 2, au format téléphone (360 × 800), dans Chrome.
// TOUT est fabriqué ici par ffmpeg (aucun fichier de Romain).
// 1. Couper : une image fixe à 2 s, un carton texte à 4 s, une vidéo (fichier) entre deux parties à 7 s ; la suite se
//    décale ; Retirer puis Annuler ; export : durée, images (image rouge, carton noir et blanc, clip jaune, jeu bleu)
//    et sons (jeu muet pendant l'image et le carton, son du clip à sa place).
// 2. Une vidéo à 2 pistes de son (OBS : Micro, Discord) : « Cette vidéo a 2 pistes de son » → Valider → l'export
//    contient les 2 voix.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });

const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'];
const sinus = (f: number, d: number) => ['-f', 'lavfi', '-i', `sine=frequency=${f}:sample_rate=48000:duration=${d}`];

function fabriquer() {
  const d = mkdtempSync(join(tmpdir(), 'arko-ins-'));
  const jeu = join(d, 'jeu.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=0x2040C0:s=1280x720:r=30:d=6', ...sinus(440, 6), ...X264, '-shortest', jeu]);
  const image = join(d, 'carte.png');
  ff(['-f', 'lavfi', '-i', 'color=c=0xE02020:s=800x600', '-frames:v', '1', image]);
  const clip = join(d, 'reaction.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=0xE0E020:s=640x360:r=30:d=2', ...sinus(1000, 2), ...X264, '-shortest', clip]);
  const obs = join(d, 'obs.mp4');
  ff([
    '-f', 'lavfi', '-i', 'color=c=0x2040C0:s=640x360:r=30:d=4', ...sinus(440, 4), ...sinus(880, 4),
    '-map', '0', '-map', '1', '-map', '2', ...X264, '-metadata:s:a:0', 'title=Micro', '-metadata:s:a:1', 'title=Discord', '-shortest', obs,
  ]);
  return { jeu, image, clip, obs };
}

async function teteA(page: Page, n: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < n; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(n));
}

/** Pixels d'une image du MP4 au temps t (RVB, 270 × 480). */
async function image(mp4: string, t: number, png: string) {
  ff(['-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=270:480', png]);
  const { data } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => [data[(y * 270 + x) * 3]!, data[(y * 270 + x) * 3 + 1]!, data[(y * 270 + x) * 3 + 2]!];
  let noir = 0;
  let blanc = 0;
  for (let i = 0; i < data.length; i += 3) {
    const m = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    if (m < 25) noir++;
    if (m > 220) blanc++;
  }
  return { centre: px(135, 240), noir: noir / (data.length / 3), blanc: blanc / (data.length / 3) };
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

async function exporter(page: Page, nom: string, sortie: string) {
  while ((await page.getByTestId('etape').textContent()) !== 'Étape 5 sur 5') await page.getByTestId('suivant').click();
  const t0 = Date.now();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 360_000 });
  console.log(`[insertion] ${nom} : export en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  await dl.saveAs(sortie);
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', sortie]).toString());
}

test('Insérer ici : image + carton + vidéo entre deux parties, la suite décalée, export', async ({ page }, testInfo) => {
  const f = fabriquer();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(f.jeu);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  const duree = page.getByTestId('duree-finale');
  await expect(duree).toContainText('6,0');

  // Image fixe à 2 s (2 s par défaut).
  await teteA(page, 2);
  await page.getByTestId('v3-inserer-couper').click();
  await expect(page.getByTestId('v3-inserer-ecran')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('1-inserer-quoi.png') });
  await page.getByTestId('ins-choix-image').click();
  await page.getByTestId('ins-fichier-image').setInputFiles(f.image);
  await page.getByTestId('ins-valider').click();
  await expect(page.getByTestId('v3-inserer-ecran')).toHaveCount(0);
  await expect(duree).toContainText('8,0');
  await expect(page.getByTestId('insere-1')).toHaveText('Image');
  await expect(page.getByTestId('panneau-insere')).toBeVisible();

  // Carton texte à 4 s (juste après l'image), 1,5 s.
  await teteA(page, 4);
  await page.getByTestId('v3-inserer-couper').click();
  await page.getByTestId('ins-choix-carton').click();
  await page.getByTestId('ins-texte').fill('Plus tard');
  await page.getByTestId('ins-duree').fill('1,5');
  await page.getByTestId('ins-duree').blur();
  await page.screenshot({ path: testInfo.outputPath('2-carton.png') });
  await page.getByTestId('ins-valider').click();
  await expect(duree).toContainText('9,5');
  await expect(page.getByTestId('insere-2')).toHaveText('Carton');
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('3-carton-insere.png') });

  // Vidéo d'un fichier à 7 s (au milieu de la 2ᵉ partie du jeu), gardée dans Mèmes.
  await teteA(page, 7);
  await page.getByTestId('v3-inserer-couper').click();
  await page.getByTestId('ins-choix-clip').click();
  await page.getByTestId('ins-fichier-video').setInputFiles(f.clip);
  await expect(page.getByTestId('ins-clip-choisi')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('ins-valider').click();
  await expect(page.getByTestId('v3-inserer-ecran')).toHaveCount(0, { timeout: 30_000 });
  await expect(duree).toContainText('12'); // 11,5 s
  await expect(page.locator('[data-testid^="insere-"]')).toHaveCount(2); // la vidéo insérée montre ses images
  await expect(page.locator('[data-testid^="plan-"]')).toHaveCount(6);
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('4-trois-elements.png') });

  // Retirer le carton (la suite est recollée), puis Annuler.
  await page.getByTestId('plan-2').click();
  await expect(page.getByTestId('panneau-insere')).toContainText('Carton');
  await page.getByTestId('ins-retirer').click();
  await expect(duree).toContainText('10');
  await expect(page.locator('[data-testid^="plan-"]')).toHaveCount(5);
  await page.getByTestId('annuler').click();
  await expect(page.locator('[data-testid^="plan-"]')).toHaveCount(6);
  await expect(duree).toContainText('12');

  const mp4 = testInfo.outputPath('insertion.mp4');
  const d = await exporter(page, 'image + carton + vidéo', mp4);
  expect(erreurs).toEqual([]);
  console.log(`[insertion] durée ${d.toFixed(2)} s`);
  expect(Math.abs(d - 11.5)).toBeLessThan(0.15); // 6 s de jeu + 2 s d'image + 1,5 s de carton + 2 s de vidéo

  // Images : jeu (1 s), image rouge (3 s), carton noir + texte blanc (4,75 s), jeu (6 s), vidéo jaune (8 s), jeu (10,5 s).
  const bleu = ([r, g, b]: number[]) => b! > 120 && r! < 90 && g! < 110;
  const res: Record<string, unknown> = {};
  for (const [t, nom] of [[1, 'jeu1'], [3, 'image'], [4.75, 'carton'], [6.2, 'jeu2'], [8, 'video'], [10.5, 'jeu3']] as const) {
    const img = await image(mp4, t, testInfo.outputPath(`image-${nom}.png`));
    res[nom] = img;
    if (nom.startsWith('jeu')) expect(bleu(img.centre)).toBe(true);
  }
  console.log(`[insertion] images ${JSON.stringify(res)}`);
  const [ri, gi, bi] = (res.image as { centre: number[] }).centre;
  expect(ri! > 170 && gi! < 80 && bi! < 80).toBe(true);
  const carton = res.carton as { noir: number; blanc: number };
  expect(carton.noir).toBeGreaterThan(0.75);
  expect(carton.blanc).toBeGreaterThan(0.003);
  const [rv, gv, bv] = (res.video as { centre: number[] }).centre;
  expect(rv! > 170 && gv! > 170 && bv! < 100).toBe(true);

  // Son : jeu (440 Hz) avant, muet pendant l'image et le carton, puis jeu ; la vidéo (1 kHz) à sa place, jeu muet.
  const amp = amplitudes(mp4, testInfo.outputPath('son.f32'));
  const m = {
    jeuAvant: amp(0.2, 1.8, 440), jeuImage: amp(2.2, 3.8, 440), jeuCarton: amp(4.1, 5.4, 440), jeuApres: amp(5.7, 6.8, 440),
    clip: amp(7.2, 8.8, 1000), jeuPendantClip: amp(7.2, 8.8, 440), jeuFin: amp(9.2, 11.3, 440),
  };
  console.log(`[insertion] son ${JSON.stringify(m)}`);
  for (const k of ['jeuAvant', 'jeuApres', 'clip', 'jeuFin'] as const) expect(m[k]).toBeGreaterThan(0.03);
  for (const k of ['jeuImage', 'jeuCarton', 'jeuPendantClip'] as const) expect(m[k]).toBeLessThan(m.jeuAvant / 10);
});

test('Vidéo à 2 pistes de son : choix des pistes, l\'export contient les 2 voix', async ({ page }, testInfo) => {
  const f = fabriquer();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(f.obs);
  await expect(page.getByTestId('v3-pistes')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('v3-pistes')).toContainText('Cette vidéo a 2 pistes de son');
  await expect(page.getByTestId('piste-0')).toContainText('Micro');
  await expect(page.getByTestId('piste-1')).toContainText('Discord');
  await expect(page.getByTestId('piste-garder-0')).toBeChecked();
  await expect(page.getByTestId('piste-garder-1')).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('1-pistes.png') });
  await page.getByTestId('v3-pistes-valider').click();
  await expect(page.getByTestId('v3-pistes')).toHaveCount(0);

  const mp4 = testInfo.outputPath('pistes.mp4');
  const d = await exporter(page, '2 pistes', mp4);
  expect(erreurs).toEqual([]);
  expect(Math.abs(d - 4)).toBeLessThan(0.15);
  const amp = amplitudes(mp4, testInfo.outputPath('son.f32'));
  const m = { micro: amp(0.5, 3.5, 440), discord: amp(0.5, 3.5, 880) };
  console.log(`[insertion] 2 pistes : ${JSON.stringify(m)}`);
  expect(m.micro).toBeGreaterThan(0.03);
  expect(m.discord).toBeGreaterThan(0.03);
});

test('Chibi plein écran (chibi au hasard, émotion, texte) : aperçu, export', async ({ page }, testInfo) => {
  const f = fabriquer();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(f.jeu);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await teteA(page, 3);
  await page.getByTestId('v3-inserer-couper').click();
  await page.getByTestId('ins-choix-chibi').click();
  await page.getByTestId('ins-emotion').selectOption('choque');
  await page.getByTestId('ins-texte').fill('QUOI ?!');
  await expect(page.getByTestId('ins-apercu')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('1-chibi-formulaire.png') });
  await page.getByTestId('ins-valider').click();
  await expect(page.getByTestId('duree-finale')).toContainText('7,5');
  await expect(page.getByTestId('insere-1')).toHaveText('Perso');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath('2-chibi-apercu.png') });

  const mp4 = testInfo.outputPath('chibi.mp4');
  const d = await exporter(page, 'chibi', mp4);
  expect(erreurs).toEqual([]);
  expect(Math.abs(d - 7.5)).toBeLessThan(0.15);
  const img = await image(mp4, 3.75, testInfo.outputPath('image-chibi.png'));
  console.log(`[insertion] chibi : ${JSON.stringify(img)}`);
  expect(img.blanc).toBeGreaterThan(0.4); // fond blanc par défaut
  expect(img.noir).toBeGreaterThan(0.002); // trait du chibi et contour du texte
  const amp = amplitudes(mp4, testInfo.outputPath('son.f32'));
  expect(amp(3.1, 4.4, 440)).toBeLessThan(amp(0.5, 2.5, 440) / 10); // silence pendant le chibi
});

test('Reprise : l\'image insérée est rouverte depuis l\'appareil', async ({ page }, testInfo) => {
  const f = fabriquer();
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(f.jeu);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await teteA(page, 2);
  await page.getByTestId('v3-inserer-couper').click();
  await page.getByTestId('ins-choix-image').click();
  await page.getByTestId('ins-fichier-image').setInputFiles(f.image);
  await page.getByTestId('ins-valider').click();
  await expect(page.getByTestId('duree-finale')).toContainText('8,0');
  await page.waitForTimeout(2500); // sauvegarde automatique
  await page.reload();
  const [choix] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await choix.setFiles(f.jeu);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await expect(page.getByTestId('insere-1')).toHaveText('Image');
  await expect(page.getByTestId('duree-finale')).toContainText('8,0');
  await teteA(page, 3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath('reprise.png') });
  // L'image est bien dans l'aperçu (rouge au centre du canevas).
  const centre = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(c.width / 2, c.height / 2, 1, 1).data;
    return [d[0], d[1], d[2]];
  });
  expect(centre[0]! > 170 && centre[1]! < 80).toBe(true);
});
