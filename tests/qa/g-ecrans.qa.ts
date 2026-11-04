// (g) Captures 360 × 740 de chaque étape + audit : défilement horizontal, cibles < 44 px, boutons sans nom.
import { expect, test, type Page } from '@playwright/test';
import { auditEcran, CAPTURES, importer, repartirDeZero, surveiller, teteA, VIDEO_TEST } from './outils';

const audits: Record<string, unknown> = {};
async function capturer(page: Page, nom: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${CAPTURES}g-${nom}.png` });
  await page.screenshot({ path: `${CAPTURES}g-${nom}-pleine.png`, fullPage: true });
  audits[nom] = await auditEcran(page);
}

test('(g) écrans à 360 × 740', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await repartirDeZero(page);
  await capturer(page, '1-importer');

  await importer(page, VIDEO_TEST);
  await page.waitForTimeout(1200);
  await capturer(page, '2-couper');
  await teteA(page, 2);
  await page.getByTestId('scinder').click();
  await page.getByTestId('plan-1').click();
  await capturer(page, '2b-couper-selection');

  await page.getByTestId('suivant').click();
  await capturer(page, '3-vertical-flou');
  await page.getByTestId('mise-recadre').click();
  await page.getByTestId('zone-sure-interrupteur').check();
  await capturer(page, '3b-vertical-recadre-zone-sure');
  await page.getByTestId('zone-sure-interrupteur').uncheck();

  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await capturer(page, '3c-habiller');
  await page.getByTestId('suivant').click();
  await capturer(page, '4-exporter-avant');
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('progression')).toBeVisible();
  await capturer(page, '4b-exporter-pendant');
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 150_000 });
  await capturer(page, '4c-exporter-apres');

  // Retour à l'import pendant la session → carte « Continuer ».
  for (let k = 0; k < 4; k++) await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await capturer(page, '5-importer-continuer');

  // Rechargement → carte « Reprendre ».
  await page.reload();
  await expect(page.getByTestId('mes-montages')).toBeVisible(); // phase 4
  await capturer(page, '6-importer-reprise');

  // Petit écran 320 px (vieux Android).
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByTestId('fichier').setInputFiles(VIDEO_TEST).catch(() => undefined);
  await page.waitForTimeout(2500);
  await capturer(page, '7-320px');

  testInfo.annotations.push({ type: 'audits', description: JSON.stringify(audits) });
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
  for (const [nom, a] of Object.entries(audits)) {
    expect.soft((a as { defilementHorizontal: boolean }).defilementHorizontal, `défilement horizontal sur ${nom}`).toBe(false);
  }
});
