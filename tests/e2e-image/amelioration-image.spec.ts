// « Améliorer l'image » dans Chrome (sans écran ; ici la carte graphique est SwiftShader, émulée par le processeur :
// les temps sont donc bien plus lents que sur un vrai téléphone ou un PC).
//  1. Banc : la carte graphique (WebGL2) donne la même image que la référence processeur (> 50 dB), images avant /
//     après enregistrées, temps par image d'une capture 1280 × 720 agrandie en 2560 × 1440.
//  2. Parcours : YouTube 16:9, capture de jeu 720p60 (tests/fixtures/jeu-720p60.mp4, fabriquée par
//     tests/fixtures/fabriquer-jeu-720p.py), Exporter → Améliorer l'image → Fort, vitesse mesurée, avant / après,
//     conseil 1440p → export 2560 × 1440 sans erreur, temps d'export mesuré.

import { expect, test } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import { writeFileSync } from 'node:fs';

const port = Number(process.env.ARKO_PORT) || 4195;
const VIDEO = 'tests/fixtures/jeu-720p60.mp4';

interface ResultatEssai { gpuContreCpu: number; gpuContreOriginal: number; plan: unknown }
interface ResultatBanc {
  webgl2: boolean;
  mode: string;
  bilineaire: number;
  leger?: ResultatEssai;
  fort?: ResultatEssai;
  classique: ResultatEssai;
  vitesse: Record<string, { ms: number; premiereMs: number } | null>;
  images: Record<string, string>;
  erreur?: string;
}

test('banc : carte graphique = référence processeur, temps par image', async ({ page }, testInfo) => {
  await page.goto(`http://localhost:${port + 1}/tests/harness-image/index.html`);
  await expect(page.locator('#etat')).not.toHaveText('…', { timeout: 600_000 });
  const r = (await page.evaluate(() => (window as unknown as { resultatBanc: unknown }).resultatBanc)) as ResultatBanc;
  expect(r.erreur).toBeUndefined();
  expect(r.webgl2).toBe(true);
  for (const [nom, png] of Object.entries(r.images)) writeFileSync(testInfo.outputPath(`banc-${nom}.png`), Buffer.from(png, 'base64'));
  console.log(`[banc] mode ${r.mode} ; bilinéaire ${r.bilineaire.toFixed(2)} dB`);
  for (const nom of ['leger', 'fort', 'classique'] as const) {
    const e = r[nom];
    if (!e) continue;
    console.log(`[banc] ${nom} : carte graphique / processeur ${e.gpuContreCpu.toFixed(1)} dB ; contre l'original ${e.gpuContreOriginal.toFixed(2)} dB`);
    expect(e.gpuContreCpu).toBeGreaterThan(50);
    expect(e.gpuContreOriginal).toBeGreaterThan(r.bilineaire - 0.5);
  }
  for (const [niveau, v] of Object.entries(r.vitesse)) {
    expect(v?.ms).toBeGreaterThan(0);
    console.log(`[banc] ${niveau} 1280 × 720 → 2560 × 1440 : ${v!.ms.toFixed(0)} ms par image (1re : ${v!.premiereMs.toFixed(0)} ms)`);
  }
});

async function lireMp4(chemin: string) {
  const input = new Input({ source: new FilePathSource(chemin), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    return { l: v!.displayWidth, h: v!.displayHeight, duree: await input.computeDuration() };
  } finally {
    input.dispose();
  }
}

test('YouTube 16:9 : Fort, avant / après, conseil 1440p, export 2560 × 1440', async ({ page }, testInfo) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.text().includes('Améliorer') && console.log('[page]', m.text()));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./');
  await page.getByTestId('depart-youtube').click();
  await page.getByTestId('depart-video').click();
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 60_000 });
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');

  // Le réglage est sur « Non » ; pas de conseil 1440p tant que l'amélioration est coupée.
  await expect(page.getByTestId('image-niveau')).toHaveText('Non');
  await expect(page.getByTestId('image-conseil-1440')).toHaveCount(0);
  await page.getByTestId('ouvrir-image').click();
  await expect(page.getByTestId('panneau-image')).toBeVisible();
  await page.getByTestId('image-niveau-fort').click();
  await expect(page.getByTestId('image-niveau-fort')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('image-moteur')).toHaveAttribute('data-mode', 'ia');
  await expect(page.getByTestId('image-vitesse')).not.toHaveAttribute('data-ms', '', { timeout: 120_000 });
  const ms = Number(await page.getByTestId('image-vitesse').getAttribute('data-ms'));
  console.log(`[panneau] ${ms} ms par image (720p → 1080p, Fort) — ${await page.getByTestId('image-vitesse').textContent()}`);
  expect(ms).toBeGreaterThan(0);

  // Avant / après : les deux images sont prêtes ; on les garde pour les regarder.
  await expect(page.getByTestId('image-avant-apres')).toHaveAttribute('data-etat', 'pret', { timeout: 180_000 });
  const images = await page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>('[data-testid="image-avant-apres"] canvas')].map((c) => c.toDataURL('image/png')));
  images.forEach((d, i) => writeFileSync(testInfo.outputPath(`${i === 0 ? 'avant' : 'apres'}.png`), Buffer.from(d.split(',')[1]!, 'base64')));
  const curseur = page.getByTestId('image-curseur');
  await curseur.fill('30');
  await page.screenshot({ path: testInfo.outputPath('panneau.png') });
  await page.getByTestId('image-fermer').click();

  // Conseil 1440p → export 2560 × 1440.
  await expect(page.getByTestId('image-niveau')).toHaveText('Fort');
  await page.getByTestId('image-passer-1440').click();
  await expect(page.getByTestId('qualite-export')).toContainText('2560');
  await expect(page.getByTestId('image-revenir-1080')).toBeVisible();
  const t0 = Date.now();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 800_000 });
  const secondes = (Date.now() - t0) / 1000;
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const mp4 = testInfo.outputPath('ameliore-1440p.mp4');
  await dl.saveAs(mp4);
  const info = await lireMp4(mp4);
  console.log(`[export] ${info.l} × ${info.h}, ${info.duree.toFixed(2)} s, créé en ${secondes.toFixed(0)} s (≈ ${((secondes * 1000) / (info.duree * 30)).toFixed(0)} ms par image en tout)`);
  expect(info.l).toBe(2560);
  expect(info.h).toBe(1440);
  expect(Math.abs(info.duree - 3)).toBeLessThan(0.2);
  expect(erreurs).toEqual([]);
});
