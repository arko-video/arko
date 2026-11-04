// Phase 4 au format téléphone (360 × 740), dans Chrome headless :
// - Couper : vitesse 0,5 + arrêt sur image 1 s sur un plan de 2 s, Annuler / Rétablir, export et durée du MP4 (ffprobe) ;
// - Habiller : un combo « Boom » (zoom + son, message avec Annuler) ;
// - Modèles : « Top 3 » grisé avec 1 plan, appliqué sur 3 plans, puis annulé ;
// - Mes montages : 2 projets, renommer, dupliquer, supprimer (avec confirmation), rouvrir après rechargement.
// Captures facultatives : ARKO_CAPTURES=/dossier.

import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const VIDEO = 'tests/fixtures/test-1920x1080.mp4';
const VIDEO_2 = 'tests/qa/fixtures/p2-gris-10s.mp4';
const CAPTURES = process.env.ARKO_CAPTURES;

test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  await page.waitForTimeout(800); // l'aperçu finit de dessiner
  await page.screenshot({ path: `${CAPTURES}/${nom}.png` });
}

async function teteA(page: Page, n: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < n; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(n));
}

async function importer(page: Page, video = VIDEO) {
  await page.getByTestId('fichier').setInputFiles(video);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
}

async function demarrer(page: Page) {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  await page.goto('./');
  await importer(page);
}

/** Durée affichée « Durée finale : 5,0 s » → secondes (moins de 10 s ici). */
async function dureeFinale(page: Page): Promise<number> {
  const t = (await page.getByTestId('duree-finale').locator('.chiffres').textContent()) ?? '';
  const m = /(\d+),(\d)/.exec(t);
  return m ? Number(m[1]) + Number(m[2]) / 10 : NaN;
}

test('Couper : vitesse 0,5 et arrêt sur image 1 s, durée du MP4', async ({ page }, testInfo) => {
  await demarrer(page);
  // 5 s sans aucun événement : un seul repère orange ; un toucher amène la tête au passage et affiche le conseil.
  await expect(page.getByTestId('repere-rythme')).toHaveCount(1);
  await page.getByTestId('repere-rythme').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await capture(page, 'p4-couper-repere');
  await teteA(page, 2);
  await page.getByTestId('finir-ici').click();
  await expect.poll(() => dureeFinale(page)).toBeCloseTo(2, 1);

  // Un seul plan : son panneau est déjà là.
  await expect(page.getByTestId('panneau-plan')).toBeVisible();
  await page.getByTestId('vitesse-0-5').click();
  await expect(page.getByTestId('vitesse-0-5')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('badge-vitesse-0')).toHaveText('×0,5');
  await page.getByTestId('arret-1').click();
  await expect(page.getByTestId('fige-0')).toBeVisible();
  await expect.poll(() => dureeFinale(page)).toBeCloseTo(5, 1);
  await page.getByTestId('panneau-plan').scrollIntoViewIfNeeded();
  await capture(page, 'p4-couper-vitesse-arret');

  // Annuler / Rétablir.
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('fige-0')).toHaveCount(0);
  await expect.poll(() => dureeFinale(page)).toBeCloseTo(4, 1);
  await page.getByTestId('retablir').click();
  await expect(page.getByTestId('fige-0')).toBeVisible();

  // Export, puis la durée du MP4.
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('suivant').click();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 180_000 });
  const mp4 = testInfo.outputPath('rythme.mp4');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  await telechargement.saveAs(mp4);
  const duree = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString());
  expect(duree, `durée du MP4 : ${duree} s`).toBeGreaterThan(4.8);
  expect(duree).toBeLessThan(5.25);
});

test('Habiller : un combo Boom, puis Annuler depuis le message', async ({ page }) => {
  await demarrer(page);
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await expect(page.getByTestId('conseil-accroche')).toBeVisible();
  await capture(page, 'p4-habiller-conseil');
  await teteA(page, 2);
  await page.getByTestId('outil-combos').click();
  await expect(page.getByTestId('combos-etat')).toHaveAttribute('data-pret', '1', { timeout: 30_000 });
  await capture(page, 'p4-habiller-combos');
  await page.getByTestId('combo-boom').click();
  await expect(page.getByTestId('toast')).toContainText('Boom ajouté !');
  await capture(page, 'p4-habiller-combo-toast');
  await page.getByTestId('panneau-fermer').click();

  await page.getByTestId('outil-zoom').click();
  await expect(page.locator('[data-testid^="calque-zoom-"]')).toHaveCount(1);
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('outil-sons').click();
  await expect(page.locator('[data-testid^="calque-son-"]')).toHaveCount(1);
  await page.getByTestId('panneau-fermer').click();

  // Annuler (en-tête) puis Rétablir ; Annuler depuis le message d'un 2ᵉ combo.
  await page.getByTestId('annuler').click();
  await page.getByTestId('outil-zoom').click();
  await expect(page.locator('[data-testid^="calque-zoom-"]')).toHaveCount(0);
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('retablir').click();
  await page.getByTestId('outil-combos').click();
  await teteA(page, 4);
  await page.getByTestId('combo-boom').click();
  await expect(page.getByTestId('toast-action')).toHaveText('Annuler');
  await page.getByTestId('toast-action').click();
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('outil-zoom').click();
  await expect(page.locator('[data-testid^="calque-zoom-"]')).toHaveCount(1);
});

