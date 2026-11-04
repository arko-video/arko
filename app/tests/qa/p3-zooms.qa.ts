// @ts-nocheck
// (p3-c) Zooms : punch (force 2, centre déplacé) et doux (2 s) ; force mesurée sur l'export en comparant à un
// export sans zoom ; en jeu + webcam, le zoom reste dans la bande webcam. Annuler / Rétablir.
import { expect, test } from '@playwright/test';
test.use({ actionTimeout: 20_000 });
import { execFileSync } from 'node:child_process';
import { allerAEtape, CAPTURES, exporterEtTelecharger, importer, projetSauve, repartirDeZero, surveiller, teteA } from './outils';
import { fermerPanneau, imageRgb, JEUCAM } from './p2-outils';
import { demarrer, effets, empiler, MIRE, noter, planche, regler, verifierAnnulerRetablir } from './p3-outils';

/** Force estimée (python) : meilleure échelle s telle que B ≈ zoom(A, s, centre). */
function estimer(a: string, b: string, n: number, cx: number, cy: number, y0 = 0, y1 = 1): any {
  const out = execFileSync('python3', ['tests/qa/p3-estimer-zoom.py', a, b, String(n), String(cx), String(cy), String(y0), String(y1)]).toString();
  return JSON.parse(out);
}

test('(p3-c) zooms punch et doux : force, centre, durée', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const journal = surveiller(page);
  await demarrer(page, MIRE, 5);
  const ref = await exporterEtTelecharger(page, testInfo, 'zoom-ref.mp4');
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  const etats = [effets((await projetSauve(page))?.recette)];
  await page.getByTestId('outil-zoom').click();
  await teteA(page, 2);
  await page.getByTestId('ajouter-zoom').click();
  await noter(page, etats);
  await regler(page, 'force-zoom', 2);
  await noter(page, etats);
  // Centre : flèches (Maj = 5 %) → x 0,25, y 0,30.
  const cible = page.getByTestId('cible-zoom');
  await cible.focus();
  // Chaque appui de flèche est une entrée d'annulation (constaté) : on note chaque état.
  for (let k = 0; k < 5; k++) {
    await cible.press('Shift+ArrowLeft');
    await noter(page, etats);
  }
  for (let k = 0; k < 4; k++) {
    await cible.press('Shift+ArrowUp');
    await noter(page, etats);
  }
  await expect.poll(async () => (await projetSauve(page)).recette.zooms[0], { timeout: 8000 }).toMatchObject({ x: 0.25, y: 0.3 });
  await page.screenshot({ path: CAPTURES + 'p3-c-cible-zoom.png' });
  await page.getByTestId('nouveau-zoom').click();
  await teteA(page, 5);
  await page.getByTestId('ajouter-zoom').click();
  await noter(page, etats);
  await page.getByTestId('style-zoom-doux').click();
  await noter(page, etats);
  await regler(page, 'duree-zoom', 2);
  await noter(page, etats);
  const r = (await projetSauve(page)).recette;
  testInfo.annotations.push({ type: 'zooms', description: JSON.stringify(r.zooms) });

  const ar = await verifierAnnulerRetablir(page, etats);
  testInfo.annotations.push({ type: 'annuler/rétablir zooms (une entrée par appui de flèche)', description: JSON.stringify(ar) });

  await fermerPanneau(page);
  await allerAEtape(page, 5);
  const ex = await exporterEtTelecharger(page, testInfo, 'zoom.mp4');
  // Punch : 2,0 → 2,6 s (dur 0,6). Doux : 5 → 7 s, montée sur 75 %.
  const mesures = {
    punch_2_04: estimer(ref.chemin, ex.chemin, 61, 0.25, 0.3),
    punch_2_30: estimer(ref.chemin, ex.chemin, 69, 0.25, 0.3),
    punch_2_57: estimer(ref.chemin, ex.chemin, 77, 0.25, 0.3),
    avant_1_9: estimer(ref.chemin, ex.chemin, 57, 0.25, 0.3),
    doux_5_5: estimer(ref.chemin, ex.chemin, 165, 0.5, 0.5),
    doux_6_5: estimer(ref.chemin, ex.chemin, 195, 0.5, 0.5),
    apres_7_1: estimer(ref.chemin, ex.chemin, 213, 0.5, 0.5),
  };
  testInfo.annotations.push({ type: 'force mesurée', description: JSON.stringify(mesures) });
  planche(ex.chemin, [57, 60, 62, 69, 77, 80], CAPTURES + 'p3-c-punch.png', 150);
  planche(ex.chemin, [150, 165, 180, 195, 205, 212], CAPTURES + 'p3-c-doux.png', 150);
  empiler([CAPTURES + 'p3-c-punch.png', CAPTURES + 'p3-c-doux.png'], CAPTURES + 'p3-c-planche-zooms.png');
  expect(mesures.punch_2_30.echelle).toBeGreaterThan(1.9);
  expect(mesures.punch_2_30.echelle).toBeLessThan(2.1);
  expect(mesures.avant_1_9.echelle).toBeLessThan(1.03);
  expect(mesures.doux_6_5.echelle).toBeGreaterThan(1.2);
  expect(mesures.apres_7_1.echelle).toBeLessThan(1.03);
  expect(ar.erreurs).toEqual([]);
  testInfo.annotations.push({ type: 'console', description: JSON.stringify(journal.erreurs.slice(0, 5)) });
});

