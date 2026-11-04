// (p2-b) Texte glissé sur l'aperçu : la position exportée = la position de l'aperçu ; le texte reste dans
// la zone sûre de TikTok (haut 12,5 %, bas 34,375 %, côtés 11,1 %) ; aimant au centre (x = 0,5).
// Vidéo grise unie : le fond citron du style « citron » et le fond blanc du style « bulle » se repèrent au pixel.
import { expect, test, type Page } from '@playwright/test';
import { allerAEtape, CAPTURES, exporterEtTelecharger, surveiller, teteA } from './outils';
import {
  ajouterTexte, allerAHabiller, apercuRgba, apercuStable, boiteCouleur, capturerImage, CITRON, fermerPanneau, GRIS, imageRgb, recetteQuand,
} from './p2-outils';

const BLANC = [255, 255, 255];

/** Glisse la boîte du texte i de (fx, fy) × la taille de l'aperçu. Renvoie si la zone sûre et le guide étaient visibles. */
async function glisser(page: Page, i: number, fx: number, fy: number) {
  const ap = (await page.getByTestId('apercu').boundingBox())!;
  const b = (await page.getByTestId(`texte-boite-${i}`).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + fx * ap.width, y + fy * ap.height, { steps: 10 });
  const zoneSure = await page.getByTestId('zone-sure').isVisible();
  const guide = await page.getByTestId('guide-centre').isVisible().catch(() => false);
  await page.mouse.up();
  return { zoneSure, guide };
}

test('(p2-b) texte glissé : aperçu = export, zone sûre, aimant', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await allerAHabiller(page, GRIS);

  // Texte 1 (citron) à 1 s, glissé à droite et vers le bas.
  await teteA(page, 1);
  await ajouterTexte(page, 'Position test', 'citron');
  await fermerPanneau(page);
  const g1 = await glisser(page, 0, 0.2, 0.25);
  const r1 = await recetteQuand(page, (r) => r.textes[0]?.y > 0.3);
  testInfo.annotations.push({ type: 'texte 1 après glissé', description: JSON.stringify({ ...r1.textes[0], ...g1 }) });
  expect(g1.zoneSure, 'zone sûre affichée pendant le glissé').toBe(true);

  // Texte 2 (bulle, 3 lignes) à 5 s : glissé tout en bas à droite (au-delà des bords).
  await teteA(page, 5);
  await ajouterTexte(page, 'Trois lignes de texte pour voir si la zone sûre tient bien le coup jusqu\'en bas', 'bulle');
  await fermerPanneau(page);
  await glisser(page, 1, 0.6, 0.9);
  const r2 = await recetteQuand(page, (r) => r.textes[1]?.y > 0.5);
  testInfo.annotations.push({ type: 'texte 2 (3 lignes) glissé au bord', description: JSON.stringify(r2.textes[1]) });

  // Texte 3 (citron) à 9 s : petit glissé horizontal (2 % de la largeur) → l'aimant le garde à x = 0,5.
  await teteA(page, 9);
  await ajouterTexte(page, 'Aimant', 'citron');
  await fermerPanneau(page);
  const g3 = await glisser(page, 2, 0.02, 0.1);
  const r3 = await recetteQuand(page, (r) => r.textes[2]?.y > 0.25);
  testInfo.annotations.push({ type: 'aimant', description: JSON.stringify({ ...r3.textes[2], ...g3 }) });
  expect(r3.textes[2].x).toBe(0.5);
  expect.soft(g3.guide, 'guide du centre affiché pendant l\'aimant').toBe(true);

  // Boîtes dans l'aperçu (canevas 540 × 960).
  await teteA(page, 2);
  await apercuStable(page);
  const ap1 = boiteCouleur(await apercuRgba(page), CITRON, 30, 2);
  await page.screenshot({ path: CAPTURES + 'p2-b-apercu-texte1.png' });
  await teteA(page, 6);
  await apercuStable(page);
  const ap2 = boiteCouleur(await apercuRgba(page), BLANC, 20, 2);
  await page.getByTestId('zone-sure-bouton').click();
  await page.screenshot({ path: CAPTURES + 'p2-b-apercu-texte2-zone-sure.png' });
  await page.getByTestId('zone-sure-bouton').click();

  await allerAEtape(page, 5);
  const { chemin } = await exporterEtTelecharger(page, testInfo, 'texte-glisse.mp4');
  const ex1 = boiteCouleur(imageRgb(chemin, 2), CITRON, 40, 2);
  const ex2 = boiteCouleur(imageRgb(chemin, 6), BLANC, 30, 2);
  capturerImage(chemin, 6, 'p2-b-export-texte2');
  testInfo.annotations.push({ type: 'boîtes aperçu / export', description: JSON.stringify({ ap1, ex1, ap2, ex2 }) });

  // Aperçu = export (à 1 % près de la taille de l'image).
  for (const k of ['x0', 'y0', 'x1', 'y1'] as const) {
    expect.soft(Math.abs(ap1![k] - ex1![k]), `texte 1 ${k}`).toBeLessThan(0.012);
    expect.soft(Math.abs(ap2![k] - ex2![k]), `texte 2 ${k}`).toBeLessThan(0.012);
  }
  // Zone sûre : côtés 11,1 %, haut 12,5 %, bas 34,375 % (y ≤ 0,656).
  expect.soft(ex2!.x0, 'texte 2 : bord gauche').toBeGreaterThanOrEqual(0.105);
  expect.soft(ex2!.x1, 'texte 2 : bord droit').toBeLessThanOrEqual(0.895);
  expect.soft(ex2!.y1, 'texte 2 (3 lignes) : bas dans la zone sûre').toBeLessThanOrEqual(0.66);
  expect.soft(ex1!.x1).toBeLessThanOrEqual(0.895);
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