test('Modèles : Top 3 grisé avec 1 plan, appliqué sur 3 plans, puis annulé', async ({ page }) => {
  await demarrer(page);
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await page.getByTestId('outil-modeles').click();
  await expect(page.getByTestId('appliquer-top3')).toBeDisabled();
  await expect(page.getByTestId('top3-impossible')).toHaveText('Il faut au moins 3 passages : coupe ta vidéo dans Couper.');
  await capture(page, 'p4-modeles-grise');
  await page.getByTestId('panneau-fermer').click();

  // Retour à Couper : 3 plans.
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await teteA(page, 1);
  await page.getByTestId('scinder').click();
  await teteA(page, 3);
  await page.getByTestId('scinder').click();
  await expect(page.locator('[data-testid^="plan-"]')).toHaveCount(3);
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();

  await page.getByTestId('outil-modeles').click();
  await expect(page.getByTestId('appliquer-top3')).toBeEnabled();
  await page.getByTestId('appliquer-top3').click();
  await expect(page.getByTestId('toast')).toContainText('Top 3 appliqué !');
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('outil-texte').click();
  const textes = page.locator('[data-testid^="calque-texte-"], [data-testid^="calque-accroche-"]');
  await expect.poll(() => textes.count()).toBeGreaterThanOrEqual(3);
  await capture(page, 'p4-modeles-top3');
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('annuler').click();
  await page.getByTestId('outil-texte').click();
  await expect(textes).toHaveCount(0);
});

test('Mes montages : 2 projets, renommer, dupliquer, supprimer, rouvrir', async ({ page }) => {
  await demarrer(page);
  await expect(page.getByTestId('enregistre')).toHaveAttribute('data-etat', 'enregistre', { timeout: 10_000 });
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('montage-0')).toHaveAttribute('data-ouvert', '1');

  // Nouveau montage : plus de dialogue « Remplacer », l'ancien reste dans la liste.
  await importer(page, VIDEO_2);
  await expect(page.getByTestId('dialogue-remplacer')).toHaveCount(0);
  await expect(page.getByTestId('enregistre')).toHaveAttribute('data-etat', 'enregistre', { timeout: 10_000 });
  await page.getByTestId('retour').click();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(2);
  await capture(page, 'p4-mes-montages');

  // Renommer le plus ancien.
  await page.getByTestId('montage-menu-1').click();
  await capture(page, 'p4-mes-montages-menu');
  await page.getByTestId('action-renommer').click();
  await page.getByTestId('champ-titre').fill('Mon clutch');
  await page.getByTestId('renommer-valider').click();
  await expect(page.getByTestId('mes-montages')).toContainText('Mon clutch');

  // Dupliquer, puis supprimer la copie (avec confirmation).
  const titre = page.locator('[data-testid^="montage-titre-"]', { hasText: 'Mon clutch' }).first();
  const i = Number(((await titre.getAttribute('data-testid')) ?? '').split('-').pop());
  await page.getByTestId(`montage-menu-${i}`).click();
  await page.getByTestId('action-dupliquer').click();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(3);
  await page.getByTestId(`montage-menu-${i}`).click();
  await page.getByTestId('action-supprimer').click();
  await expect(page.getByTestId('dialogue-supprimer')).toBeVisible();
  await capture(page, 'p4-mes-montages-supprimer');
  await page.getByTestId('dialogue-annuler').click();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(3);
  await page.getByTestId(`montage-menu-${i}`).click();
  await page.getByTestId('action-supprimer').click();
  await page.getByTestId('dialogue-confirmer').click();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(2);

  // Rechargement : on rouvre « Mon clutch » en re-choisissant sa vidéo (une autre est refusée).
  await page.reload();
  await expect(page.locator('[data-testid^="montage-ouvrir-"]')).toHaveCount(2);
  const carte = page.locator('[data-testid^="montage-titre-"]', { hasText: 'Mon clutch' }).first();
  const j = Number(((await carte.getAttribute('data-testid')) ?? '').split('-').pop());
  let [choix] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId(`montage-ouvrir-${j}`).click()]);
  await choix.setFiles(VIDEO_2);
  await expect(page.getByTestId('erreur-import')).toBeVisible({ timeout: 30_000 });
  [choix] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId(`montage-ouvrir-${j}`).click()]);
  await choix.setFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('montage-0')).toContainText('Mon clutch');
  await expect(page.getByTestId('montage-0')).toHaveAttribute('data-ouvert', '1');
});
