// @ts-nocheck
// (p3-e) Import de son : WAV (1 s), MP3 (4 s), son d'une vidéo (7 s) → présents dans le MP4, au bon moment, à la bonne hauteur.
// (p3-f) Micro (faux périphérique de Chrome) : enregistrement importé, pistes du micro arrêtées, son dans le MP4.
// (p3-g) Performance : 10 s en 1080p avec 4 transitions, 2 zooms et 5 sons, comparé à sans effets.
import { expect, test } from '@playwright/test';
test.use({ actionTimeout: 20_000 });
import { allerAEtape, CAPTURES, exporterEtTelecharger, projetSauve, surveiller, teteA } from './outils';
import { fermerPanneau } from './p2-outils';
import { attaquesAudio, BIP_MP3, BIP_WAV, crete, demarrer, frequence, MIRE, scinderA, SON_VIDEO, sonMono } from './p3-outils';

test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } });

async function importerEtPoser(page, fichier: string, t: number) {
  const avant = await page.locator('[data-testid^="son-ajouter-a"]').count();
  await page.getByTestId('importer-son-fichier').setInputFiles(fichier);
  await expect.poll(() => page.locator('[data-testid^="son-ajouter-a"]').count(), { timeout: 20_000 }).toBe(avant + 1);
  await teteA(page, t);
  await page.locator('[data-testid^="son-ajouter-a"]').nth(avant).click();
}

test('(p3-e) import de son : WAV, MP3, son d\'une vidéo', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const journal = surveiller(page);
  await demarrer(page, MIRE, 4);
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('famille-mes').click(); // import sous « Importés »
  await importerEtPoser(page, BIP_WAV, 1);
  await importerEtPoser(page, BIP_MP3, 4);
  await importerEtPoser(page, SON_VIDEO, 7);
  await expect.poll(async () => (await projetSauve(page))?.recette?.sons?.length, { timeout: 8000 }).toBe(3);
  const r = (await projetSauve(page)).recette;
  await page.screenshot({ path: CAPTURES + 'p3-e-mes-sons.png' });
  await fermerPanneau(page);
  await allerAEtape(page, 5);
  const ex = await exporterEtTelecharger(page, testInfo, 'import.mp4');
  const x = sonMono(ex.chemin);
  const att = attaquesAudio(x);
  const res = {
    sons: r.sons, sources: r.sources.map((s) => ({ id: s.id, type: s.type, nom: s.nom, duree: s.duree })),
    att, f: [frequence(x, 1.05, 1.35), frequence(x, 4.1, 4.35), frequence(x, 7.05, 7.25)].map(Math.round),
    c: [crete(x, 1, 1.4), crete(x, 4, 4.4), crete(x, 7, 7.3)].map((v) => +v.toFixed(3)),
  };
  testInfo.annotations.push({ type: 'import', description: JSON.stringify(res) });
  expect(att.length).toBe(3);
  // MP3 : le décodeur ajoute un délai de 1105 échantillons (≈ 25 ms) : on tolère ±30 ms comme pour les autres.
  [1, 4, 7].forEach((t, k) => expect(Math.abs(att[k] - t)).toBeLessThan(0.03));
  expect(Math.abs(res.f[0] - 440)).toBeLessThan(15);
  expect(Math.abs(res.f[1] - 440)).toBeLessThan(15);
  expect(Math.abs(res.f[2] - 2000)).toBeLessThan(40);
  testInfo.annotations.push({ type: 'console', description: JSON.stringify(journal.erreurs.slice(0, 5)) });
});

