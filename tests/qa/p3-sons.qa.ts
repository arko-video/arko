// @ts-nocheck
// (p3-a) Sons du catalogue : 3 sons posés à la tête de lecture (1, 4, 7 s), volume, décalage, suppression ;
// l'énergie dans le MP4 tombe au bon moment (±30 ms) ; un son attaché au temps source suit quand on coupe avant ;
// Annuler / Rétablir sur chaque action.
import { expect, test } from '@playwright/test';
test.use({ actionTimeout: 20_000 });
import { allerAEtape, CAPTURES, exporterEtTelecharger, projetSauve, surveiller, teteA } from './outils';
import { fermerPanneau } from './p2-outils';
import { attaquesAudio, crete, demarrer, effets, MIRE, noter, regler, sonMono, verifierAnnulerRetablir } from './p3-outils';

test('(p3-a) sons : pose, volume, décalage, suppression, temps exact dans le MP4, suit la coupe', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const journal = surveiller(page);
  await demarrer(page, MIRE, 4);
  const etats = [effets((await projetSauve(page))?.recette)];
  await page.getByTestId('outil-sons').click();
  const poses: [number, string, string][] = [
    [1, 'impact', 'impact.boom'],
    [4, 'interface', 'interface.ding'],
    [7, 'jeu', 'jeu.piece'],
  ];
  for (const [t, fam, id] of poses) {
    await teteA(page, t);
    await page.getByTestId(`famille-${fam}`).click();
    await page.getByTestId(`son-ajouter-${id}`).click();
    await noter(page, etats);
  }
  await expect(page.getByTestId('droits-sons')).toBeVisible();
  const r1 = (await projetSauve(page)).recette;
  testInfo.annotations.push({ type: 'sons posés', description: JSON.stringify(r1.sons) });
  expect(r1.sons.map((s) => s.id)).toEqual(['impact.boom', 'interface.ding', 'jeu.piece']);
  expect(r1.sons.every((s) => s.ts !== undefined)).toBe(true); // attaché au temps source

  // Export 1 : les 3 attaques à 1, 4, 7 s.
  await fermerPanneau(page);
  await allerAEtape(page, 5);
  const e1 = await exporterEtTelecharger(page, testInfo, 'sons-1.mp4');
  const x1 = sonMono(e1.chemin);
  const att1 = attaquesAudio(x1);
  const c1 = [crete(x1, 0.9, 2.4), crete(x1, 3.9, 5.2), crete(x1, 6.9, 7.5)];
  testInfo.annotations.push({ type: 'attaques export 1', description: JSON.stringify({ att1, c1 }) });
  expect(att1.length).toBe(3);
  [1, 4, 7].forEach((t, k) => expect(Math.abs(att1[k] - t)).toBeLessThan(0.03));

  // Volume du 2e son à 150 %, décalage du 3e de +0,2 s, suppression du 1er.
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('calque-son-1').click({ force: true });
  await expect(page.getByTestId('reglages-son')).toHaveAttribute('data-i', '1');
  await regler(page, 'volume-son', 150);
  await noter(page, etats);
  await page.getByTestId('retour-sons').click();
  await page.getByTestId('calque-son-2').click({ force: true });
  await expect(page.getByTestId('reglages-son')).toHaveAttribute('data-i', '2');
  await page.getByTestId('decaler-son-plus').click();
  await noter(page, etats);
  await page.getByTestId('decaler-son-plus').click();
  await noter(page, etats);
  await expect(page.getByTestId('decaler-son-valeur')).toContainText('0:07,2');
  await page.getByTestId('retour-sons').click();
  await page.getByTestId('calque-son-0').click({ force: true });
  await page.getByTestId('supprimer-son').click();
  await noter(page, etats);
  const r2 = (await projetSauve(page)).recette;
  testInfo.annotations.push({ type: 'sons réglés', description: JSON.stringify(r2.sons) });
  expect(r2.sons.length).toBe(2);
  expect(r2.sons[0].vol).toBe(1.5);

  // Annuler / Rétablir sur les 7 actions.
  const ar = await verifierAnnulerRetablir(page, etats);
  testInfo.annotations.push({ type: 'annuler/rétablir sons', description: JSON.stringify(ar) });
  await page.screenshot({ path: CAPTURES + 'p3-a-sons-minifrise.png' });

  await fermerPanneau(page);
  await allerAEtape(page, 5);
  const e2 = await exporterEtTelecharger(page, testInfo, 'sons-2.mp4');
  const x2 = sonMono(e2.chemin);
  const att2 = attaquesAudio(x2);
  const c2 = [crete(x2, 3.9, 5.2), crete(x2, 7.1, 7.7)];
  testInfo.annotations.push({ type: 'attaques export 2', description: JSON.stringify({ att2, c2, rapportVolumeDing: c2[0] / c1[1] }) });
  expect(att2.length).toBe(2);
  expect(Math.abs(att2[0] - 4)).toBeLessThan(0.03);
  expect(Math.abs(att2[1] - 7.2)).toBeLessThan(0.03);

  // Couper : « Commencer ici » à 2 s → les sons (temps source 4 et 7,2) passent à 2 et 5,2.
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await teteA(page, 2);
  await page.getByTestId('commencer-ici').click();
  await expect.poll(async () => (await projetSauve(page))?.recette?.plans?.[0]?.de, { timeout: 8000 }).toBe(2);
  await allerAEtape(page, 5);
  const e3 = await exporterEtTelecharger(page, testInfo, 'sons-3.mp4');
  const att3 = attaquesAudio(sonMono(e3.chemin));
  testInfo.annotations.push({ type: 'attaques après coupe avant', description: JSON.stringify(att3) });
  expect(att3.length).toBe(2);
  expect(Math.abs(att3[0] - 2)).toBeLessThan(0.03);
  expect(Math.abs(att3[1] - 5.2)).toBeLessThan(0.03);
  expect(ar.erreurs).toEqual([]);
  testInfo.annotations.push({ type: 'console', description: JSON.stringify(journal.erreurs.slice(0, 5)) });
});
