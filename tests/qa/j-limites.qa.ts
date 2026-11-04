// (j) Limites : (1) atteindre 1 h 30 d'une vidéo de 2 h avec l'interface seule (poignée de fin) ;
// (2) lecture à travers de nombreuses coupes : images non fermées (avertissements Chrome), saccades.
import { expect, test } from '@playwright/test';
import { FIX, importer, repartirDeZero, surveiller, VIDEO_TEST } from './outils';

test('(j1) vidéo de 2 h : étendre le plan à la poignée', async ({ page }, testInfo) => {
  await repartirDeZero(page);
  await importer(page, FIX + 'long-2h-320x180.mp4', 120_000);
  const duree = page.getByTestId('duree-finale');
  const releves: string[] = [String(await duree.textContent())];
  await page.getByTestId('plan-0').click(); // sélection (un seul plan : poignées déjà là)
  for (let k = 0; k < 8; k++) {
    const p = page.getByTestId('poignee-fin');
    const b = (await p.boundingBox())!;
    await page.mouse.move(b.x + 10, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(350, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    releves.push(String(await duree.textContent()));
  }
  testInfo.annotations.push({ type: 'durée après chaque glissé pleine largeur de la poignée de fin', description: JSON.stringify(releves) });
});

test('(j2) lecture à travers 8 coupes : avertissements et images', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, VIDEO_TEST);
  const tete = page.getByTestId('tete-lecture');
  // Scinder tous les 0,5 s, puis supprimer un plan sur deux.
  for (let i = 1; i <= 8; i++) {
    await tete.focus();
    await tete.press('Home');
    for (let k = 0; k < i * 15; k++) await tete.press('ArrowRight');
    await page.getByTestId('scinder').click();
  }
  for (const i of [7, 5, 3, 1]) {
    await page.getByTestId(`plan-${i}`).click();
    await page.getByTestId('supprimer').click();
  }
  const d = await page.getByTestId('duree-finale').textContent();
  await tete.focus();
  await tete.press('Home');
  await page.getByTestId('lecture').click();
  await page.waitForTimeout(4000);
  await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
  const t = await tete.getAttribute('aria-valuenow');
  await page.waitForTimeout(1000);
  testInfo.annotations.push({ type: 'lecture multi-coupes', description: JSON.stringify({ duree: d, teteApres4s: t, erreurs: journal.erreurs, avertissements: journal.avertissements.filter((w) => !w.includes('willReadFrequently')) }) });
  expect(journal.erreurs).toEqual([]);
});
