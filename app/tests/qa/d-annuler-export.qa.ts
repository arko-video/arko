// (d) Annuler un export en cours puis relancer ; variante : relancer immédiatement (< 1 s) après l'annulation.
import { expect, test, type Page } from '@playwright/test';
import { allerAEtape, analyserMp4, CAPTURES, exporterEtTelecharger, FIX, importer, repartirDeZero, surveiller } from './outils';

async function fichiersOpfs(page: Page): Promise<{ nom: string; taille: number }[]> {
  return page.evaluate(async () => {
    const res: { nom: string; taille: number }[] = [];
    try {
      const racine = await navigator.storage.getDirectory();
      const d = await racine.getDirectoryHandle('exports');
      for await (const [nom, h] of (d as any).entries()) {
        const f = await (h as FileSystemFileHandle).getFile();
        res.push({ nom, taille: f.size });
      }
    } catch {
      /* pas de dossier */
    }
    return res;
  });
}

async function allerExporter(page: Page) {
  await allerAEtape(page, 5);
}

async function attendreProgression(page: Page, minPc: number) {
  await expect
    .poll(async () => Number((await page.getByTestId('progression').getAttribute('aria-valuenow')) ?? 0), { timeout: 120_000 })
    .toBeGreaterThanOrEqual(minPc);
}

test('(d) annuler l’export à mi-chemin puis relancer', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, FIX + 'long12-1920x1080.mp4');
  await allerExporter(page);

  // Résumé avant export.
  const resume = await page.getByTestId('resume-export').textContent();
  testInfo.annotations.push({ type: 'résumé avant export', description: String(resume) });

  // Double clic sur Créer la vidéo : un seul export.
  await page.getByTestId('creer-video').click();
  await attendreProgression(page, 30);
  await page.screenshot({ path: CAPTURES + 'd-export-en-cours.png' });
  const reste = await page.locator('.exporter p.doux').first().textContent();
  testInfo.annotations.push({ type: 'pendant export', description: String(reste) });

  // Le bouton Retour est désactivé et le retour navigateur est bloqué.
  await expect(page.getByTestId('retour')).toBeDisabled();
  await page.goBack();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  await expect(page.getByTestId('toast')).toContainText('Annuler');

  await page.getByTestId('annuler-export').click();
  await expect(page.getByTestId('erreur-export')).toContainText('Export annulé, ton montage est gardé.');
  await page.screenshot({ path: CAPTURES + 'd-export-annule.png' });
  await page.waitForTimeout(3500);
  const apresAnnulation = await fichiersOpfs(page);
  testInfo.annotations.push({ type: 'OPFS après annulation (+3,5 s)', description: JSON.stringify(apresAnnulation) });

  // Relance : bouton « Créer la vidéo » (retour à l'écran avant), puis export complet.
  await page.getByTestId('reessayer').click();
  const { chemin, ms } = await exporterEtTelecharger(page, testInfo, 'apres-annulation.mp4');
  const info = await analyserMp4(chemin);
  testInfo.annotations.push({ type: 'export après annulation', description: JSON.stringify({ ms, ...info }) });
  expect(Math.abs(info.duree - 12)).toBeLessThanOrEqual(0.05);
  expect(info.audio).toBe(true);
  testInfo.annotations.push({ type: 'OPFS après export', description: JSON.stringify(await fichiersOpfs(page)) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});

test('(d2) annuler puis relancer tout de suite (même seconde)', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await importer(page, FIX + 'long12-1920x1080.mp4');
  await allerExporter(page);
  await page.getByTestId('creer-video').click();
  await attendreProgression(page, 10);
  await page.getByTestId('annuler-export').click();
  await page.getByTestId('reessayer').click();
  const { chemin, ms } = await exporterEtTelecharger(page, testInfo, 'relance-immediate.mp4');
  const info = await analyserMp4(chemin);
  testInfo.annotations.push({ type: 'relance immédiate', description: JSON.stringify({ ms, ...info }) });
  expect(Math.abs(info.duree - 12)).toBeLessThanOrEqual(0.05);
  await page.waitForTimeout(3500);
  testInfo.annotations.push({ type: 'OPFS', description: JSON.stringify(await fichiersOpfs(page)) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});

test('(d3) onglet caché pendant l’export (visibilitychange)', async ({ page }, testInfo) => {
  surveiller(page);
  await repartirDeZero(page);
  await importer(page, FIX + 'long12-1920x1080.mp4');
  await allerExporter(page);
  await page.getByTestId('creer-video').click();
  await attendreProgression(page, 5);
  // Simule un passage en arrière-plan : la page doit continuer, puis finir normalement.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 300_000 });
  testInfo.annotations.push({ type: 'onglet caché', description: 'export terminé normalement' });
});
