// v3 « Chibis » (D) et avatars dans la vidéo (C), dev 3, dans Chrome au format téléphone, en YouTube 16:9.
// TOUT est fabriqué ici par ffmpeg (aucun fichier de Romain) : une vidéo bleue de 12 s à 2 pistes de son (OBS) :
// « Micro » parle de 1 à 4 s et de 8 à 9,5 s, « Discord » de 5 à 7 s.
// Parcours : pistes gardées → Habiller → Avatars → Qui parle ? → pour chaque voix, l'atelier (Au hasard, style,
// nom, « Choisir ce chibi ») → Valider → Montrer les avatars → export 1920 × 1080. Vérifié sur les pixels :
// l'avatar n'est en bas à gauche que quand « Micro » parle, en bas à droite que quand « Discord » parle ; l'aperçu
// montre la même chose ; les 2 chibis sont dans Ma bibliothèque → Chibis.

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

const port = Number(process.env.ARKO_PORT) || 4173;
test.use({
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 2,
  storageState: { cookies: [], origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'arko.destination', value: 'youtube' }] }] },
});

const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);

/** Voix synthétique (220 ou 300 Hz + harmonique, syllabes à 4 Hz) pendant les plages, petit souffle ailleurs. */
const voix = (f: number, plages: [number, number][], a: number) =>
  `aevalsrc='${a}*(${plages.map(([x, y]) => `between(t,${x},${y})`).join('+')})*sin(2*PI*${f}*t)*(0.55+0.45*sin(2*PI*4*t))+${a / 3}*(${plages.map(([x, y]) => `between(t,${x},${y})`).join('+')})*sin(2*PI*${f * 3}*t)+0.002*(random(0)-0.5)':s=48000:d=12`;

function fabriquer() {
  const d = mkdtempSync(join(tmpdir(), 'arko-chibis-'));
  const mp4 = join(d, 'session.mp4');
  ff([
    '-f', 'lavfi', '-i', 'color=c=0x2040C0:s=1280x720:r=30:d=12',
    '-f', 'lavfi', '-i', voix(220, [[1, 4], [8, 9.5]], 0.2),
    '-f', 'lavfi', '-i', voix(300, [[5, 7]], 0.3),
    '-map', '0', '-map', '1', '-map', '2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-metadata:s:a:0', 'title=Micro', '-metadata:s:a:1', 'title=Discord', '-shortest', mp4,
  ]);
  return mp4;
}

/** Part des pixels « pas bleus » (le chibi) dans un coin bas de l'image (gauche ou droite, 25 % × 45 %). */
async function coins(png: Buffer | string) {
  const img = sharp(png).removeAlpha().resize(320, 180, { fit: 'fill' });
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const part = (x0: number, x1: number) => {
    let n = 0;
    let autres = 0;
    for (let y = 99; y < 180; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * 320 + x) * 3;
        const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
        n++;
        if (Math.abs(r - 0x20) + Math.abs(g - 0x40) + Math.abs(b - 0xc0) > 90) autres++;
      }
    return autres / n;
  };
  return { gauche: part(0, 80), droite: part(240, 320) };
}

async function image(mp4: string, t: number, dossier: string) {
  const png = join(dossier, `image-${t}.png`);
  ff(['-ss', String(t), '-i', mp4, '-frames:v', '1', png]);
  return coins(png);
}

/** Dans l'atelier ouvert par « Qui parle ? » : un chibi au hasard, un style, un nom, puis « Choisir ce chibi ». */
async function creerChibi(page: Page, voixId: string, nom: string, style: string) {
  await page.getByTestId(`v3-voix-chibi-${voixId}`).click();
  await expect(page.getByTestId('v3-atelier')).toBeVisible();
  await expect(page.getByTestId('atelier-apercu')).toHaveAttribute('data-pret', '1');
  await page.getByTestId('chibi-hasard').click();
  await page.getByTestId(`chibi-style-${style}`).click();
  await page.getByTestId('chibi-emo-rit').click();
  await page.getByTestId('chibi-nom').fill(nom);
  await page.getByTestId('chibi-choisir').click();
  await expect(page.getByTestId('v3-atelier')).toHaveCount(0);
  await expect(page.getByTestId(`v3-voix-chibi-${voixId}-apercu`)).toBeVisible();
}

