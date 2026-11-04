// (p2-d) Émoji dans un texte : message « Les émojis ne s'affichent pas encore dans la vidéo », et aucun carré
// (« tofu ») dans l'export : l'image du texte avec émojis doit être identique à celle du même texte sans émoji.
import { expect, test } from '@playwright/test';
import { allerAEtape, CAPTURES, exporterEtTelecharger, surveiller, teteA } from './outils';
import { ajouterTexte, allerAHabiller, boiteCouleur, capturerImage, CITRON, fermerPanneau, GRIS, grisReduit, imageRgb, psnr } from './p2-outils';

test('(p2-d) émoji : message, puis aucun carré dans l\'export', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await allerAHabiller(page, GRIS);
  await teteA(page, 1);
  await ajouterTexte(page, 'GG 🔥😂 les gars 👍🏽', 'citron');
  await expect(page.getByTestId('alerte-emoji')).toHaveText(/Les émojis ne s'affichent pas encore dans la vidéo\./);
  await page.screenshot({ path: CAPTURES + 'p2-d-alerte-emoji.png' });
  await fermerPanneau(page);
  await teteA(page, 5);
  await ajouterTexte(page, 'GG les gars', 'citron');
  await expect(page.getByTestId('alerte-emoji')).toHaveCount(0);
  await fermerPanneau(page);
  // Accroche faite seulement d'émojis : rien à dessiner (et pas d'erreur).
  await page.getByTestId('outil-accroche').click();
  await page.getByTestId('champ-accroche').fill('🔥🔥🔥');
  await page.getByTestId('champ-accroche').press('Enter');
  await expect(page.getByTestId('alerte-emoji')).toBeVisible();
  await fermerPanneau(page);

  await allerAEtape(page, 5);
  const { chemin } = await exporterEtTelecharger(page, testInfo, 'emoji.mp4');
  const avec = imageRgb(chemin, 2);
  const sans = imageRgb(chemin, 6);
  const debut = imageRgb(chemin, 0, 0);
  capturerImage(chemin, 2, 'p2-d-export-emoji');
  const bAvec = boiteCouleur(avec, CITRON, 40, 2);
  const bSans = boiteCouleur(sans, CITRON, 40, 2);
  const p = psnr(grisReduit(avec), grisReduit(sans));
  testInfo.annotations.push({ type: 'texte avec / sans émojis', description: JSON.stringify({ bAvec, bSans, psnrDb: p.toFixed(1), image0Blanche: boiteCouleur(debut, [255, 255, 255], 30, 2) }) });
  expect(Math.abs(bAvec!.x1 - bAvec!.x0 - (bSans!.x1 - bSans!.x0))).toBeLessThan(0.01);
  expect(p, 'même image avec et sans émojis (aucun carré)').toBeGreaterThan(35);
  expect(boiteCouleur(debut, [255, 255, 255], 30, 2), 'accroche « 🔥🔥🔥 » : rien dessiné').toBeNull();
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
