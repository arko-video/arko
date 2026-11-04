// (h) Courses et doubles touchers : double toucher sur « Créer la vidéo », modification de la recette pendant l'export,
// glissé de poignée pendant la lecture.
import { expect, test } from '@playwright/test';
import { allerAEtape, CAPTURES, FIX, importer, repartirDeZero, surveiller } from './outils';

test('(h1) double toucher sur « Créer la vidéo »', async ({ page }, testInfo) => {
  surveiller(page);
  await repartirDeZero(page);
  await importer(page, FIX + 'long12-1920x1080.mp4');
  await allerAEtape(page, 5);
  const bCreer = (await page.getByTestId('creer-video').boundingBox())!;
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('annuler-export')).toBeVisible();
  const bAnnuler = (await page.getByTestId('annuler-export').boundingBox())!;
  testInfo.annotations.push({ type: 'positions', description: JSON.stringify({ creer: bCreer, annuler: bAnnuler }) });
  // Second toucher au même endroit, 150 ms après (un double toucher rapide).
  await page.mouse.click(bCreer.x + bCreer.width / 2, bCreer.y + bCreer.height / 2);
  await page.waitForTimeout(300);
  const etat = (await page.getByTestId('erreur-export').count()) ? await page.getByTestId('erreur-export').textContent() : 'export toujours en cours';
  testInfo.annotations.push({ type: 'après second toucher', description: String(etat) });
  await page.screenshot({ path: CAPTURES + 'h1-double-toucher.png' });
  expect.soft(etat, 'un double toucher ne doit pas annuler l’export').toBe('export toujours en cours');
});

test('(h2) navigation arrière pendant l’export puis modification', async ({ page }, testInfo) => {
  surveiller(page);
  await repartirDeZero(page);
  await importer(page, FIX + 'long12-1920x1080.mp4');
  await allerAEtape(page, 5);
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('annuler-export')).toBeVisible();
  // Tentative d'annuler la recette pendant l'export via le clavier (Ctrl+Z) : aucun raccourci → sans effet attendu.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 300_000 });
  // Après l'export, revenir à Couper et modifier : l'export doit être périmé.
  for (let k = 0; k < 3; k++) await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await page.getByTestId('finir-ici').click(); // tête à 0 → sans effet
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('PageUp');
  await page.getByTestId('finir-ici').click();
  await allerAEtape(page, 5);
  const avant = await page.getByTestId('creer-video').count();
  testInfo.annotations.push({ type: 'export périmé après modification', description: avant ? 'oui (écran avant)' : 'NON : ancien résultat affiché' });
  expect(avant).toBe(1);
});
