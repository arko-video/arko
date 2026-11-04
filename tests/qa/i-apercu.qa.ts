// (i) L'aperçu affiche-t-il une image après l'import (sans toucher à rien), après un déplacement, après Lecture ?
import { expect, test, type Page } from '@playwright/test';
import { CAPTURES, FIX, importer, repartirDeZero, surveiller, VIDEO_TEST } from './outils';

async function centre(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas');
    const p = c?.getContext('2d')?.getImageData(270, 480, 1, 1).data;
    return p ? [p[0]!, p[1]!, p[2]!] : null;
  });
}

async function sonder(page: Page, nom: string, fichier: string) {
  const res: Record<string, unknown> = {};
  await repartirDeZero(page);
  const t0 = Date.now();
  await importer(page, fichier, 120_000);
  res.importMs = Date.now() - t0;
  const serie: string[] = [];
  for (let i = 0; i < 8; i++) {
    serie.push(`${Date.now() - t0}ms:${(await centre(page))?.join(',')}`);
    await page.waitForTimeout(500);
  }
  res.sansAction = serie;
  await page.screenshot({ path: `${CAPTURES}i-${nom}-sans-action.png` });
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('ArrowRight');
  await page.waitForTimeout(1500);
  res.apresFleche = (await centre(page))?.join(',');
  await tete.press('Home');
  await page.waitForTimeout(1500);
  res.apresDebut = (await centre(page))?.join(',');
  await page.getByTestId('lecture').click();
  await page.waitForTimeout(1500);
  res.pendantLecture = (await centre(page))?.join(',');
  await page.getByTestId('lecture').click();
  res.teteApresLecture = await tete.getAttribute('aria-valuenow');
  await page.screenshot({ path: `${CAPTURES}i-${nom}-apres-lecture.png` });
  return res;
}

test('(i) aperçu : image affichée', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  const court = await sonder(page, 'court', VIDEO_TEST);
  testInfo.annotations.push({ type: 'vidéo de test 5 s', description: JSON.stringify(court) });
  const long = await sonder(page, 'long2h', FIX + 'long-2h-320x180.mp4');
  testInfo.annotations.push({ type: 'vidéo 2 h', description: JSON.stringify(long) });
  testInfo.annotations.push({ type: 'console', description: JSON.stringify({ e: journal.erreurs, w: journal.avertissements.slice(0, 10) }) });
  expect(true).toBe(true);
});
