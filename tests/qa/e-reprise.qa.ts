// (e) Rechargement en plein montage → carte « Reprendre » → re-choisir le même fichier → mêmes plans.
//     Re-choisir un autre fichier → refus avec message. Plus : erreurs d'import (faux fichier, HEVC).
import { expect, test } from '@playwright/test';
import { CAPTURES, FIX, importer, projetSauve, repartirDeZero, surveiller, teteA, VIDEO_TEST } from './outils';

test('(e) reprise après rechargement', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, VIDEO_TEST);
  await teteA(page, 2);
  await page.getByTestId('scinder').click();
  await page.getByTestId('plan-0').click();
  await page.getByTestId('supprimer').click();
  await expect(page.getByTestId('duree-finale')).toContainText('3,0');
  // Aller jusqu'à Vertical et choisir Plein écran.
  await page.getByTestId('suivant').click();
  await page.getByTestId('mise-recadre').click();
  // « Enregistré » apparaît (sauvegarde auto 1 s).
  await expect(page.getByTestId('enregistre')).toContainText('Enregistré', { timeout: 5000 });
  const avant = await projetSauve(page);
  testInfo.annotations.push({ type: 'sauvegarde avant rechargement', description: JSON.stringify({ etape: avant.etape, plans: avant.recette.plans, mise: avant.recette.mise }) });

  await page.reload();
  // Phase 4 : « Mes montages » remplace la carte « Reprendre ».
  await expect(page.getByTestId('montage-0')).toBeVisible();
  await expect(page.getByTestId('montage-0')).toContainText('Arrêté à : Vertical');
  await page.screenshot({ path: CAPTURES + 'e-reprise.png', fullPage: true });

  // Autre fichier → refus.
  await page.getByTestId('montage-ouvrir-0').click().catch(() => undefined); // ouvre le sélecteur (sans effet en headless)
  await page.getByTestId('fichier').setInputFiles(FIX + 'autre-1920x1080.mp4');
  await expect(page.getByTestId('erreur-import')).toContainText('Ce n\'est pas la même vidéo');
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await page.screenshot({ path: CAPTURES + 'e-reprise-refus.png', fullPage: true });

  // Même fichier → reprise à Vertical avec les mêmes plans.
  await page.getByTestId('montage-ouvrir-0').click().catch(() => undefined);
  await page.getByTestId('fichier').setInputFiles(VIDEO_TEST);
  await expect(page.getByTestId('etape')).toHaveText('Étape 3 sur 5', { timeout: 30_000 });
  await expect(page.getByTestId('mise-recadre')).toHaveAttribute('aria-checked', 'true');
  // Retour → Couper avec 3,0 s.
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await expect(page.getByTestId('duree-finale')).toContainText('3,0');
  await expect(page.getByTestId('plan-1')).toHaveCount(0);
  const apres = await projetSauve(page);
  expect(apres.recette.plans).toEqual(avant.recette.plans);
  // Encore un Retour → Importer : phase 4, le montage ouvert est la 1re carte de « Mes montages » (data-ouvert).
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('montage-0')).toHaveAttribute('data-ouvert', '1');
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});

test('(e2) erreurs d’import en français', async ({ page }, testInfo) => {
  surveiller(page);
  await repartirDeZero(page);
  await page.getByTestId('fichier').setInputFiles(FIX + 'faux.mp4');
  await expect(page.getByTestId('erreur-import')).toBeVisible({ timeout: 20_000 });
  const m1 = await page.getByTestId('erreur-import').textContent();
  await page.screenshot({ path: CAPTURES + 'e2-erreur-format.png', fullPage: true });
  await page.getByTestId('fichier').setInputFiles(FIX + 'hevc-1920x1080.mp4');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('chargement')).toHaveCount(0, { timeout: 20_000 });
  const etape = await page.getByTestId('etape').textContent();
  const m2 = await page.getByTestId('erreur-import').textContent().catch(() => '(pas d’erreur)');
  testInfo.annotations.push({ type: 'messages', description: JSON.stringify({ faux: m1, hevc: m2, etapeApresHevc: etape }) });
});
