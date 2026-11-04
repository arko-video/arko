// @ts-nocheck
// (p3-b) Transitions : les 7, une planche d'images exportées autour de chaque coupe (−0,15 / −0,067 / coupe /
// +0,067 / +0,15 s), durée totale inchangée, son assorti à la coupe, « Avec le son » coupé, « Partout »,
// un seul plan ⇒ message. Annuler / Rétablir.
import { expect, test } from '@playwright/test';
test.use({ actionTimeout: 20_000 });
import { allerAEtape, CAPTURES, exporterEtTelecharger, projetSauve, surveiller } from './outils';
import { fermerPanneau } from './p2-outils';
import { crete, demarrer, dureeFichier, effets, empiler, MIRE, noter, planche, scinderA, sonMono, verifierAnnulerRetablir } from './p3-outils';

const PAIRES = [
  ['flash', 'zoom'],
  ['glisse', 'noir'],
  ['glitch', 'secousse'],
];

test('(p3-b) transitions : 7 planches, durée, son, avec le son, partout, un plan', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const journal = surveiller(page);
  // Un seul plan : message.
  await demarrer(page, MIRE, 4);
  await page.getByTestId('outil-transitions').click();
  await expect(page.getByTestId('transitions-un-plan')).toBeVisible();
  testInfo.annotations.push({ type: 'un plan', description: (await page.getByTestId('transitions-un-plan').textContent()) ?? '' });
  await fermerPanneau(page);

  // 3 plans : coupes à 3 et 6 s.
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await scinderA(page, [3, 6]);
  await allerAEtape(page, 4);
  const lignes: string[] = [];
  const mesures: any[] = [];
  const etats = [effets((await projetSauve(page))?.recette)];
  for (const [a, b] of PAIRES) {
    await page.getByTestId('outil-transitions').click();
    await page.getByTestId('coupe-1').click();
    await page.getByTestId(`transition-${a}`).click();
    await noter(page, etats);
    await page.getByTestId('coupe-2').click();
    await page.getByTestId(`transition-${b}`).click();
    await noter(page, etats);
    await fermerPanneau(page);
    await allerAEtape(page, 5);
    const ex = await exporterEtTelecharger(page, testInfo, `trans-${a}-${b}.mp4`);
    const x = sonMono(ex.chemin);
    for (const [type, cut] of [[a, 3], [b, 6]] as const) {
      const f = Math.round(cut * 30);
      const png = CAPTURES + `p3-b-${type}.png`;
      planche(ex.chemin, [f - 5, f - 2, f, f + 2, f + 5], png);
      lignes.push(png);
      mesures.push({ type, duree: dureeFichier(ex.chemin), creteAutourCoupe: +crete(x, cut - 0.6, cut + 0.6).toFixed(3) });
    }
    await page.getByTestId('retour').click();
    await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  }
  empiler(lignes, CAPTURES + 'p3-b-planche-transitions.png');
  testInfo.annotations.push({ type: 'transitions', description: JSON.stringify(mesures) });
  for (const m of mesures) expect(Math.abs(m.duree - 10)).toBeLessThan(0.05);
  for (const m of mesures) {
    if (m.type === 'noir') expect(m.creteAutourCoupe).toBeLessThan(0.01);
    else expect(m.creteAutourCoupe).toBeGreaterThan(0.1);
  }

  // « Avec le son » coupé sur la coupe 2 (secousse), puis « Partout » depuis la coupe 1 (glitch, avec son).
  await page.getByTestId('outil-transitions').click();
  await page.getByTestId('coupe-2').click();
  await page.getByTestId('transition-avec-son').uncheck();
  await noter(page, etats);
  const rS = (await projetSauve(page)).recette;
  expect(rS.plans[2].trans).toMatchObject({ type: 'secousse', son: false });
  await fermerPanneau(page);
  await allerAEtape(page, 5);
  const ex2 = await exporterEtTelecharger(page, testInfo, 'trans-sans-son.mp4');
  const x2 = sonMono(ex2.chemin);
  const sansSon = { coupe1: crete(x2, 2.4, 3.6), coupe2: crete(x2, 5.4, 6.6) };
  testInfo.annotations.push({ type: 'avec le son coupé', description: JSON.stringify(sansSon) });
  expect(sansSon.coupe2).toBeLessThan(0.01);
  expect(sansSon.coupe1).toBeGreaterThan(0.1);
  await page.getByTestId('retour').click();
  await page.getByTestId('outil-transitions').click();
  await page.getByTestId('coupe-1').click();
  await page.getByTestId('transition-partout').click();
  await noter(page, etats);
  const rP = (await projetSauve(page)).recette;
  testInfo.annotations.push({ type: 'partout', description: JSON.stringify(rP.plans.map((p) => p.trans ?? null)) });
  expect(rP.plans.slice(1).map((p) => (typeof p.trans === 'string' ? p.trans : p.trans?.type))).toEqual(['glitch', 'glitch']);
  await page.screenshot({ path: CAPTURES + 'p3-b-panneau-transitions.png' });

  const ar = await verifierAnnulerRetablir(page, etats);
  testInfo.annotations.push({ type: 'annuler/rétablir transitions', description: JSON.stringify(ar) });
  expect(ar.erreurs).toEqual([]);
  testInfo.annotations.push({ type: 'console', description: JSON.stringify(journal.erreurs.slice(0, 5)) });
});