test('(p3-c2) jeu + webcam : le zoom reste dans la bande webcam', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  await repartirDeZero(page);
  await importer(page, MIRE); // la mire remplit aussi la bande webcam (la fixture p2-jeucam y a un aplat rouge : un zoom n'y change rien)
  await allerAEtape(page, 3);
  await page.getByTestId('mise-jeuCam').click();
  await expect(page.getByTestId('editeur-webcam')).toBeVisible();
  await page.getByTestId('webcam-ok').click();
  await allerAEtape(page, 5);
  const ref = await exporterEtTelecharger(page, testInfo, 'jeucam-ref.mp4');
  await page.getByTestId('retour').click();
  await page.getByTestId('outil-zoom').click();
  await teteA(page, 1);
  await page.getByTestId('ajouter-zoom').click();
  await expect.poll(async () => (await projetSauve(page)).recette.zooms?.[0]?.zone, { timeout: 8000 }).toBe('cam');
  await regler(page, 'force-zoom', 2);
  await expect.poll(async () => (await projetSauve(page)).recette.zooms?.[0]?.force, { timeout: 8000 }).toBe(2);
  const r = (await projetSauve(page)).recette;
  await page.screenshot({ path: CAPTURES + 'p3-c2-zoom-jeucam.png' });
  await fermerPanneau(page);
  await allerAEtape(page, 5);
  const ex = await exporterEtTelecharger(page, testInfo, 'jeucam-zoom.mp4');
  // Webcam en haut, partCam 0,35 → jointure à 672 px. Différence moyenne par bande, à 1,3 s (zoom plein).
  const a = imageRgb(ref.chemin, 0, 39);
  const b = imageRgb(ex.chemin, 0, 39);
  const j = Math.round((r.mise.partCam ?? 0.35) * 1920);
  const diff = (y0: number, y1: number) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = 0; x < 1080; x += 2) { const i = (y * 1080 + x) * 3; s += Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]); n++; }
    return +(s / n / 3).toFixed(2);
  };
  const res = { jointure: j, bandeCam: diff(0, j - 8), bandeJeu: diff(j + 8, 1920), mise: r.mise };
  testInfo.annotations.push({ type: 'jeu+webcam', description: JSON.stringify(res) });
  planche(ex.chemin, [20, 39], CAPTURES + 'p3-c2-export.png', 270);
  expect(res.bandeCam).toBeGreaterThan(5);
  expect(res.bandeJeu).toBeLessThan(2);
});
