// (f) Source longue : 2 h, 320×180, 5 i/s, son mono 44,1 kHz (219 Mo).
// Mesures : ouverture, accès à 1 h 30 dans Couper, export d'un plan de 10 s pris à 1 h 30.
// Note : l'interface ne permet pas de naviguer dans la source hors des plans (frise = vidéo finale) ;
// pour atteindre 1 h 30, on passe par la reprise d'un projet sauvegardé dont le plan est [5400 ; 5410].
import { expect, test, type Page } from '@playwright/test';
import { allerAEtape, analyserMp4, CAPTURES, exporterEtTelecharger, FIX, importer, pixel, projetSauve, repartirDeZero, surveiller, cleCourante } from './outils';

const LONGUE = FIX + 'long-2h-320x180.mp4';

async function memoire(page: Page) {
  return page.evaluate(() => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? Math.round(m.usedJSHeapSize / 1e6) : null;
  });
}

/** Attend que le centre de l'aperçu ne soit plus noir ; renvoie le délai en ms. */
async function attendreImage(page: Page, depuis: number) {
  // Contournement du bug « aperçu noir après import » : un pas d'image force le dessin.
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('ArrowRight');
  await tete.press('ArrowLeft');
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas');
          const p = c?.getContext('2d')?.getImageData(270, 480, 1, 1).data;
          return p ? p[0]! + p[1]! + p[2]! : 0;
        }),
      { timeout: 30_000, intervals: [50] },
    )
    .toBeGreaterThan(30);
  return Date.now() - depuis;
}

test('(f) vidéo de 2 h : ouverture, 1 h 30, export de 10 s', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  const mesures: Record<string, unknown> = {};
  await repartirDeZero(page);
  mesures.memoireDepart = await memoire(page);

  // 1. Ouverture.
  mesures.ouvertureMs = await importer(page, LONGUE, 120_000);
  mesures.dureeAffichee = await page.getByTestId('duree-finale').textContent();
  mesures.premiereImageMs = await attendreImage(page, Date.now());
  mesures.memoireApresOuverture = await memoire(page);

  // Combien de temps source la poignée de fin permet-elle d'atteindre en un geste pleine largeur ?
  await page.getByTestId('zoom-moins').click();
  const plan = page.getByTestId('plan-0');
  await expect(plan).toBeVisible();

  // 2. Sauvegarde d'un projet dont le plan est à 1 h 30, puis reprise.
  await page.waitForTimeout(1500);
  const sauve = await projetSauve(page);
  sauve.recette.plans = [{ de: 5400, a: 5410 }];
  sauve.etape = 'couper';
  const cle = await cleCourante(page);
  await page.evaluate(
    ({ p, cle }) =>
      new Promise<void>((ok, ko) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const tx = req.result.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(p, cle);
          tx.oncomplete = () => ok();
          tx.onerror = () => ko(tx.error);
        };
      }),
    { p: sauve, cle },
  );
  await page.reload();
  await expect(page.getByTestId('montage-0')).toBeVisible(); // phase 4 : Mes montages
  await page.getByTestId('montage-ouvrir-0').click(); // passe en mode reprise
  const t0 = Date.now();
  await page.getByTestId('fichier').setInputFiles(LONGUE);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 120_000 });
  mesures.repriseMs = Date.now() - t0;
  mesures.image1h30Ms = await attendreImage(page, t0);
  await expect(page.getByTestId('duree-finale')).toContainText('10');

  // Saut dans le plan (fin → début) : temps jusqu'à la nouvelle image.
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  const t1 = Date.now();
  await tete.press('End');
  await tete.press('Home');
  await tete.press('PageUp');
  await tete.press('PageUp');
  await tete.press('PageUp');
  await tete.press('PageUp');
  await tete.press('PageUp');
  mesures.sautsClavierMs = Date.now() - t1;
  await page.screenshot({ path: CAPTURES + 'f-couper-1h30.png' });

  // Lecture 2 s.
  await page.getByTestId('lecture').click();
  await page.waitForTimeout(2000);
  await page.getByTestId('lecture').click();
  mesures.tempsApresLecture2s = await tete.getAttribute('aria-valuenow');
  mesures.memoireApresLecture = await memoire(page);

  // 3. Export.
  await allerAEtape(page, 5);
  const { chemin, ms } = await exporterEtTelecharger(page, testInfo, 'longue-1h30.mp4', 300_000);
  mesures.exportMs = ms;
  const info = await analyserMp4(chemin);
  mesures.export = info;
  mesures.pixelCentreExport = pixel(chemin, 5, Math.round(info.l / 2), 960);
  mesures.memoireApresExport = await memoire(page);
  testInfo.annotations.push({ type: 'mesures', description: JSON.stringify(mesures) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
  expect(Math.abs(info.duree - 10)).toBeLessThanOrEqual(0.05);
  expect(info.audio).toBe(true);
});
