// @ts-nocheck — outils Node (child_process, fs) : @types/node n'est pas installé dans le projet.
// QA phase 4 :
// (p4-a) Vitesse + arrêt sur image : durée du MP4 = Σ((a − de)/vit + fige), image VRAIMENT figée et muette pendant
//        l'arrêt (ffmpeg), temps source de chaque image (carré rouge), hauteur du son (ralenti plus grave),
//        sons et sous-titres posés en temps source au bon endroit.
// (p4-b) Combos : aimantés au pic le plus proche (après le recul de 0,15 s), un seul Annuler défait tout un combo,
//        un combo pendant la lecture, rendu dans le MP4 (Figé + Raté).
import { expect, test } from '@playwright/test';
import { allerAEtape, exporterEtTelecharger, importer, projetSauve, repartirDeZero, surveiller, teteA } from './outils';
import { injecter } from './p2-outils';
import { crete, frequence, sonMono } from './p3-outils';
import { BOITE, dureeMp4, ecartImages, images, PICS_BOITE, recetteSauvee, rms, tempsSourceImage, tete } from './p4-outils';

/** Ouvre le panneau Combos s'il est fermé. ATTENTION : le contenu du panneau porte AUSSI data-testid="outil-combos" :
 *  un clic au centre de ce conteneur tombe sur le bouton « Figé » (pointerdown) et pose un combo. */
async function ouvrirCombos(page) {
  if (await page.getByTestId('combo-boom').isVisible().catch(() => false)) return;
  await page.getByTestId('barre-outils').getByTestId('outil-combos').click();
  await expect(page.getByTestId('combos-etat')).toHaveAttribute('data-pret', '1', { timeout: 30_000 });
}

test('(p4-a) vitesse 0,5 + arrêt 1 s, puis vitesse 2 : durée, image figée, silence, sons et sous-titres', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, BOITE);
  await teteA(page, 4);
  await page.getByTestId('scinder').click();
  await recetteSauvee(page, (r) => r.plans.length === 2);
  await page.getByTestId('plan-0').click();
  await page.getByTestId('vitesse-0-5').click();
  await page.getByTestId('arret-1').click();
  await page.getByTestId('plan-1').click();
  await page.getByTestId('vitesse-2').click();
  const r = await recetteSauvee(page, (r) => r.plans[0].vit === 0.5 && r.plans[0].fige === 1 && r.plans[1].vit === 2);
  const dureeAffichee = (await page.getByTestId('duree-finale').textContent()) ?? '';
  // Sons et sous-titres en TEMPS SOURCE (injectés) : ding à ts 3 (plan 0, ×0,5 → 6,0 s), à ts 5,5 (plan 1, ×2 → 9,75 s) ;
  // un sous-titre « boîte » sur ts 5,0–5,8 (→ 9,5–9,9 s).
  await injecter(page, BOITE, {
    sons: [
      { id: 'interface.ding', ts: 3, src: r.sources[0].id, vol: 1 },
      { id: 'interface.ding', ts: 5.5, src: r.sources[0].id, vol: 1 },
    ],
    sousTitres: { style: 'boite', y: 0.58, mots: [['TEST', 5, 5.8, 0]] },
  });
  await allerAEtape(page, 5);
  const ex = await exporterEtTelecharger(page, testInfo, 'vitesse-fige.mp4');
  const duree = dureeMp4(ex.chemin);
  const attendu = (4 - 0) / 0.5 + 1 + (10 - 4) / 2; // 12 s

  // Images : temps source attendu à chaque instant de sortie.
  const attenduA = (t: number) => (t < 8 ? t * 0.5 : t < 9 ? 4 : 4 + (t - 9) * 2);
  const mesures = [1, 3.5, 7.5, 8.1, 8.5, 8.9, 9.3, 10.5, 11.5].map((t) => ({ t, ts: tempsSourceImage(ex.chemin, t), attendu: attenduA(t) }));
  const fige = { ecart_8_15_8_9: ecartImages(ex.chemin, 8.15, 8.9), ecart_7_0_7_5: ecartImages(ex.chemin, 7.0, 7.5) };

  // Son : silence pendant l'arrêt (8–9 s), ralenti plus grave (220 Hz), accéléré plus aigu (880 Hz).
  const x = sonMono(ex.chemin);
  const son = {
    rmsAvant: rms(x, 7.0, 7.8),
    rmsArret: rms(x, 8.05, 8.95),
    rmsApres: rms(x, 10.0, 10.5),
    hzRalenti: frequence(x, 4.5, 5.5),
    rmsRalenti: rms(x, 4.5, 5.5),
    rmsAccelere: rms(x, 11.3, 11.9),
    hzAccelere: frequence(x, 11.3, 11.9),
    dingRalenti: crete(x, 5.98, 6.1) - crete(x, 5.7, 5.95),
    dingAccelere: crete(x, 9.73, 9.85) - crete(x, 9.6, 9.72),
  };
  // Sous-titre « boîte » (fond noir) : pixels sombres dans la bande y 0,5–0,7.
  const { imageRgb } = await import('./p2-outils');
  const sombres = (t: number) => {
    const img = imageRgb(ex.chemin, t);
    let n = 0;
    for (let y = Math.round(0.5 * img.h); y < Math.round(0.7 * img.h); y += 4)
      for (let xx = 0; xx < img.l; xx += 4) {
        const i = (y * img.l + xx) * 3;
        if (img.d[i] < 50 && img.d[i + 1] < 50 && img.d[i + 2] < 50) n++;
      }
    return n;
  };
  const sousTitre = { a9_7: sombres(9.7), a8_5: sombres(8.5), a11_5: sombres(11.5) };
  testInfo.annotations.push({ type: 'mesures', description: JSON.stringify({ dureeAffichee, duree, attendu, mesures, fige, son, sousTitre }) });
  expect(journal.erreurs).toEqual([]);
  expect.soft(Math.abs(duree - attendu), `durée ${duree} au lieu de ${attendu}`).toBeLessThan(0.07);
  for (const m of mesures) expect.soft(m.ts !== null && Math.abs(m.ts - m.attendu) < 0.07, `image à ${m.t} s : ts ${m.ts} au lieu de ${m.attendu}`).toBe(true);
  expect.soft(fige.ecart_8_15_8_9, 'image figée').toBeLessThan(0.5);
  expect.soft(fige.ecart_7_0_7_5, 'image en mouvement avant').toBeGreaterThan(0.2);
  expect.soft(son.rmsArret, 'silence pendant l\'arrêt').toBeLessThan(0.003);
  expect.soft(son.rmsAvant).toBeGreaterThan(0.03);
  expect.soft(Math.abs(son.hzRalenti - 220), `ralenti ${son.hzRalenti} Hz`).toBeLessThan(15);
  expect.soft(Math.abs(son.hzAccelere - 880), `accéléré ${son.hzAccelere} Hz`).toBeLessThan(30);
  expect.soft(son.dingRalenti, 'ding à 6,0 s').toBeGreaterThan(0.1);
  expect.soft(son.dingAccelere, 'ding à 9,75 s').toBeGreaterThan(0.1);
  expect.soft(sousTitre.a9_7, 'sous-titre visible à 9,7 s').toBeGreaterThan(50);
  expect.soft(sousTitre.a8_5, 'pas de sous-titre pendant l\'arrêt').toBeLessThan(10);
});

