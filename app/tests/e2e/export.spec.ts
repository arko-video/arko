// Critère de fin de phase 1 (parcours en 5 étapes depuis la phase 2) : parcours complet dans Chrome headless,
// puis vérification du MP4 dans Node. Importer la vidéo de test → scinder à 2 s → supprimer le plan 2 →
// Fond flou → Habiller (rien) → exporter → MP4 1080 (ou 1072) × 1920, durée 2,00 s ± 0,05, piste audio présente.

import { expect, test } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';

// Chemin relatif au dossier de l'appli (Playwright est lancé depuis app/).
const VIDEO = 'tests/fixtures/test-1920x1080.mp4';

test('parcours complet : import, découpe, fond flou, export MP4', async ({ page }, testInfo) => {
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[navigateur]', m.text());
  });
  page.on('pageerror', (e) => console.log('[page]', e.message));

  await page.goto('./');
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await expect(page.getByTestId('bloquant')).toHaveCount(0);

  // 1. Importer : choisir la vidéo fait avancer tout seul.
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await expect(page.getByTestId('duree-finale')).toContainText('5');

  // 2. Couper : tête de lecture à 2 s (Début puis 2 × « +1 s » au clavier), puis Scinder.
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  await tete.press('PageUp');
  await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', '2');
  await page.getByTestId('scinder').click();
  await expect(page.getByTestId('plan-1')).toBeVisible();

  // Supprimer est grisé sans sélection, puis on sélectionne le plan 2 et on le supprime.
  await expect(page.getByTestId('supprimer')).toBeDisabled();
  await page.getByTestId('plan-1').click();
  await expect(page.getByTestId('plan-1')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('supprimer').click();
  await expect(page.getByTestId('plan-1')).toHaveCount(0);
  await expect(page.getByTestId('duree-finale')).toContainText('2,0');

  // Annuler / Rétablir.
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('plan-1')).toBeVisible();
  await page.getByTestId('retablir').click();
  await expect(page.getByTestId('plan-1')).toHaveCount(0);

  // 3. Vertical : Fond flou.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 3 sur 5');
  await page.getByTestId('mise-flou').click();
  await expect(page.getByTestId('mise-flou')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('mise-jeuCam')).toBeEnabled();

  // Le bouton Retour du navigateur ramène à Couper sans rien perdre.
  await page.goBack();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await expect(page.getByTestId('duree-finale')).toContainText('2,0');
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 3 sur 5');

  // 4. Habiller : la barre d'outils est là, on n'ajoute rien.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await expect(page.getByTestId('barre-outils')).toBeVisible();

  // 5. Exporter.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 150_000 });

  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('telecharger').click(),
  ]);
  expect(telechargement.suggestedFilename()).toMatch(/\.mp4$/);
  const chemin = testInfo.outputPath('export.mp4');
  await telechargement.saveAs(chemin);

  // 6. Vérification du fichier dans Node.
  const input = new Input({ source: new FilePathSource(chemin), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    expect(video, 'piste vidéo').not.toBeNull();
    expect(video!.displayHeight).toBe(1920);
    expect([1080, 1072]).toContain(video!.displayWidth);
    const duree = await input.computeDuration();
    expect(Math.abs(duree - 2)).toBeLessThanOrEqual(0.05);
    const audio = await input.getPrimaryAudioTrack();
    expect(audio, 'piste audio').not.toBeNull();
  } finally {
    input.dispose();
  }
});
