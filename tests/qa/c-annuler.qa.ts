// (c) Annuler / Rétablir après scinder + supprimer, y compris Rétablir effacé par une nouvelle action,
// rognage à la poignée, Commencer ici / Finir ici, ±1 image, zoom.
import { expect, test } from '@playwright/test';
import { CAPTURES, importer, projetSauve, repartirDeZero, surveiller, teteA, VIDEO_TEST } from './outils';

test('(c) annuler / rétablir après scinder et supprimer', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, VIDEO_TEST);
  const duree = page.getByTestId('duree-finale');
  await expect(duree).toContainText('5,0');
  await expect(page.getByTestId('annuler')).toBeDisabled();
  await expect(page.getByTestId('retablir')).toBeDisabled();

  // Scinder à 2 s puis à 4 s → 3 plans.
  await teteA(page, 2);
  await page.getByTestId('scinder').click();
  await teteA(page, 4);
  await page.getByTestId('scinder').click();
  await expect(page.getByTestId('plan-2')).toBeVisible();
  // Double clic sur Scinder au même endroit : sans effet (pas de plan vide).
  await page.getByTestId('scinder').dblclick();
  await expect(page.getByTestId('plan-3')).toHaveCount(0);

  // Supprimer le plan du milieu.
  await page.getByTestId('plan-1').click();
  await expect(page.getByTestId('plan-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('poignee-debut')).toBeVisible();
  await page.getByTestId('supprimer').click();
  await expect(duree).toContainText('3,0');
  await expect(page.getByTestId('plan-2')).toHaveCount(0);
  await expect(page.getByTestId('supprimer')).toBeDisabled();

  // Annuler ×3 → 1 plan de 5 s ; Rétablir ×3 → 2 plans, 3 s.
  for (let i = 0; i < 3; i++) await page.getByTestId('annuler').click();
  await expect(duree).toContainText('5,0');
  await expect(page.getByTestId('plan-1')).toHaveCount(0);
  await expect(page.getByTestId('annuler')).toBeDisabled();
  for (let i = 0; i < 3; i++) await page.getByTestId('retablir').click();
  await expect(duree).toContainText('3,0');
  await expect(page.getByTestId('retablir')).toBeDisabled();

  // Une nouvelle action après Annuler efface le futur.
  await page.getByTestId('annuler').click();
  await expect(duree).toContainText('5,0');
  await teteA(page, 1);
  await page.getByTestId('finir-ici').click();
  await expect(duree).toContainText('1,0');
  await expect(page.getByTestId('retablir')).toBeDisabled();
  await page.getByTestId('annuler').click();
  await expect(duree).toContainText('5,0');

  // Commencer ici à 2 s (sur un 3 plans : 0-2 | 2-4 | 4-5).
  await teteA(page, 3);
  await page.getByTestId('commencer-ici').click();
  // 5 − 3 = 2 s (plans [3,4] et [4,5]).
  await expect(duree).toContainText('2,0');
  await page.getByTestId('annuler').click();
  await expect(duree).toContainText('5,0');

  // ±1 image.
  await teteA(page, 2);
  await page.getByTestId('image-plus').click();
  await expect(page.getByTestId('tete-lecture')).toHaveAttribute('aria-valuenow', '2.03');
  await page.getByTestId('image-moins').click();
  await page.getByTestId('image-moins').click();
  await expect(page.getByTestId('tete-lecture')).toHaveAttribute('aria-valuenow', '1.97');

  // Rognage à la poignée de fin du plan 0 (glisser vers la gauche).
  await page.getByTestId('plan-0').click();
  const poignee = page.getByTestId('poignee-fin');
  const b = (await poignee.boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 20, b.y + b.height / 2, { steps: 5 });
  const bulle = await page.getByTestId('bulle').textContent().catch(() => null);
  await page.mouse.move(b.x - 40, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  const texteDuree = await duree.textContent();
  testInfo.annotations.push({ type: 'rognage', description: `bulle pendant le glissé=${bulle} ; durée après=${texteDuree}` });
  expect(bulle).toMatch(/^0:0\d,\d$/);
  await page.getByTestId('annuler').click();
  await expect(duree).toContainText('5,0');

  // Zoom +.
  await page.getByTestId('zoom-plus').click();
  await page.getByTestId('zoom-plus').click();
  await page.screenshot({ path: CAPTURES + 'c-couper-zoom.png' });

  // Raccourcis clavier Ctrl+Z ? (non demandés, information)
  await page.waitForTimeout(1500);
  const sauve = await projetSauve(page);
  testInfo.annotations.push({ type: 'plans sauvegardés', description: JSON.stringify(sauve?.recette?.plans) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
