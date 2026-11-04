// (p2-g) Jeu + webcam : cadre déplacé et redimensionné sur la vraie webcam, webcam en haut puis en bas, taille ;
// bandes exportées correctes (webcam rouge, séparation noire de 6 px, jeu bleu avec la bande jaune au centre) ;
// réglage mémorisé au montage suivant ; sous-titres sur la jointure (et qui la suivent).
// Vidéo de test : fond bleu (le jeu), bande jaune verticale au centre, rectangle rouge en bas à gauche (la webcam :
// x 40–540, y 670–1040 sur 1920 × 1080).
import { expect, test, type Page } from '@playwright/test';
import { allerAEtape, CAPTURES, exporterEtTelecharger, importer, pixel, projetSauve, repartirDeZero, surveiller } from './outils';
import { boiteCouleur, capturerImage, imageRgb, injecter, JEUCAM, recetteQuand } from './p2-outils';

const proche = (p: number[], c: number[], tol = 60) => p.every((v, i) => Math.abs(v - c[i]!) <= tol);
const ROUGE = [255, 0, 0];
const BLEU = [0, 0, 255];
const JAUNE = [255, 255, 0];

async function glisser(page: Page, testid: string, dx: number, dy: number) {
  const zone = (await page.getByTestId('cam-source').boundingBox())!;
  const b = (await page.getByTestId(testid).boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx * zone.width, y + dy * zone.height, { steps: 8 });
  await page.mouse.up();
}

/** Couleurs aux points clés d'une image exportée (colonne x = 300 : jeu bleu / webcam rouge ; x = 540 : bande jaune). */
function bandes(chemin: string, t: number, part: number, camEnHaut: boolean) {
  const j = Math.round((camEnHaut ? part : 1 - part) * 1920);
  const yCam = camEnHaut ? Math.round(j / 2) : Math.round((j + 1920) / 2);
  const yJeu = camEnHaut ? Math.round((j + 1920) / 2) : Math.round(j / 2);
  return {
    jointure: j,
    cam: pixel(chemin, t, 300, yCam),
    jeuBleu: pixel(chemin, t, 200, yJeu),
    jeuJaune: pixel(chemin, t, 540, yJeu),
    // Colonne x = 60 : hors des sous-titres, qui sont centrés sur la jointure.
    separation: pixel(chemin, t, 60, j - 1),
    auDessus: pixel(chemin, t, 60, j - 12),
    auDessous: pixel(chemin, t, 60, j + 10),
  };
}

