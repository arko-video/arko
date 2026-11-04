// (b) Plein écran (recadré) choisi dans l'interface, cadrage déplacé au doigt (souris), puis export.
// Source : dégradé horizontal 640×360 (rouge à droite, bleu à gauche) → on vérifie que le cadrage exporté suit x.
import { expect, test } from '@playwright/test';
import { allerAEtape, analyserMp4, CAPTURES, exporterEtTelecharger, FIX, importer, pixel, projetSauve, repartirDeZero, surveiller } from './outils';

test('(b) Plein écran recadré, x déplacé au glissé, export conforme', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, FIX + 'degrade-640x360.mp4');
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 3 sur 5');

  // Zone sûre désactivée par défaut.
  await expect(page.getByTestId('zone-sure-interrupteur')).not.toBeChecked();
  await page.getByTestId('mise-recadre').click();
  await expect(page.getByTestId('mise-recadre')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('aide-recadre')).toBeVisible();

  // Glisser l'image vers la GAUCHE de 40 % de la largeur → on doit voir plus à droite (x augmente, rouge).
  const apercu = page.getByTestId('apercu');
  const boite = (await apercu.boundingBox())!;
  const y = boite.y + boite.height * 0.3;
  const x0 = boite.x + boite.width * 0.7;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(x0 - (boite.width * 0.4 * k) / 10, y);
  await page.mouse.up();
  await page.waitForTimeout(1500); // sauvegarde auto (1 s)
  const sauve = await projetSauve(page);
  const mise = sauve?.recette?.mise;
  testInfo.annotations.push({ type: 'mise après glissé', description: JSON.stringify(mise) });
  expect(mise?.type).toBe('recadre');
  expect(mise?.x).toBeGreaterThan(0.6);
  // Le glissé ne doit pas avoir lancé la lecture.
  await expect(apercu).toHaveAttribute('data-lecture', '0');
  await page.screenshot({ path: CAPTURES + 'b-recadre-apres-glisse.png' });

  // Annuler ramène x à 0,5, Rétablir le remet.
  await page.getByTestId('annuler').click();
  await page.getByTestId('retablir').click();

  await allerAEtape(page, 5);
  const { chemin, ms } = await exporterEtTelecharger(page, testInfo, 'recadre.mp4');
  const info = await analyserMp4(chemin);
  const centre = pixel(chemin, 1, Math.round(info.l / 2), 960);
  testInfo.annotations.push({ type: 'export recadré', description: JSON.stringify({ ms, ...info, pixelCentre: centre, x: mise?.x }) });
  expect(info.h).toBe(1920);
  // Avec x ≈ mise.x, le centre de l'image exportée correspond à la colonne x × 640 de la source :
  // rouge ≈ 255 × x, bleu ≈ 255 × (1 − x).
  expect(Math.abs(centre[0]! - 255 * mise.x)).toBeLessThan(30);
  expect(centre[0]!).toBeGreaterThan(centre[2]!);
  // Pleine image : pas de bandes noires en haut et en bas.
  const haut = pixel(chemin, 1, Math.round(info.l / 2), 10);
  expect(haut[0]! + haut[1]! + haut[2]!).toBeGreaterThan(60);
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
