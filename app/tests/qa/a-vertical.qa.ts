// (a) Source déjà verticale : l'étape Vertical est sautée, l'export marche.
import { expect, test } from '@playwright/test';
import { allerAEtape, analyserMp4, auditEcran, CAPTURES, exporterEtTelecharger, FIX, importer, repartirDeZero, surveiller } from './outils';

test('(a) vidéo verticale 1080×1920 : Vertical sauté, export OK', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, FIX + 'vertical-1080x1920.mp4');
  await page.getByTestId('suivant').click();
  // Phase 2 : on arrive directement à Habiller (Vertical sautée), avec le message.
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await expect(page.getByTestId('toast')).toContainText('déjà verticale');
  await page.screenshot({ path: CAPTURES + 'a-vertical-saute.png' });

  // Retour du navigateur : revient à Couper (pas à Vertical).
  await page.goBack();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await page.goForward();
  const etapeApresAvant = await page.getByTestId('etape').textContent();
  testInfo.annotations.push({ type: 'goForward depuis Couper', description: String(etapeApresAvant) });
  // On revient à Habiller, puis à l'export.
  expect(etapeApresAvant).toContain('4 sur 5');
  await allerAEtape(page, 5);

  const { chemin, ms } = await exporterEtTelecharger(page, testInfo, 'vertical.mp4');
  const info = await analyserMp4(chemin);
  testInfo.annotations.push({ type: 'export vertical', description: JSON.stringify({ ms, ...info }) });
  expect(info.h).toBe(1920);
  expect([1080, 1072]).toContain(info.l);
  expect(Math.abs(info.duree - 5)).toBeLessThanOrEqual(0.05);
  expect(info.audio).toBe(true);
  testInfo.annotations.push({ type: 'audit', description: JSON.stringify(await auditEcran(page)) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
