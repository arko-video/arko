// (n) Divers : vidéo de téléphone tournée de 90° (métadonnée de rotation), pas d'image au clavier,
// « Oublier ce projet », « Monter un autre clip ».
import { expect, test } from '@playwright/test';
import { allerAEtape, analyserMp4, exporterEtTelecharger, FIX, importer, projetSauve, repartirDeZero, VIDEO_TEST } from './outils';

test('(n1) vidéo tournée de 90° : traitée comme verticale', async ({ page }, testInfo) => {
  await repartirDeZero(page);
  await importer(page, FIX + 'rotation90-1920x1080.mp4');
  await page.waitForTimeout(1200);
  const sauve = await projetSauve(page);
  await page.getByTestId('suivant').click();
  const etape = await page.getByTestId('etape').textContent();
  testInfo.annotations.push({ type: 'rotation 90', description: JSON.stringify({ source: sauve?.recette?.sources?.[0], etapeApresSuivant: etape }) });
  await allerAEtape(page, 5);
  const { chemin } = await exporterEtTelecharger(page, testInfo, 'rotation.mp4');
  testInfo.annotations.push({ type: 'export rotation', description: JSON.stringify(await analyserMp4(chemin)) });
});

test('(n2) ±1 image : 30 appuis sur « +1 image » = 1 s ?', async ({ page }, testInfo) => {
  await repartirDeZero(page);
  await importer(page, VIDEO_TEST);
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  const valeurs: string[] = [];
  for (let k = 0; k < 30; k++) {
    await page.getByTestId('image-plus').click();
    valeurs.push(String(await tete.getAttribute('aria-valuenow')));
  }
  testInfo.annotations.push({ type: 'positions après chaque +1 image', description: valeurs.join(' ') });
  expect.soft(valeurs.at(-1)).toBe('1');
});

test('(n3) Oublier ce projet / Monter un autre clip', async ({ page }, testInfo) => {
  await repartirDeZero(page);
  await importer(page, VIDEO_TEST);
  await page.waitForTimeout(1300);
  await page.reload();
  // Phase 4 : « Oublier ce projet » devient Supprimer dans le menu de Mes montages.
  await page.getByTestId('montage-menu-0').click();
  await page.getByTestId('action-supprimer').click();
  await page.getByTestId('dialogue-confirmer').click();
  await expect(page.getByTestId('mes-montages')).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(500);
  const encore = await page.getByTestId('mes-montages').count();
  testInfo.annotations.push({ type: 'oublier', description: `carte après rechargement : ${encore}` });
  expect(encore).toBe(0);
});
