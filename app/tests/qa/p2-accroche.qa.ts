// (p2-a) Accroche : visible et entière dès la 1re image du MP4 exporté (pas d'entrée « pop » à t = 0).
// Image 0 extraite avec ffmpeg (captures/p2-accroche-image0.png) et comparée à l'image 15 (0,5 s).
import { expect, test } from '@playwright/test';
import { allerAEtape, auditEcran, CAPTURES, exporterEtTelecharger, surveiller } from './outils';
import { allerAHabiller, boiteCouleur, capturerImage, fermerPanneau, GRIS, imageRgb } from './p2-outils';

const BLANC = [255, 255, 255];

test('(p2-a) accroche entière dès la 1re image', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await allerAHabiller(page, GRIS);
  await page.getByTestId('outil-accroche').click();
  await expect(page.getByTestId('panneau-accroche')).toBeVisible();
  const nbIdees = await page.locator('[data-testid^="suggestion-"]').count();
  testInfo.annotations.push({ type: 'suggestions', description: String(nbIdees) });
  expect(nbIdees).toBeGreaterThanOrEqual(15);
  // Accroche longue tapée au clavier : 2 lignes ou plus.
  const long = 'Il ne s\'attendait vraiment pas à ça, regarde jusqu\'à la fin';
  await page.getByTestId('champ-accroche').fill(long);
  await page.getByTestId('champ-accroche').press('Enter');
  await expect(page.getByTestId('calque-accroche-0')).toBeVisible();
  await page.screenshot({ path: CAPTURES + 'p2-a-accroche-panneau.png' });
  testInfo.annotations.push({ type: 'audit panneau accroche', description: JSON.stringify(await auditEcran(page)) });
  await fermerPanneau(page);

  await allerAEtape(page, 5);
  const { chemin, ms } = await exporterEtTelecharger(page, testInfo, 'accroche.mp4');
  const img0 = imageRgb(chemin, 0, 0);
  const img15 = imageRgb(chemin, 0, 15);
  const img80 = imageRgb(chemin, 0, 80); // 2,67 s : l'accroche (0 → 2,5 s) a disparu
  const b0 = boiteCouleur(img0, BLANC, 30, 2);
  const b15 = boiteCouleur(img15, BLANC, 30, 2);
  const b80 = boiteCouleur(img80, BLANC, 30, 2);
  capturerImage(chemin, 0, 'p2-accroche-image0', 0);
  capturerImage(chemin, 0, 'p2-accroche-image15', 15);
  testInfo.annotations.push({ type: 'boîtes du texte blanc', description: JSON.stringify({ ms, image0: b0, image15: b15, image80: b80 }) });
  expect(b0, 'texte visible à l\'image 0').not.toBeNull();
  expect(b80, 'accroche disparue après 2,5 s').toBeNull();
  // Entière : pas coupée par les bords, et même taille qu'à 0,5 s (pas d'animation d'entrée).
  expect(b0!.x0).toBeGreaterThan(0.05);
  expect(b0!.x1).toBeLessThan(0.95);
  expect(Math.abs(b0!.x1 - b0!.x0 - (b15!.x1 - b15!.x0))).toBeLessThan(0.01);
  expect(Math.abs(b0!.y1 - b0!.y0 - (b15!.y1 - b15!.y0))).toBeLessThan(0.01);
  // Dans la zone sûre de TikTok (haut 12,5 %).
  expect.soft(b0!.y0, 'accroche sous la zone du haut de TikTok').toBeGreaterThan(0.125);
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