test('(p3-f) micro : enregistrement, pistes arrêtées, son dans le MP4', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const journal = surveiller(page);
  await page.addInitScript(() => {
    (window as any).__pistes = [];
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const f = await gum(c);
      (window as any).__pistes.push(...f.getTracks());
      return f;
    };
  });
  await demarrer(page, MIRE, 4);
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('famille-mes').click(); // micro sous « Importés »
  await page.getByTestId('micro').click();
  await expect(page.getByTestId('micro-stop')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2200);
  const pendant = await page.evaluate(() => (window as any).__pistes.map((t) => t.readyState));
  const duree = await page.getByTestId('micro-duree').textContent();
  await page.getByTestId('micro-stop').click();
  await expect.poll(() => page.locator('[data-testid^="son-ajouter-a"]').count(), { timeout: 20_000 }).toBe(1);
  const apres = await page.evaluate(() => (window as any).__pistes.map((t) => t.readyState));
  const nom = await page.locator('.son-nom').first().textContent();
  await teteA(page, 2);
  await page.locator('[data-testid^="son-ajouter-a"]').first().click();
  await expect.poll(async () => (await projetSauve(page))?.recette?.sons?.length, { timeout: 8000 }).toBe(1);
  const src = (await projetSauve(page)).recette.sources.find((s) => s.type === 'audio');

  // Fermer le panneau PENDANT un enregistrement : le micro doit être coupé et rien importé.
  await page.getByTestId('micro').click();
  await expect(page.getByTestId('micro-stop')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);
  await fermerPanneau(page);
  await page.waitForTimeout(800);
  const apresFermeture = await page.evaluate(() => (window as any).__pistes.map((t) => t.readyState));

  await allerAEtape(page, 5);
  const ex = await exporterEtTelecharger(page, testInfo, 'micro.mp4');
  const x = sonMono(ex.chemin);
  const res = { pendant, apres, apresFermeture, duree, nom, src, crete: [crete(x, 0, 1.9), crete(x, 2, 4.2)].map((v) => +v.toFixed(3)), f: Math.round(frequence(x, 2.3, 3.5)) };
  testInfo.annotations.push({ type: 'micro', description: JSON.stringify(res) });
  expect(pendant).toContain('live');
  expect(apres.every((s) => s === 'ended')).toBe(true);
  expect(apresFermeture.every((s) => s === 'ended')).toBe(true);
  expect(res.crete[1]).toBeGreaterThan(0.02);
  testInfo.annotations.push({ type: 'console', description: JSON.stringify(journal.erreurs.slice(0, 5)) });
});

test('(p3-g) performance : 4 transitions, 2 zooms, 5 sons', async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  await demarrer(page, MIRE, 2);
  await scinderA(page, [2, 4, 6, 8]);
  await allerAEtape(page, 5);
  const sans = await exporterEtTelecharger(page, testInfo, 'perf-sans.mp4');
  testInfo.annotations.push({ type: 'perf sans effets (ms)', description: String(sans.ms) });
  await page.getByTestId('retour').click();
  await page.getByTestId('outil-transitions').click();
  const types = ['flash', 'glisse', 'glitch', 'zoom'];
  for (let k = 1; k <= 4; k++) {
    await page.getByTestId(`coupe-${k}`).click();
    await page.getByTestId(`transition-${types[k - 1]}`).click();
  }
  await fermerPanneau(page);
  await page.getByTestId('outil-zoom').click();
  for (const t of [1, 5]) {
    await page.getByTestId('nouveau-zoom').click().catch(() => undefined);
    await teteA(page, t);
    await page.getByTestId('ajouter-zoom').click();
  }
  await fermerPanneau(page);
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('famille-impact').click();
  for (const [t, id] of [[0, 'impact.boom'], [3, 'impact.claque'], [5, 'impact.meme'], [7, 'impact.bass-drop'], [9, 'impact.boom']] as const) {
    await teteA(page, t);
    await page.getByTestId(`son-ajouter-${id}`).click();
  }
  await expect.poll(async () => {
    const r = (await projetSauve(page)).recette;
    return [r.sons.length, r.zooms.length, r.plans.filter((p) => p.trans).length].join(',');
  }, { timeout: 8000 }).toBe('5,2,4');
  await fermerPanneau(page);
  await allerAEtape(page, 5);
  const avec = await exporterEtTelecharger(page, testInfo, 'perf-avec.mp4');
  const res = { sansMs: sans.ms, avecMs: avec.ms, surcout: +((avec.ms / sans.ms - 1) * 100).toFixed(1) };
  testInfo.annotations.push({ type: 'perf', description: JSON.stringify(res) });
  const x = sonMono(avec.chemin);
  testInfo.annotations.push({ type: 'crête du mix', description: String(crete(x, 0, 10)) });
  expect(res.surcout).toBeLessThan(50);
});
