// (k) Course dans lecteur.ts : l'aperçu reste-t-il noir / périmé après un rechargement de recette ?
import { test } from '@playwright/test';
import { FIX, importer, repartirDeZero, VIDEO_TEST } from './outils';
import type { Page } from '@playwright/test';

async function centre(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas');
    const p = c?.getContext('2d', { willReadFrequently: true })?.getImageData(270, 480, 1, 1).data;
    return p ? [p[0]!, p[1]!, p[2]!] : null;
  });
}

test('(k1) aperçu noir après import : fréquence sur 6 essais', async ({ page }, testInfo) => {
  const res: string[] = [];
  for (let i = 0; i < 6; i++) {
    await repartirDeZero(page);
    await importer(page, i % 2 ? FIX + 'degrade-640x360.mp4' : VIDEO_TEST);
    await page.waitForTimeout(2000);
    res.push(`${i % 2 ? 'degrade' : 'test'}:${(await centre(page))?.join(',')}`);
  }
  testInfo.annotations.push({ type: 'centre de l’aperçu 2 s après import', description: JSON.stringify(res) });
});

test('(k2) aperçu après glissé du recadré', async ({ page }, testInfo) => {
  await repartirDeZero(page);
  await importer(page, FIX + 'degrade-640x360.mp4');
  await page.getByTestId('suivant').click();
  await page.getByTestId('mise-recadre').click();
  await page.waitForTimeout(1500);
  const avant = await centre(page);
  const ap = (await page.getByTestId('apercu').boundingBox())!;
  const y = ap.y + ap.height * 0.3;
  await page.mouse.move(ap.x + ap.width * 0.7, y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(ap.x + ap.width * (0.7 - 0.04 * k), y);
  await page.mouse.up();
  const serie: string[] = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    serie.push((await centre(page))?.join(',') ?? '');
  }
  testInfo.annotations.push({ type: 'recadré : centre avant / après glissé (attendu R≈160 après)', description: JSON.stringify({ avant, apres: serie }) });
});
