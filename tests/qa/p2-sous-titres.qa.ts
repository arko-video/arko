// (p2-e) Sous-titres de bout en bout PAR L'INTERFACE, avec le vrai modèle Whisper servi depuis tests/fixtures/modeles/
// (page.route remplace huggingface.co), sur tests/fixtures/parole-fr.mp4 :
// accord → téléchargement + progression → Annuler → relancer → liste → corriger partout → mot en valeur → export.
// (p2-f) Puis une coupe dans Couper : les sous-titres suivent (mots coupés retirés, temps décalés).
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allerAEtape, CAPTURES, exporterEtTelecharger, repartirDeZero, importer, surveiller, teteA } from './outils';
import { capturerImage, energie, imageRgb, MODELES, PAROLE, servirModele, surveillerCsp } from './p2-outils';

const ATTENDU = JSON.parse(readFileSync('tests/fixtures/parole-fr.json', 'utf-8')) as { mots: { txt: string; ts: number; fin: number }[] };
const cle = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

test.describe.configure({ mode: 'serial' });

let contexte: BrowserContext;
let page: Page;
const reseau = { hf: [] as string[], cdn: [] as string[] };
const toutes: string[] = [];
let csp: string[] = [];
let journal: { erreurs: string[] };

test.beforeAll(async ({ browser }) => {
  test.skip(!existsSync(join(MODELES, 'onnx-community/whisper-base_timestamped/onnx')), 'Modèle absent de tests/fixtures/modeles/');
  contexte = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
    baseURL: 'http://localhost:4184/arko/',
  });
  contexte.on('request', (r) => toutes.push(r.url()));
  await servirModele(contexte, reseau);
  page = await contexte.newPage();
  csp = await surveillerCsp(page);
  journal = surveiller(page);
});

test.afterAll(async () => {
  await contexte?.close();
});

async function motsAffiches(): Promise<string[]> {
  return page.locator('[data-testid^="mot-"]').allTextContents();
}