test('Chibis : 2 chibis créés, donnés à 2 voix, avatars visibles au bon moment dans l\'export', async ({ page }, testInfo) => {
  test.setTimeout(480_000);
  const mp4 = fabriquer();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(mp4);
  await expect(page.getByTestId('v3-pistes')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('v3-pistes-valider').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');

  // Habiller → Avatars → Qui parle ?
  await page.getByTestId('outil-avatars').click();
  await expect(page.getByTestId('outil-avatars')).toBeVisible();
  await page.getByTestId('v3-qui-parle').click();
  await expect(page.getByTestId('v3-qp-methode')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('v3-cartes-voix').locator('li')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('1-qui-parle.png') });
  const ids = await page.getByTestId('v3-cartes-voix').locator('li').evaluateAll((l) => l.map((e) => e.getAttribute('data-testid')!.replace('v3-voix-', '')));
  // « Micro » = la voix de la piste 1.
  const micro = (await page.getByTestId(`v3-voix-${ids[0]}`).textContent())!.includes('Piste 1') ? ids[0]! : ids[1]!;
  const discord = micro === ids[0] ? ids[1]! : ids[0]!;
  await creerChibi(page, micro, 'Moi', 'papier');
  await page.screenshot({ path: testInfo.outputPath('2-atelier-fini.png') });
  await creerChibi(page, discord, 'Mon pote', 'paint');
  await page.getByTestId('v3-qp-valider').click();
  await expect(page.getByTestId('v3-qui-parle-ecran')).toHaveCount(0);

  // Montrer les avatars (si pas déjà fait).
  const interrupteur = page.getByTestId('avatars-activer');
  if (!(await interrupteur.isChecked())) await interrupteur.check({ force: true });
  await expect(page.getByTestId(`avatar-${micro}`)).toBeVisible();
  await expect(page.getByTestId('calque-avatars')).toBeVisible();

  // Aperçu : à 2 s, l'avatar de « Micro » en bas à gauche, rien à droite.
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < 2; i++) await tete.press('PageUp');
  await page.waitForTimeout(800);
  // Pixels du canevas lui-même (sans les cadres de l'outil posés par-dessus).
  const url = await page.getByTestId('apercu').locator('canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL('image/png'));
  const apercu = await coins(Buffer.from(url.split(',')[1]!, 'base64'));
  await page.screenshot({ path: testInfo.outputPath('3-apercu-avatar.png') });
  console.log(`[chibis] aperçu à 2 s : ${JSON.stringify(apercu)}`);
  expect(apercu.gauche).toBeGreaterThan(0.04);
  expect(apercu.droite).toBeLessThan(0.01);

  // Export 1920 × 1080.
  await page.getByTestId('panneau-fermer').click();
  while ((await page.getByTestId('etape').textContent()) !== 'Étape 5 sur 5') await page.getByTestId('suivant').click();
  const t0 = Date.now();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 360_000 });
  console.log(`[chibis] export en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const sortie = testInfo.outputPath('avatars.mp4');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  await dl.saveAs(sortie);
  const dossier = testInfo.outputPath('.');
  const mesures: Record<string, { gauche: number; droite: number }> = {};
  for (const t of [0.5, 2.5, 4.2, 4.8, 6, 7.9, 8.8, 11]) mesures[t] = await image(sortie, t, dossier);
  console.log(`[chibis] export : ${JSON.stringify(mesures)}`);
  // Personne ne parle : aucun avatar.
  expect(mesures[0.5]!.gauche).toBeLessThan(0.01);
  expect(mesures[0.5]!.droite).toBeLessThan(0.01);
  // « Micro » parle (1 à 4 s), reste 0,5 s, puis disparaît.
  expect(mesures[2.5]!.gauche).toBeGreaterThan(0.04);
  expect(mesures[2.5]!.droite).toBeLessThan(0.01);
  expect(mesures[4.2]!.gauche).toBeGreaterThan(0.04);
  expect(mesures[4.8]!.gauche).toBeLessThan(0.01);
  // « Discord » parle (5 à 7 s) : en bas à droite seulement.
  expect(mesures[6]!.droite).toBeGreaterThan(0.04);
  expect(mesures[6]!.gauche).toBeLessThan(0.01);
  expect(mesures[7.9]!.droite).toBeLessThan(0.01);
  // « Micro » reparle (8 à 9,5 s).
  expect(mesures[8.8]!.gauche).toBeGreaterThan(0.04);
  expect(mesures[11]!.gauche).toBeLessThan(0.01);

  // Les 2 chibis sont gardés dans Ma bibliothèque → Chibis (base IndexedDB « arko-chibis »).
  const noms = await page.evaluate(
    () =>
      new Promise<string[]>((ok) => {
        const req = indexedDB.open('arko-chibis');
        req.onsuccess = () => {
          const tout = req.result.transaction('chibis').objectStore('chibis').getAll();
          tout.onsuccess = () => ok((tout.result as { nom: string }[]).map((c) => c.nom).sort());
        };
      }),
  );
  expect(noms).toEqual(['Moi', 'Mon pote']);
  expect(erreurs).toEqual([]);
});
