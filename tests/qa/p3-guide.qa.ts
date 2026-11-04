// @ts-nocheck
// (p3-d) Son guide (dans Couper) : joué dans l'aperçu (blocs mixés écoutés), absent du MP4, temps forts affichés,
// aimant au rythme sur Scinder, rappel « démarre-le à » après l'export ; reprise après rechargement
// (son guide + son importé reviennent sans les re-choisir) ; son manquant → message et retiré.
import { expect, test } from '@playwright/test';
test.use({ actionTimeout: 20_000 });
import { allerAEtape, CAPTURES, exporterEtTelecharger, projetSauve, surveiller, teteA } from './outils';
import { fermerPanneau } from './p2-outils';
import { BIP_WAV, crete, demarrer, effets, GUIDE_WAV, MIRE, noter, regler, sonMono, verifierAnnulerRetablir } from './p3-outils';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test('(p3-d) son guide : aperçu, pas dans le MP4, temps forts, aimant, rappel, reprise', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const journal = surveiller(page);
  // Écoute des blocs mixés par l'aperçu : RMS de chaque AudioBuffer joué.
  await page.addInitScript(() => {
    (window as any).__blocs = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a: any[]) {
      const b = this.buffer;
      if (b && b.length > 2000) {
        const c = b.getChannelData(0);
        let s = 0;
        for (let i = 0; i < c.length; i++) s += c[i] * c[i];
        (window as any).__blocs.push({ n: b.length, rms: Math.sqrt(s / c.length) });
      }
      return start.apply(this, a);
    };
  });
  await demarrer(page, MIRE, 2);
  const etats = [effets((await projetSauve(page))?.recette)];
  await page.getByTestId('son-guide-bouton-fichier').setInputFiles(GUIDE_WAV);
  await expect(page.getByTestId('bandeau-guide')).toBeVisible({ timeout: 20_000 });
  await noter(page, etats);
  await expect.poll(async () => page.getByTestId('temps-fort').count(), { timeout: 20_000 }).toBeGreaterThan(5);
  const nTf = await page.getByTestId('temps-fort').count();
  const bandeau = await page.getByTestId('bandeau-guide').textContent();
  await page.screenshot({ path: CAPTURES + 'p3-d-couper-guide.png', fullPage: true });

  // Aperçu : lecture 2 s → blocs avec du son (la vidéo est muette : c'est le guide).
  await page.evaluate(() => ((window as any).__blocs = []));
  await page.getByTestId('lecture').click();
  await page.waitForTimeout(2500);
  await page.getByTestId('lecture').click();
  const blocs = await page.evaluate(() => (window as any).__blocs);
  const blocsSonores = blocs.filter((b) => b.rms > 0.01).length;

  // Aimant : tête à 3 s + 5 images (3,167 s) → temps fort à 3,25 s (0,25 + 0,5 k).
  await page.getByTestId('cale-rythme').check();
  await teteA(page, 3);
  const tete = page.getByTestId('tete-lecture');
  for (let k = 0; k < 5; k++) await tete.press('ArrowRight');
  await page.getByTestId('scinder').click();
  await expect.poll(async () => (await projetSauve(page)).recette.plans.length, { timeout: 8000 }).toBe(2);
  const coupe = (await projetSauve(page)).recette.plans[0].a;
  etats.push(effets((await projetSauve(page))?.recette));

  // Début du son à 12 s → rappel « 0:12 ».
  await regler(page, 'debut-guide', 12);
  await noter(page, etats);
  await regler(page, 'volume-guide', 100);
  await noter(page, etats);
  const ar = await verifierAnnulerRetablir(page, etats);

  // Un son importé dans Habiller (pour la reprise).
  await allerAEtape(page, 4);
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('importer-son-fichier').setInputFiles(BIP_WAV);
  await expect(page.getByTestId('famille-mes')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
  const idImporte = await page.locator('[data-testid^="son-ajouter-a"]').first().getAttribute('data-testid');
  await teteA(page, 1);
  await page.locator('[data-testid^="son-ajouter-a"]').first().click();
  await expect.poll(async () => (await projetSauve(page))?.recette?.sons?.length, { timeout: 8000 }).toBe(1);
  await fermerPanneau(page);

  await allerAEtape(page, 5);
  const ex = await exporterEtTelecharger(page, testInfo, 'guide.mp4');
  const rappel = await page.getByTestId('rappel-guide').textContent();
  const x = sonMono(ex.chemin);
  const sonMp4 = { avant: crete(x, 0, 0.95), bip: crete(x, 1, 1.4), apres: crete(x, 1.6, 9.9) };
  await page.screenshot({ path: CAPTURES + 'p3-d-rappel.png', fullPage: true });

  // Reprise : rechargement, on re-choisit SEULEMENT la vidéo.
  const avant = (await projetSauve(page)).recette;
  await page.reload();
  await expect(page.getByTestId('montage-0')).toBeVisible();
  const [sel] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await sel.setFiles(MIRE);
  await page.waitForTimeout(3000);
  const etapeReprise = await page.getByTestId('etape').textContent();
  const apres = (await projetSauve(page)).recette;
  const toastReprise = (await page.getByTestId('toast').allTextContents()).join(' | ');
  for (let k = 0; k < 4 && !((await page.getByTestId('etape').textContent()) ?? '').includes('Étape 2'); k++) {
    await page.getByTestId('panneau-fermer').click({ timeout: 1000 }).catch(() => undefined);
    await page.getByTestId('retour').click();
  }
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  const guideRevenu = await page.getByTestId('bandeau-guide').isVisible();

  // Son manquant : on vide le magasin des sons, puis on recharge.
  await page.evaluate(() => new Promise((ok) => { const r = indexedDB.deleteDatabase('arko-sons'); r.onsuccess = r.onerror = r.onblocked = ok; }));
  await page.reload();
  await expect(page.getByTestId('montage-0')).toBeVisible();
  const [sel2] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await sel2.setFiles(MIRE);
  await expect(page.getByTestId('toast')).toContainText("n'a pas été retrouvé", { timeout: 15_000 });
  const toastManquant = (await page.getByTestId('toast').allTextContents()).join(' | ');
  await page.waitForTimeout(1500);
  const sansSons = (await projetSauve(page)).recette;

  const res = {
    nTf, bandeau, blocs: blocs.length, blocsSonores, coupe, rappel, sonMp4, ar,
    reprise: { etapeReprise, guideAvant: avant.guide, guideApres: apres.guide, sonsApres: apres.sons, toastReprise, guideRevenu },
    manquant: { toastManquant, sons: sansSons.sons, guide: sansSons.guide, sources: sansSons.sources.map((s) => s.id) },
    idImporte,
  };
  testInfo.annotations.push({ type: 'guide', description: JSON.stringify(res) });
  expect(nTf).toBeGreaterThanOrEqual(15);
  expect(blocsSonores).toBeGreaterThan(3);
  expect(Math.abs(coupe - 3.25)).toBeLessThan(0.04);
  expect(rappel).toContain('0:12');
  expect(sonMp4.avant).toBeLessThan(0.005);
  expect(sonMp4.apres).toBeLessThan(0.005);
  expect(sonMp4.bip).toBeGreaterThan(0.3);
  expect(apres.guide?.debut).toBe(12);
  expect(apres.sons.length).toBe(1);
  expect(guideRevenu).toBe(true);
  expect(sansSons.sons.length).toBe(0);
  expect(sansSons.guide).toBeNull();
  expect(ar.erreurs).toEqual([]);
  testInfo.annotations.push({ type: 'console', description: JSON.stringify(journal.erreurs.slice(0, 5)) });
});
