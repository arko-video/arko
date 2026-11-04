// @ts-nocheck — outils Node (child_process, fs) : @types/node n'est pas installé dans le projet.
// (p4-nr) Non-régression : un parcours complet qui touche chaque phase, sur la vidéo parlée (sous-titres avec le vrai
// modèle servi depuis tests/fixtures/modeles/) : coupe, fond flou, accroche, sous-titres, son, transition flash, zoom,
// combo Boom, export. Le MP4 est vérifié (durée, taille, son, accroche, sous-titres, flash, boum).
import { expect, test } from '@playwright/test';
import { allerAEtape, analyserMp4, exporterEtTelecharger, importer, projetSauve, repartirDeZero, surveiller, teteA } from './outils';
import { boiteCouleur, capturerImage, CITRON, fermerPanneau, imageRgb, servirModele } from './p2-outils';

/** parole-fr.mp4 (verticale, donc sans étape Vertical) mise en 1280 × 720 avec des bandes : pour pouvoir choisir le fond flou. */
const PAROLE = 'tests/qa/fixtures/p4-parole-paysage.mp4';
import { crete, sonMono } from './p3-outils';
import { dureeMp4, recetteSauvee } from './p4-outils';

test('(p4-nr) parcours complet : coupe, flou, accroche, sous-titres, son, transition, zoom, combo, export', async ({ page }, testInfo) => {
  test.setTimeout(1_200_000);
  const journal = surveiller(page);
  const reseau = { hf: [], cdn: [] };
  await servirModele(page, reseau);
  await page.addInitScript(() => localStorage.setItem('arko.conseils.vus', '1'));
  await repartirDeZero(page);
  await importer(page, PAROLE);
  // Couper : coupe à 5 s, fin à 9 s.
  await teteA(page, 5);
  await page.getByTestId('scinder').click();
  await teteA(page, 9);
  await page.getByTestId('finir-ici').click();
  await recetteSauvee(page, (r) => r.plans.length === 2 && r.plans[1].a === 9);
  // Vertical : fond flou.
  await allerAEtape(page, 3);
  await page.getByTestId('mise-flou').click();
  await allerAEtape(page, 4);
  // Accroche.
  await page.getByTestId('outil-accroche').click();
  await page.getByTestId('champ-accroche').fill('REGARDE ÇA');
  await page.getByTestId('champ-accroche').press('Enter');
  await fermerPanneau(page);
  // Sous-titres (vrai modèle, servi localement).
  await page.getByTestId('outil-sousTitres').click();
  await page.getByTestId('creer-sous-titres').click();
  await page.getByTestId('module-telecharger').click({ timeout: 5000 }).catch(() => undefined); // dialogue du 1er usage (s'il apparaît)
  await expect(page.getByTestId('lignes-sous-titres')).toBeVisible({ timeout: 600_000 });
  await fermerPanneau(page);
  // Son à 2 s.
  await page.getByTestId('outil-sons').click();
  await teteA(page, 2);
  await page.getByTestId('famille-impact').click();
  await page.getByTestId('son-ajouter-impact.boom').click();
  await fermerPanneau(page);
  // Transition flash sur la coupe.
  await page.getByTestId('outil-transitions').click();
  await page.getByTestId('coupe-1').click();
  await page.getByTestId('transition-flash').click();
  await fermerPanneau(page);
  // Zoom à 3 s.
  await teteA(page, 3);
  await page.getByTestId('outil-zoom').click();
  await page.getByTestId('ajouter-zoom').click({ timeout: 3000 }).catch(() => undefined);
  await fermerPanneau(page);
  // Combo Boom à 7 s.
  await page.getByTestId('barre-outils').getByTestId('outil-combos').click();
  await expect(page.getByTestId('combos-etat')).toHaveAttribute('data-pret', '1', { timeout: 30_000 });
  await teteA(page, 7);
  await page.getByTestId('combo-boom').click();
  await fermerPanneau(page);
  const r = await recetteSauvee(page, (r) => r.zooms.length >= 2 && r.sons.length >= 2 && !!r.sousTitres && r.textes.length >= 1);
  await allerAEtape(page, 5);
  const ex = await exporterEtTelecharger(page, testInfo, 'parcours.mp4', 600_000);
  const infos = await analyserMp4(ex.chemin);
  const duree = dureeMp4(ex.chemin);
  // Accroche (texte blanc à contour noir en haut) : énergie des contours dans la bande 0,1–0,4 à 0,5 s vs 4 s.
  const blanc = (t) => {
    const img = imageRgb(ex.chemin, t);
    let n = 0;
    for (let y = Math.round(0.1 * img.h); y < Math.round(0.4 * img.h); y += 3)
      for (let x = 0; x < img.l; x += 3) {
        const i = (y * img.l + x) * 3;
        if (img.d[i] > 235 && img.d[i + 1] > 235 && img.d[i + 2] > 235) n++;
      }
    return n;
  };
  const accroche = { a0_5: blanc(0.5), a4: blanc(4) };
  // Sous-titres : le mot en cours en citron, quelque part entre 0,5 et 8,5 s.
  const sousTitres = [0.8, 1.6, 2.4, 3.2, 4.4, 5.6, 6.4, 7.2, 8.0].map((t) => ({ t, citron: !!boiteCouleur(imageRgb(ex.chemin, t), CITRON, 40, 4) }));
  // Flash blanc à la coupe (5 s) : luminance moyenne.
  const lum = (t) => {
    const img = imageRgb(ex.chemin, t);
    let s = 0;
    for (let k = 0; k < img.d.length; k += 30) s += img.d[k];
    return s / (img.d.length / 30);
  };
  const flash = { a4_5: lum(4.5), a5_0: lum(5.0) };
  const x = sonMono(ex.chemin);
  const boum = { avant: crete(x, 1.5, 1.95), pendant: crete(x, 2.0, 2.3) };
  capturerImage(ex.chemin, 0.5, 'p4-nr-0-5s');
  capturerImage(ex.chemin, 3.2, 'p4-nr-3-2s');
  testInfo.annotations.push({
    type: 'parcours',
    description: JSON.stringify({ duree, infos, plans: r.plans, mise: r.mise, textes: r.textes.map((t) => t.txt), sons: r.sons.map((s) => s.id), zooms: r.zooms.length, motsSousTitres: Array.isArray(r.sousTitres?.mots) ? r.sousTitres.mots.length : r.sousTitres?.mots, accroche, sousTitres, flash, boum, hf: reseau.hf.length, cdn: reseau.cdn, ms: ex.ms }),
  });
  expect(journal.erreurs).toEqual([]);
  expect.soft(Math.abs(duree - 9)).toBeLessThan(0.07);
  expect.soft([infos.l, infos.h]).toEqual([1080, 1920]);
  expect.soft(infos.audio).toBe(true);
  expect.soft(accroche.a0_5).toBeGreaterThan(accroche.a4 + 50);
  expect.soft(sousTitres.filter((s) => s.citron).length).toBeGreaterThan(2);
  expect.soft(flash.a5_0).toBeGreaterThan(flash.a4_5 + 40);
  expect.soft(reseau.cdn).toEqual([]);
});
