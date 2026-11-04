// (l) Export multi-plans : précision des coupes (une couleur par seconde de source) et absence d'erreur
// quand le pré-décodage du plan suivant se déclenche (5 coupes).
import { expect, test } from '@playwright/test';
import { allerAEtape, analyserMp4, exporterEtTelecharger, FIX, importer, pixel, repartirDeZero, surveiller } from './outils';

test('(l) 3 plans gardés sur 6 : couleurs aux bons temps', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, FIX + 'couleurs-12s.mp4');
  const tete = page.getByTestId('tete-lecture');
  for (const s of [2, 4, 6, 8, 10]) {
    await tete.focus();
    await tete.press('Home');
    for (let k = 0; k < s; k++) await tete.press('PageUp');
    await page.getByTestId('scinder').click();
  }
  for (const i of [5, 3, 1]) {
    await page.getByTestId(`plan-${i}`).click();
    await page.getByTestId('supprimer').click();
  }
  await expect(page.getByTestId('duree-finale')).toContainText('6,0');
  await allerAEtape(page, 5);
  const { chemin, ms } = await exporterEtTelecharger(page, testInfo, 'coupes.mp4');
  const info = await analyserMp4(chemin);
  const source = FIX + 'couleurs-12s.mp4';
  // sortie → source attendue : [0,2]→[0,2], [2,4]→[4,6], [4,6]→[8,10]
  const points = [
    [0.5, 0.5], [1.9, 1.9], [2.05, 4.05], [3.5, 5.5], [3.95, 5.95], [4.05, 8.05], [5.9, 9.9],
  ];
  const comparaisons = points.map(([tSortie, tSource]) => {
    const a = pixel(chemin, tSortie!, Math.round(info.l / 2), 960);
    const b = pixel(source, tSource!, 320, 180);
    const ecart = Math.max(...a.map((v, k) => Math.abs(v - b[k]!)));
    return { tSortie, tSource, sortie: a, source: b, ecart };
  });
  testInfo.annotations.push({ type: 'export multi-plans', description: JSON.stringify({ ms, ...info, comparaisons, erreurs: journal.erreurs }) });
  expect(Math.abs(info.duree - 6)).toBeLessThanOrEqual(0.05);
  for (const c of comparaisons) expect.soft(c.ecart, `couleur à t=${c.tSortie}`).toBeLessThan(35); // chroma 4:2:0 agrandi : ±30 toléré, la seconde voisine diffère de > 80
});
