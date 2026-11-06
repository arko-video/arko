// Parcours YouTube dans Chrome headless, au format téléphone (360 × 800), sur un appareil VIERGE :
//  1. écran de départ → YouTube → Vidéo (16:9) ; import d'une vidéo 16:9 (le Cadrage est sauté) ; couper ;
//     habiller (accroche) ; 3 chapitres (règles de YouTube + texte copié) ; outro « Abonne-toi » ; export
//     → MP4 1920 × 1080, durée = montage + outro ; puis miniature JPEG et PNG : 1280 × 720, moins de 2 Mo.
//  2. Cadrage d'une vidéo verticale en 16:9 (Plein 16:9 / Ajustée + fond flou).
// Vidéo de test : tests/fixtures/youtube-32s-640x360.mp4, fabriquée par
//   ffmpeg -f lavfi -i testsrc2=size=640x360:rate=30:duration=32 -f lavfi -i sine=frequency=440:duration=32:sample_rate=48000
//          -c:v libx264 -b:v 300k -g 60 -c:a aac -b:a 64k -shortest -movflags +faststart youtube-32s-640x360.mp4
// Captures facultatives : ARKO_CAPTURES=/dossier.

import { expect, test, type Page } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const VIDEO = 'tests/fixtures/youtube-32s-640x360.mp4';
const VERTICALE = 'tests/qa/fixtures/vertical-1080x1920.mp4';
const CAPTURES = process.env.ARKO_CAPTURES;

// Appareil vierge : aucun choix de plateforme mémorisé (la config des autres tests choisit TikTok).
test.use({
  viewport: { width: 360, height: 800 },
  deviceScaleFactor: 2,
  storageState: { cookies: [], origins: [] },
  permissions: ['clipboard-read', 'clipboard-write'],
});