test('(p4-b) combos : aimant au pic, un seul Annuler, pendant la lecture, rendu MP4', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await page.addInitScript(() => localStorage.setItem('arko.conseils.vus', '1'));
  await repartirDeZero(page);
  await importer(page, BOITE);
  await allerAEtape(page, 4);
  await page.getByTestId('outil-combos').click();
  await expect(page.getByTestId('combos-etat')).toHaveAttribute('data-pret', '1', { timeout: 30_000 });

  // 1. Boom à 5,4 s (à l'arrêt) : 5,4 − 0,15 = 5,25 → aimanté au pic (~5,05).
  await teteA(page, 5);
  await images(page, 12); // 5,4 s à 30 i/s
  const t1 = await tete(page);
  await page.getByTestId('combo-boom').click();
  const r1 = await recetteSauvee(page, (r) => r.zooms.length === 1 && r.sons.length === 1);
  const boom = { tete: t1, zoom: r1.zooms[0], son: r1.sons[0] };
  // Un seul Annuler retire le zoom ET le son.
  await page.getByTestId('annuler').click();
  const r1b = await recetteSauvee(page, (r) => r.zooms.length === 0);
  const annulerBoom = { zooms: r1b.zooms.length, sons: r1b.sons.length };

  // 2. Boom loin d'un pic (3,5 s → 3,35 s) : pas d'aimant.
  await teteA(page, 3);
  await images(page, 15);
  const t2 = await tete(page);
  await ouvrirCombos(page);
  await page.getByTestId('combo-boom').click();
  const r2 = await recetteSauvee(page, (r) => r.zooms.length === 1);
  const boomLibre = { tete: t2, zoom: r2.zooms[0] };
  await page.getByTestId('annuler').click();
  await recetteSauvee(page, (r) => r.zooms.length === 0);

  // 3. Figé à 7,7 s → 7,55 → aimanté au pic 7,55 : coupe + arrêt 1 s + disque rayé ; un seul Annuler.
  await teteA(page, 7);
  await images(page, 21);
  const t3 = await tete(page);
  await ouvrirCombos(page);
  await page.getByTestId('combo-fige').click();
  const r3 = await recetteSauvee(page, (r) => r.plans.length === 2);
  const fige = { tete: t3, plans: r3.plans, sons: r3.sons };
  await page.getByTestId('annuler').click();
  const r3b = await recetteSauvee(page, (r) => r.plans.length === 1 && r.sons.length === 0);
  const annulerFige = { plans: r3b.plans.length, sons: r3b.sons.length, fige: r3b.plans[0].fige ?? null };

  // 4. Pendant la lecture : Boom touché vers 2,3 s.
  await teteA(page, 1);
  await ouvrirCombos(page);
  await page.getByTestId('lecture').click();
  await expect.poll(() => tete(page), { timeout: 8000, intervals: [50] }).toBeGreaterThan(2.25);
  const t4 = await tete(page);
  await page.getByTestId('combo-boom').dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, isPrimary: true });
  await page.getByTestId('lecture').click().catch(() => undefined);
  const r4 = await recetteSauvee(page, (r) => r.zooms.length === 1);
  const lecture = { tete: t4, zoom: r4.zooms[0] };
  await page.getByTestId('annuler').click();
  await recetteSauvee(page, (r) => r.zooms.length === 0);

  // 5. Rendu : Raté à 5,4 s (→ 5,05 : ralenti 0,5 sur [3,55 ; 5,05]) puis Figé à 7,7 s (→ 7,55 en source).
  await teteA(page, 5);
  await images(page, 12);
  await ouvrirCombos(page);
  await page.getByTestId('combo-rate').click();
  const r5 = await recetteSauvee(page, (r) => r.plans.some((p) => p.vit === 0.5));
  // Après le ralenti, 7,55 source = 7,55 + 1,5 (ralenti) en sortie ; on vise 9,2 s (→ 9,05 après recul).
  await teteA(page, 9);
  await images(page, 6);
  await ouvrirCombos(page);
  await page.getByTestId('combo-fige').click();
  const r6 = await recetteSauvee(page, (r) => r.plans.some((p) => p.fige));
  await page.getByTestId('panneau-fermer').click().catch(() => undefined);
  await allerAEtape(page, 5);
  const ex = await exporterEtTelecharger(page, testInfo, 'combos.mp4');
  const duree = dureeMp4(ex.chemin);
  const attendu = r6.plans.reduce((s, p) => s + (p.a - p.de) / (p.vit ?? 1) + (p.fige ?? 0), 0);
  const x = sonMono(ex.chemin);
  testInfo.annotations.push({
    type: 'combos',
    description: JSON.stringify({ PICS_BOITE, boom, annulerBoom, boomLibre, fige, annulerFige, lecture, rate: r5.plans, final: { plans: r6.plans, sons: r6.sons }, duree, attendu }),
  });
  // Arrêt du Figé : t de sortie du plan figé.
  let t0 = 0;
  let arret = null;
  for (const p of r6.plans) {
    const d = (p.a - p.de) / (p.vit ?? 1);
    if (p.fige) arret = [t0 + d, t0 + d + p.fige];
    t0 += d + (p.fige ?? 0);
  }
  const ecartArret = arret ? ecartImages(ex.chemin, arret[0] + 0.1, arret[1] - 0.1) : null;
  testInfo.annotations.push({ type: 'rendu', description: JSON.stringify({ arret, ecartArret, creteArret: arret ? crete(x, arret[0] + 0.05, arret[1] - 0.05) : null }) });

  expect(journal.erreurs).toEqual([]);
  expect.soft(Math.abs(boom.zoom.ts - 5.05), `Boom aimanté : ts ${boom.zoom.ts}`).toBeLessThan(0.08);
  expect.soft(boom.son.id).toBe('impact.meme');
  expect.soft(annulerBoom).toEqual({ zooms: 0, sons: 0 });
  expect.soft(Math.abs(boomLibre.zoom.ts - (boomLibre.tete - 0.15)), `Boom libre : ts ${boomLibre.zoom.ts}`).toBeLessThan(0.03);
  expect.soft(Math.abs(fige.plans[0].a - 7.55), `Figé aimanté : coupe à ${fige.plans[0].a}`).toBeLessThan(0.08);
  expect.soft(fige.plans[0].fige).toBe(1);
  expect.soft(annulerFige).toEqual({ plans: 1, sons: 0, fige: null });
  expect.soft(Math.abs(duree - attendu), `durée ${duree} / ${attendu}`).toBeLessThan(0.07);
  if (ecartArret !== null) expect.soft(ecartArret, 'image figée du combo').toBeLessThan(0.5);
});