test('(p2-g) jeu + webcam : cadre, bandes, mémoire, sous-titres sur la jointure', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, JEUCAM);
  await allerAEtape(page, 3);
  await page.getByTestId('mise-jeuCam').click();
  await expect(page.getByTestId('editeur-webcam')).toBeVisible();
  const depart = (await projetSauve(page))?.recette?.mise;
  // Déplacer le cadre sur le rectangle rouge, puis le réduire par le coin en haut à gauche.
  await glisser(page, 'cadre-webcam', -0.7, 0.6);
  await glisser(page, 'poignee-cam-hg', 0.02, 0.02);
  const r1 = await recetteQuand(page, (r) => r.mise?.cam?.x < 0.1 && r.mise?.cam?.y > 0.6 && r.mise?.cam?.l < 0.26);
  await page.screenshot({ path: CAPTURES + 'p2-g-editeur.png' });
  testInfo.annotations.push({ type: 'cadre', description: JSON.stringify({ depart, apres: r1.mise }) });
  // Le cadre est dans le rectangle rouge.
  const c = r1.mise.cam;
  expect(c.x).toBeGreaterThanOrEqual(0.02);
  expect(c.x + c.l).toBeLessThanOrEqual(0.29);
  expect(c.y).toBeGreaterThanOrEqual(0.61);
  expect(c.y + c.h).toBeLessThanOrEqual(0.97);
  await page.getByTestId('webcam-ok').click();

  // Sous-titres posés sans hauteur : ils vont sur la jointure (0,35 avec la webcam en haut).
  await allerAEtape(page, 4);
  const mots = 'bien joué les gars on a gagné ce match ensemble vraiment incroyable'.split(' ').map((w, k) => [w, 0.1 + k * 0.33, 0.1 + k * 0.33 + 0.3]);
  await injecter(page, JEUCAM, { sousTitres: { style: 'karaoke', mots } });
  // Une modification (style boîte puis karaoké) fait réécrire la sauvegarde normalisée (avec y).
  await page.getByTestId('outil-sousTitres').click();
  await page.getByTestId('style-sous-titres-boite').click();
  await page.getByTestId('style-sous-titres-karaoke').click();
  await page.getByTestId('panneau-fermer').click();
  const r2 = await recetteQuand(page, (r) => r.sousTitres?.style === 'karaoke' && r.sousTitres?.y !== undefined);
  testInfo.annotations.push({ type: 'sous-titres (webcam en haut)', description: JSON.stringify({ y: r2.sousTitres.y, mise: r2.mise }) });
  expect(r2.sousTitres.y).toBeCloseTo(0.35, 2);

  await allerAEtape(page, 5);
  const e1 = await exporterEtTelecharger(page, testInfo, 'jeucam-haut.mp4');
  const b1 = bandes(e1.chemin, 1, 0.35, true);
  const st1 = boiteCouleur(imageRgb(e1.chemin, 1), [255, 255, 255], 30, 2);
  capturerImage(e1.chemin, 1, 'p2-g-export-cam-haut');
  testInfo.annotations.push({ type: 'export webcam en haut', description: JSON.stringify({ ms: e1.ms, ...b1, sousTitres: st1 }) });
  expect.soft(proche(b1.cam, ROUGE), 'bande webcam rouge').toBe(true);
  expect.soft(proche(b1.jeuBleu, BLEU), 'jeu bleu').toBe(true);
  expect.soft(proche(b1.jeuJaune, JAUNE), 'bande jaune au centre du jeu').toBe(true);
  expect.soft(b1.separation.every((v) => v < 40), 'séparation noire').toBe(true);
  expect.soft(proche(b1.auDessus, ROUGE) && proche(b1.auDessous, BLEU), 'bords de la séparation').toBe(true);
  expect.soft(Math.abs((st1!.y0 + st1!.y1) / 2 - 0.35), 'sous-titres centrés sur la jointure').toBeLessThan(0.03);

  // Webcam en bas, taille 0,5 : les sous-titres suivent la jointure (0,5).
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 3 sur 5');
  await page.getByTestId('regler-webcam').click();
  await page.getByTestId('cam-en-bas').click();
  await page.getByTestId('taille-webcam').fill('0.5');
  await page.getByTestId('webcam-ok').click();
  const r3 = await recetteQuand(page, (r) => r.mise?.camEnHaut === false && r.mise?.partCam === 0.5);
  testInfo.annotations.push({ type: 'sous-titres (webcam en bas, 0,5)', description: JSON.stringify({ y: r3.sousTitres?.y, mise: r3.mise }) });
  expect.soft(r3.sousTitres.y, 'sous-titres sur la nouvelle jointure').toBeCloseTo(0.5, 2);

  await allerAEtape(page, 5);
  const e2 = await exporterEtTelecharger(page, testInfo, 'jeucam-bas.mp4');
  const b2 = bandes(e2.chemin, 1, 0.5, false);
  const st2 = boiteCouleur(imageRgb(e2.chemin, 1), [255, 255, 255], 30, 2);
  capturerImage(e2.chemin, 1, 'p2-g-export-cam-bas');
  testInfo.annotations.push({ type: 'export webcam en bas', description: JSON.stringify({ ms: e2.ms, ...b2, sousTitres: st2 }) });
  expect.soft(proche(b2.cam, ROUGE), 'bande webcam rouge (en bas)').toBe(true);
  expect.soft(proche(b2.jeuBleu, BLEU), 'jeu bleu (en haut)').toBe(true);
  expect.soft(b2.separation.every((v) => v < 40), 'séparation noire').toBe(true);
  expect.soft(Math.abs((st2!.y0 + st2!.y1) / 2 - 0.5), 'sous-titres sur la jointure').toBeLessThan(0.03);

  // Mémoire : nouveau montage (on efface le projet, pas localStorage) → le dernier cadre est repris.
  const memoire = await page.evaluate(() => JSON.parse(localStorage.getItem('arko.cam') ?? 'null'));
  testInfo.annotations.push({ type: 'arko.cam', description: JSON.stringify(memoire) });
  expect(memoire).toMatchObject({ camEnHaut: false, partCam: 0.5 });
  await page.getByTestId('autre-clip').click();
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await importer(page, JEUCAM);
  await allerAEtape(page, 3);
  await page.getByTestId('mise-jeuCam').click();
  await expect(page.getByTestId('toast')).toContainText('J\'ai repris ton dernier cadre webcam.');
  const r4 = await recetteQuand(page, (r) => r.mise?.type === 'jeuCam');
  testInfo.annotations.push({ type: 'montage suivant', description: JSON.stringify(r4.mise) });
  expect(r4.mise.cam).toEqual(memoire.cam);
  expect(r4.mise.camEnHaut).toBe(false);
  expect(r4.mise.partCam).toBe(0.5);
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});
