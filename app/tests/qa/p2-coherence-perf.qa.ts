// (p2-j) Cohérence aperçu / export sur une image avec accroche, texte et sous-titres (PSNR de la luminance,
// image entière et zones des calques). (p2-k) Performance : export de 10 s avec textes et sous-titres, comparé à sans.
import { expect, test } from '@playwright/test';
import { allerAEtape, CAPTURES, exporterEtTelecharger, surveiller, teteA, VIDEO_TEST } from './outils';
import { ajouterTexte, allerAHabiller, apercuRgba, apercuStable, capturerImage, CHARGE, fermerPanneau, grisReduit, imageRgb, injecter, psnr } from './p2-outils';

const MOTS = 'salut tout le monde on lance une partie classée et on va gagner ce match ensemble ce soir avec les potes gg à tous et à demain pour la suite du live'
  .split(' ')
  .map((w, k) => [w, Math.round((0.1 + k * 0.33) * 100) / 100, Math.round((0.1 + k * 0.33 + 0.28) * 100) / 100]);

test('(p2-j) cohérence aperçu / export avec textes et sous-titres', async ({ page }, testInfo) => {
  const journal = surveiller(page);
  await allerAHabiller(page, VIDEO_TEST);
  await page.getByTestId('outil-accroche').click();
  await page.getByTestId('suggestion-0').click();
  await fermerPanneau(page);
  await teteA(page, 1);
  await ajouterTexte(page, 'GG les gars', 'bulle');
  await fermerPanneau(page);
  await injecter(page, VIDEO_TEST, { sousTitres: { style: 'karaoke', mots: MOTS } });
  await teteA(page, 2);
  await apercuStable(page);
  const apercu = await apercuRgba(page);
  await page.screenshot({ path: CAPTURES + 'p2-j-apercu-2s.png' });
  await allerAEtape(page, 5);
  const { chemin } = await exporterEtTelecharger(page, testInfo, 'coherence.mp4');
  const exp = imageRgb(chemin, 0, 60);
  capturerImage(chemin, 0, 'p2-j-export-2s', 60);
  const a = grisReduit(apercu);
  const b = grisReduit(exp);
  const L = 270;
  const H = 480;
  const zone = (y0: number, y1: number) => (k: number) => {
    const y = Math.floor(k / L) / H;
    return y >= y0 && y < y1;
  };
  const res = {
    image: psnr(a, b),
    accrocheEtTexte: psnr(a, b, zone(0.1, 0.32)),
    sousTitres: psnr(a, b, zone(0.55, 0.8)),
  };
  testInfo.annotations.push({ type: 'PSNR luminance (dB) aperçu 540×960 / export 1080×1920 réduits à 270×480', description: JSON.stringify(res) });
  expect(res.image).toBeGreaterThan(30);
  expect.soft(res.accrocheEtTexte).toBeGreaterThan(28);
  expect.soft(res.sousTitres).toBeGreaterThan(28);
  testInfo.annotations.push({ type: 'erreurs console', description: JSON.stringify(journal.erreurs) });
});

test('(p2-k) performance : export de 10 s avec et sans textes et sous-titres', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  surveiller(page);
  await allerAHabiller(page, CHARGE);
  await allerAEtape(page, 5);
  const sans1 = await exporterEtTelecharger(page, testInfo, 'perf-sans-1.mp4');
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('outil-accroche').click();
  await page.getByTestId('suggestion-2').click();
  await fermerPanneau(page);
  for (const [t, s] of [[3, 'citron'], [6, 'alerte']] as const) {
    await teteA(page, t);
    await ajouterTexte(page, 'Texte de mesure ' + s, s);
    await page.getByTestId('jusqu-a-la-fin').click();
    await fermerPanneau(page);
  }
  await injecter(page, CHARGE, { sousTitres: { style: 'karaoke', mots: MOTS } });
  await allerAEtape(page, 5);
  const avec = await exporterEtTelecharger(page, testInfo, 'perf-avec.mp4');
  await page.getByTestId('retour').click();
  await page.getByTestId('outil-sousTitres').click();
  await page.getByTestId('style-sous-titres-pop').click();
  await fermerPanneau(page);
  await allerAEtape(page, 5);
  const avecPop = await exporterEtTelecharger(page, testInfo, 'perf-avec-pop.mp4');
  const res = { sansMs: sans1.ms, avecKaraokeMs: avec.ms, avecPopMs: avecPop.ms, surcout: `${Math.round((avec.ms / sans1.ms - 1) * 100)} %` };
  testInfo.annotations.push({ type: 'export 10 s 1080p (mire testsrc2)', description: JSON.stringify(res) });
  expect(avec.ms).toBeLessThan(sans1.ms * 1.6);
});