async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${CAPTURES}/${nom}.png` });
}

async function teteA(page: Page, s: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < s; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(s));
}

async function choisirYoutube(page: Page, format: 'video' | 'short') {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto('./');
  await expect(page.getByTestId('depart')).toBeVisible();
  await capture(page, 'yt-1-depart');
  await page.getByTestId('depart-youtube').click();
  await capture(page, 'yt-2-depart-youtube');
  await page.getByTestId(`depart-${format}`).click();
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await expect(page.getByTestId('changer-destination')).toContainText(format === 'video' ? 'YouTube 16:9' : 'YouTube Short');
}

/** Lit la vidéo exportée dans Node : dimensions et durée. */
async function lireMp4(chemin: string) {
  const input = new Input({ source: new FilePathSource(chemin), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const son = await input.getPrimaryAudioTrack();
    const debitSon = son ? (await son.computePacketStats()).averageBitrate : 0;
    return { l: video!.displayWidth, h: video!.displayHeight, duree: await input.computeDuration(), audio: !!son, debitSon };
  } finally {
    input.dispose();
  }
}

test('YouTube 16:9 : couper, habiller, 3 chapitres, outro, export 1920 × 1080, miniature', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  await choisirYoutube(page, 'video');

  // Le choix est mémorisé : après un rechargement, on arrive directement à l'accueil.
  await page.reload();
  await expect(page.getByTestId('changer-destination')).toContainText('YouTube 16:9');

  // Import d'une vidéo déjà en 16:9 → Couper ; le Cadrage sera sauté.
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await expect(page.getByTestId('apercu')).toHaveAttribute('data-paysage', '1');

  // Couper : on garde 0 → 30 s (les 2 dernières secondes partent).
  await teteA(page, 30);
  await page.getByTestId('scinder').click();
  await page.getByTestId('plan-1').click();
  await page.getByTestId('supprimer').click();
  await expect(page.getByTestId('duree-finale')).toContainText('30');

  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await expect(page.getByTestId('toast')).toContainText('déjà en 16:9');

  // Habiller : une accroche.
  await page.getByTestId('outil-accroche').click();
  await page.getByTestId('suggestion-0').click();
  await page.getByTestId('panneau-fermer').click();

  // Chapitres : 0:00, 0:10, 0:20 (le dernier dure 10 s : juste assez).
  await page.getByTestId('outil-chapitres').click();
  await page.getByTestId('ajouter-chapitre').click();
  await expect(page.getByTestId('chapitres-problemes')).toContainText('au moins 3 chapitres');
  await teteA(page, 10);
  await page.getByTestId('ajouter-chapitre').click();
  await teteA(page, 20);
  await page.getByTestId('ajouter-chapitre').click();
  await page.getByTestId('chapitre-nom-1').fill('Le clutch');
  await page.getByTestId('chapitre-nom-1').press('Enter');
  await expect(page.getByTestId('chapitres-ok')).toBeVisible();
  await expect(page.getByTestId('chapitres-texte')).toHaveValue('0:00 Intro\n0:10 Le clutch\n0:20 Partie 3');
  await page.getByTestId('copier-chapitres').click();
  await expect(page.getByTestId('toast')).toContainText('Chapitres copiés');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('0:00 Intro\n0:10 Le clutch\n0:20 Partie 3');
  await capture(page, 'yt-4-chapitres');
  await page.getByTestId('panneau-fermer').click();

  // Outro : modèle « Abonne-toi », 5 s (le minimum de l'écran de fin YouTube).
  await page.getByTestId('outil-generiques').click();
  await page.getByTestId('place-outro').click();
  await page.getByTestId('generique-abonne').click();
  await expect(page.getByTestId('generique-apercu')).toBeVisible();
  await page.getByTestId('generique-chaine').fill('Romain Gaming');
  await page.getByTestId('generique-chaine').press('Enter');
  const curseur = page.getByTestId('generique-curseur');
  await curseur.focus();
  await curseur.press('Home');
  await expect(page.getByTestId('generique-duree')).toContainText('5 s');
  await capture(page, 'yt-5-outro');
  await page.getByTestId('panneau-fermer').click();

  // L'outro est sur la frise (après la fin) et dans l'aperçu : ce qu'on voit = ce qu'on exporte.
  await expect(page.getByTestId('frise-outro')).toBeVisible();
  await page.getByTestId('frise-outro-lire').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('lecture').click();
  // Fond de l'outro (nuit d'Arko) dans le coin de l'aperçu, au lieu des barres de couleur de la vidéo.
  const coin = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas')!;
    return Array.from(c.getContext('2d')!.getImageData(4, 4, 1, 1).data.slice(0, 3));
  });
  expect(Math.max(...coin)).toBeLessThan(40);
  // Retirable depuis la frise, et Annuler la remet.
  await page.getByTestId('frise-outro-retirer').click();
  await expect(page.getByTestId('frise-outro')).toHaveCount(0);
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('frise-outro')).toBeVisible();

  // Exporter : 30 s + 5 s d'outro.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  await expect(page.getByTestId('resume-export')).toContainText('35 s');
  await expect(page.getByTestId('qualite-export')).toContainText('1920 × 1080');
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 360_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const mp4 = testInfo.outputPath('youtube.mp4');
  await dl.saveAs(mp4);
  const info = await lireMp4(mp4);
  expect(info.l).toBe(1920);
  expect([1080, 1072]).toContain(info.h);
  expect(Math.abs(info.duree - 35)).toBeLessThanOrEqual(0.1);
  expect(info.audio).toBe(true);
  // Son : 384 kb/s demandés en 16:9 (ou le plus haut accepté par l'encodeur).
  console.log(`[son] débit moyen ${Math.round(info.debitSon / 1000)} kb/s`);
  expect(info.debitSon).toBeGreaterThan(150_000);

  // Miniature : image à 12 s, gros texte, émoji, flèche ; JPEG puis PNG.
  await page.getByTestId('ouvrir-miniature').click();
  await expect(page.getByTestId('miniature')).toBeVisible();
  await page.getByTestId('miniature-temps').fill('12');
  await page.getByTestId('miniature-texte').fill('Clutch de fou');
  await page.getByTestId('miniature-emoji-😱').click();
  await page.getByTestId('miniature-fleche-droite').click();
  await expect(page.getByTestId('miniature-canevas')).toHaveAttribute('data-pret', '1');
  await capture(page, 'yt-6-miniature');
  for (const [bouton, format] of [['miniature-jpeg', 'jpeg'], ['miniature-png', 'png']] as const) {
    const [img] = await Promise.all([page.waitForEvent('download'), page.getByTestId(bouton).click()]);
    const chemin = testInfo.outputPath(`miniature.${format}`);
    await img.saveAs(chemin);
    const meta = await sharp(chemin).metadata();
    expect(meta.width).toBe(1280);
    expect(meta.height).toBe(720);
    expect(statSync(chemin).size).toBeLessThan(2 * 1024 * 1024);
    await expect(page.getByTestId('miniature-prete')).toContainText('1280 × 720');
  }
  await page.getByTestId('miniature-fermer').click();
  await expect(page.getByTestId('video-prete')).toBeVisible();
});

test('YouTube 16:9 : une vidéo verticale passe par le Cadrage', async ({ page }) => {
  await choisirYoutube(page, 'video');
  await page.getByTestId('fichier').setInputFiles(VERTICALE);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 3 sur 5');
  await expect(page.getByRole('heading', { name: 'Cadre ta vidéo en 16:9' })).toBeVisible();
  await expect(page.getByTestId('mise-jeuCam')).toHaveCount(0);
  await expect(page.getByTestId('mise-flou')).toHaveAttribute('aria-checked', 'true');
  await capture(page, 'yt-3-cadrage');
  await page.getByTestId('mise-recadre').click();
  await expect(page.getByTestId('mise-recadre')).toHaveAttribute('aria-checked', 'true');
  // Le choix de plateforme se change depuis l'accueil (pour les prochains montages).
  await page.goto('./');
  await page.getByTestId('changer-destination').click();
  await page.getByTestId('depart-tiktok').click();
  await expect(page.getByTestId('changer-destination')).toContainText('TikTok');
});

test('YouTube Short : parcours vertical, zone sûre des Shorts, export réglé pour les Shorts', async ({ page }) => {
  await choisirYoutube(page, 'short');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await expect(page.getByTestId('apercu')).toHaveAttribute('data-paysage', '0');
  await page.getByTestId('suivant').click();
  await expect(page.getByRole('heading', { name: 'Mets-le en vertical' })).toBeVisible();
  await page.getByTestId('zone-sure-interrupteur').check();
  const style = await page.getByTestId('zone-sure').getAttribute('style');
  expect(style).toContain('--zs-bas: 25.000%');
  expect(style).toContain('--zs-haut: 15.000%');
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('outil-chapitres')).toHaveCount(0);
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('qualite-export')).toContainText('1080 × 1920');
  await expect(page.getByTestId('alerte-short')).toHaveCount(0);
  await expect(page.getByTestId('ouvrir-miniature')).toBeVisible();
});