/** Note chaque valeur de la barre de progression et chaque message d'étape (MutationObserver). */
async function suivreProgression() {
  await page.evaluate(() => {
    const w = window as any;
    w.__prog = [];
    w.__etapes = [];
    const obs = new MutationObserver(() => {
      const p = document.querySelector('[data-testid="sous-titres-progression"]');
      const e = document.querySelector('[data-testid="sous-titres-etape"]');
      if (p) {
        const v = Number(p.getAttribute('aria-valuenow'));
        if (w.__prog[w.__prog.length - 1] !== v) w.__prog.push(v);
      }
      if (e) {
        const t = (e.textContent ?? '').replace(/^\d+\s%\s*/, '');
        if (t && w.__etapes[w.__etapes.length - 1] !== t) w.__etapes.push(t);
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}

test('(p2-e) sous-titres de bout en bout par l\'interface', async ({}, testInfo) => {
  test.setTimeout(900_000);
  await repartirDeZero(page);
  await importer(page, PAROLE);
  await allerAEtape(page, 4);
  await page.getByTestId('outil-sousTitres').click();
  await page.getByTestId('creer-sous-titres').click();
  await expect(page.getByTestId('dialogue-module')).toContainText('environ 90 Mo, une seule fois');
  await page.screenshot({ path: CAPTURES + 'p2-e-accord.png' });
  expect(reseau.hf, 'aucun appel à huggingface.co avant l\'accord').toEqual([]);
  const workers0 = page.workers().length;

  // 1er essai : on accepte, puis on annule pendant l'écoute.
  await suivreProgression();
  const t0 = Date.now();
  await page.getByTestId('module-telecharger').click();
  await expect(page.getByTestId('sous-titres-progression')).toBeVisible();
  await expect(page.getByTestId('sous-titres-etape')).toContainText('J\'écoute ta vidéo', { timeout: 180_000 });
  const msAvantEcoute = Date.now() - t0;
  await page.screenshot({ path: CAPTURES + 'p2-e-progression.png' });
  await page.getByTestId('sous-titres-annuler').click();
  await expect(page.getByTestId('toast')).toContainText('Sous-titres annulés.');
  await expect(page.getByTestId('creer-sous-titres')).toBeVisible();
  await expect.poll(() => page.workers().length, { timeout: 5000 }).toBe(workers0);
  const essai1 = await page.evaluate(() => ({ prog: (window as any).__prog, etapes: (window as any).__etapes }));

  // 2e essai : le module est en cache, plus de dialogue ; transcription complète.
  await suivreProgression();
  const t1 = Date.now();
  await page.getByTestId('creer-sous-titres').click();
  await expect(page.getByTestId('dialogue-module')).toHaveCount(0);
  await expect(page.getByTestId('lignes-sous-titres')).toBeVisible({ timeout: 300_000 });
  const msTranscription = Date.now() - t1;
  const essai2 = await page.evaluate(() => ({ prog: (window as any).__prog, etapes: (window as any).__etapes }));
  await expect.poll(() => page.workers().length, { timeout: 5000 }).toBe(workers0);
  await page.screenshot({ path: CAPTURES + 'p2-e-liste.png' });

  const mots = await motsAffiches();
  const libres = mots.map(cle);
  let trouves = 0;
  for (const a of ATTENDU.mots) {
    const i = libres.indexOf(cle(a.txt));
    if (i >= 0) {
      libres.splice(i, 1);
      trouves++;
    }
  }
  const taux = trouves / ATTENDU.mots.length;
  const monotone = (p: number[]) => p.every((v, i) => i === 0 || v >= p[i - 1]!);
  testInfo.annotations.push({
    type: 'transcription',
    description: JSON.stringify({ msAvantEcoute, msTranscription, mots: mots.join(' '), taux, essai1, essai2, monotone1: monotone(essai1.prog), monotone2: monotone(essai2.prog) }),
  });
  expect(taux).toBeGreaterThanOrEqual(0.7);
  // Constat (bug I-2 du rapport) : noté sans faire échouer le test, pour ne pas sauter les tests suivants (mode série).
  if (!monotone(essai1.prog)) testInfo.annotations.push({ type: 'BUG progression', description: 'La barre revient de 100 % à 0 % entre le téléchargement et l\'écoute.' });
  testInfo.annotations.push({ type: 'requêtes huggingface', description: JSON.stringify(reseau.hf) });

  // Corriger partout : les deux « on » → « ON », mémorisé.
  const iOn = mots.findIndex((m) => cle(m) === 'on');
  expect(iOn).toBeGreaterThanOrEqual(0);
  const kOn = Number((await page.locator('[data-testid^="mot-"]').nth(iOn).getAttribute('data-testid'))!.slice(4));
  await page.getByTestId(`mot-${kOn}`).click();
  await page.getByTestId('champ-mot').fill('ON');
  await page.getByTestId('corriger-identiques').check(); // (après la QA p2 : « corriger partout » est devenu 2 choix)
  await page.getByTestId('mot-corriger').click();
  const apres = await motsAffiches();
  testInfo.annotations.push({ type: 'après « corriger partout »', description: apres.join(' ') });
  expect(apres.filter((m) => cle(m) === 'on' && !/ON/.test(m))).toEqual([]);
  expect(apres.filter((m) => /^ON\W*$/.test(m)).length).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => localStorage.getItem('arko.corrections'))).toContain('ON');

  // Mot en valeur : « gagner ».
  const iG = apres.findIndex((m) => cle(m).startsWith('gagn'));
  const kG = Number((await page.locator('[data-testid^="mot-"]').nth(Math.max(0, iG)).getAttribute('data-testid'))!.slice(4));
  await page.getByTestId(`mot-${kG}`).click();
  await page.getByTestId('mot-en-valeur').click();
  await expect(page.getByTestId('mot-en-valeur')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('mot-retour').click();
  await expect(page.getByTestId(`mot-${kG}`)).toHaveAttribute('data-fort', '1');
  await page.getByTestId('panneau-fermer').click();

  // Export : sous-titres visibles (bande des sous-titres non uniforme quand un mot est dit, uniforme dans un blanc).
  await allerAEtape(page, 5);
  const { chemin } = await exporterEtTelecharger(page, testInfo, 'sous-titres-ui.mp4');
  const t = 1.9;
  const img = imageRgb(chemin, t);
  capturerImage(chemin, t, 'p2-e-export-1-9s');
  capturerImage(chemin, 6.5, 'p2-e-export-6-5s');
  const sansMot = imageRgb(chemin, 0.2);
  const e = { avec: energie(img, 0.6, 0.76), sans: energie(sansMot, 0.6, 0.76) };
  testInfo.annotations.push({ type: 'énergie bande sous-titres', description: JSON.stringify(e) });
  expect(e.avec).toBeGreaterThan(e.sans * 1.5);
});

test('(p2-f) sous-titres et découpe : une coupe dans Couper, les sous-titres suivent', async ({}, testInfo) => {
  test.setTimeout(600_000);
  // Retour à Couper (Vertical est sautée : vidéo verticale).
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  // On retire [2 ; 4] s de la source : « aujourd'hui », « ON », « lance » disparaissent.
  await teteA(page, 2);
  await page.getByTestId('scinder').click();
  await teteA(page, 4);
  await page.getByTestId('scinder').click();
  await page.getByTestId('plan-1').click();
  await page.getByTestId('supprimer').click();
  await allerAEtape(page, 4);
  await page.getByTestId('outil-sousTitres').click();
  const mots = await motsAffiches();
  const lignes = await page.locator('[data-testid^="ligne-"] .ligne-temps').allTextContents();
  testInfo.annotations.push({ type: 'après la coupe', description: JSON.stringify({ mots: mots.join(' '), lignes }) });
  await page.screenshot({ path: CAPTURES + 'p2-f-apres-coupe.png' });
  expect(mots.map(cle)).not.toContain('aujourdhui');
  expect(mots.map(cle)).not.toContain('lance');
  expect(mots.map(cle)).toContain('salut');
  expect(mots.map(cle)).toContain('partie');
  await page.getByTestId('panneau-fermer').click();
  await allerAEtape(page, 5);
  const { chemin } = await exporterEtTelecharger(page, testInfo, 'sous-titres-coupe.mp4');
  capturerImage(chemin, 2.3, 'p2-f-export-2-3s');
  // Sécurité : aucun CDN de code, aucune violation de CSP, et le WASM d'onnxruntime vient de l'appli.
  testInfo.annotations.push({
    type: 'réseau',
    description: JSON.stringify({ hf: reseau.hf.length, cdn: reseau.cdn, ort: toutes.filter((u) => u.includes('/ort/')), externes: [...new Set(toutes.filter((u) => !u.startsWith('http://localhost')).map((u) => new URL(u).host))], csp, erreurs: journal.erreurs }),
  });
  expect(reseau.cdn).toEqual([]);
  expect(csp).toEqual([]);
});

test('(p2-e2) course : nouvelle vidéo choisie pendant une transcription', async ({}, testInfo) => {
  test.setTimeout(600_000);
  // On est sur Exporter (fin de p2-f). Retour à Habiller, « Tout refaire », puis on change de vidéo pendant l'écoute.
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('outil-sousTitres').click();
  await page.getByTestId('sous-titres-refaire').click();
  await expect(page.getByTestId('sous-titres-etape')).toContainText('J\'écoute ta vidéo', { timeout: 120_000 });
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('retour').click();
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await page.getByTestId('fichier').setInputFiles('tests/qa/fixtures/p2-gris-10s.mp4');
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  // On laisse la transcription de l'ancienne vidéo se terminer.
  await page.waitForTimeout(25_000);
  const { projetSauve } = await import('./outils');
  const r = (await projetSauve(page))?.recette;
  const mots = Array.isArray(r?.sousTitres?.mots) ? r.sousTitres.mots.map((m: any) => m[0]).join(' ') : null;
  testInfo.annotations.push({ type: 'nouvelle vidéo (grise, muette de paroles)', description: JSON.stringify({ source: r?.sources?.[0]?.nom, sousTitres: mots }) });
  expect.soft(mots, 'les sous-titres de l\'ancienne vidéo ne doivent pas arriver dans le nouveau projet').toBeNull();
});
