// Sous-titres automatiques avec le VRAI modèle Whisper, dans Chrome.
//   npx playwright test --config playwright.sous-titres.config.ts
// - La vidéo tests/fixtures/parole-fr.mp4 dit une phrase connue (tests/fixtures/parole-fr.json : mots et temps exacts).
// - Le modèle est lu sur le disque (tests/fixtures/modeles/, hors Git) : page.route remplace huggingface.co.
// - On vérifie : au moins 70 % des mots attendus, au bon temps (±0,3 s), en temps source même après une coupe
//   et un plan accéléré ; la 2ᵉ fois sans internet ; l'annulation ; aucune requête vers un CDN de code ; la CSP.
// Pour retélécharger le modèle : voir la liste FICHIERS_MODELE dans src/sous-titres/config.ts.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { Mot } from '../../src/recette/types';

const MODELES = 'tests/fixtures/modeles';
const ATTENDU = JSON.parse(readFileSync('tests/fixtures/parole-fr.json', 'utf-8')) as {
  mots: { txt: string; ts: number; fin: number }[];
};
const TOLERANCE_S = 0.3;
const TAUX_MIN = 0.7;

/** Texte de comparaison : minuscules, sans accents ni ponctuation. */
const cle = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Part des mots attendus retrouvés (même texte, début à ±0,3 s), et l'écart moyen des temps. */
function comparer(mots: Mot[], attendus: { txt: string; ts: number; fin: number }[]) {
  const libres = [...mots];
  let trouves = 0;
  let ecartDebut = 0;
  let ecartFin = 0;
  for (const a of attendus) {
    const i = libres.findIndex((m) => cle(m[0]) === cle(a.txt) && Math.abs(m[1] - a.ts) <= TOLERANCE_S);
    if (i < 0) continue;
    const m = libres.splice(i, 1)[0]!;
    trouves++;
    ecartDebut += Math.abs(m[1] - a.ts);
    ecartFin += Math.abs(m[2] - a.fin);
  }
  return { taux: trouves / attendus.length, ecartDebut: ecartDebut / Math.max(1, trouves), ecartFin: ecartFin / Math.max(1, trouves) };
}

type Progres = [number, string, number][];
/** La barre ne recule jamais, et finit à 1. */
function verifierProgression(progres: Progres) {
  const p = progres.map((x) => x[0]);
  expect(p.at(-1)).toBe(1);
  expect(p.every((v, i) => i === 0 || v >= p[i - 1]! - 1e-9)).toBe(true);
}

let contexte: BrowserContext;
let page: Page;
let horsLigne = false;
/** Octets vraiment envoyés par « huggingface.co » (fichiers complets). */
let octetsHf = 0;
const versHf: string[] = [];
const versCdn: string[] = [];
const toutes: string[] = [];
const csp: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  test.skip(!existsSync(join(MODELES, 'onnx-community/whisper-base_timestamped/onnx')), 'Modèle absent de tests/fixtures/modeles/');
  contexte = await browser.newContext({ serviceWorkers: 'block' });
  contexte.on('request', (r) => toutes.push(r.url()));
  // huggingface.co servi depuis le disque (ou coupé pour simuler « sans internet »).
  await contexte.route(/^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//, async (route) => {
    const url = new URL(route.request().url());
    const plage = route.request().headers()['range'];
    versHf.push(`${plage ? 'RANGE' : route.request().method()} ${url.href}`);
    if (horsLigne) return route.abort('internetdisconnected');
    const m = /^\/(.+?)\/resolve\/[^/]+\/(.+)$/.exec(url.pathname);
    const chemin = m ? join(MODELES, m[1]!, m[2]!) : '';
    const entetes = {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'Content-Range, Content-Length',
      'content-type': 'application/octet-stream',
    };
    if (!chemin || !existsSync(chemin)) return route.fulfill({ status: 404, headers: entetes, body: 'absent' });
    const corps = readFileSync(chemin);
    // Comme huggingface.co : « Range: bytes=0-0 » (transformers.js lit ainsi la taille des fichiers).
    if (route.request().headers()['range'] === 'bytes=0-0') {
      return route.fulfill({ status: 206, headers: { ...entetes, 'content-range': `bytes 0-0/${corps.length}` }, body: corps.subarray(0, 1) });
    }
    octetsHf += corps.length;
    return route.fulfill({ status: 200, headers: entetes, body: corps });
  });
  // Aucun CDN de code ne doit être appelé : on note et on bloque.
  await contexte.route(/jsdelivr|unpkg\.com|cdnjs|esm\.sh|skypack|jspm/, (route) => {
    versCdn.push(route.request().url());
    return route.abort();
  });
  page = await contexte.newPage();
  const noter = (t: string) => {
    if (/Content Security Policy|\[CSP\]/i.test(t)) csp.push(t);
  };
  page.on('console', (m) => noter(m.text()));
  page.on('worker', (w) => w.on('console', (m) => noter(m.text())));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`[CSP] ${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto('tests/harness-sous-titres/index.html');
  const pret = await page.waitForFunction(() => 'banc' in window, null, { timeout: 15_000 }).catch(() => null);
  test.skip(!pret, 'Banc absent : lancer avec --config playwright.sous-titres.config.ts');
});

test.afterAll(async () => {
  await contexte?.close();
});

test('le banc a la même CSP que l\'appli', () => {
  const lire = (f: string) => /Content-Security-Policy"\s+content="([^"]+)"/.exec(readFileSync(f, 'utf-8'))?.[1];
  expect(lire('tests/harness-sous-titres/index.html')).toBe(lire('index.html'));
});

test('1re fois : télécharge le module puis transcrit la phrase', async () => {
  const r = await page.evaluate(() => (window as any).banc.transcrire());
  const c = comparer(r.mots, ATTENDU.mots);
  console.log(`[sous-titres] 1re fois (téléchargement compris) : ${r.ms} ms, ${Math.round(c.taux * 100)} % des mots, écart début ${c.ecartDebut.toFixed(2)} s, fin ${c.ecartFin.toFixed(2)} s`);
  console.log(`[sous-titres] mots : ${r.mots.map((m: Mot) => `${m[0]}@${m[1]}-${m[2]}${m[3] ? '*' : ''}`).join(' ')}`);
  expect(r.avant.present).toBe(false);
  expect(r.apres.present).toBe(true);
  expect(c.taux).toBeGreaterThanOrEqual(TAUX_MIN);
  // Progression : de 0 à 1, sans jamais reculer : « Je télécharge… » puis « J'écoute ta vidéo… ».
  const progres = r.progres as Progres;
  verifierProgression(progres);
  console.log(`[sous-titres] étapes : ${[...new Set(progres.map((x) => x[1].replace(/\d+ \/ /, 'X / ')))].join(' → ')}`);
  expect(progres[0]![1]).toMatch(/^Je télécharge le module sous-titres… 0 \/ \d+ Mo$/);
  expect(progres.some((x) => x[1] === 'J\'écoute ta vidéo…')).toBe(true);
  // La part du téléchargement s'arrête avant l'écoute (60 %).
  expect(Math.max(...progres.filter((x) => x[1].startsWith('Je télécharge')).map((x) => x[0]))).toBeLessThanOrEqual(0.6);
});

test('2e fois : marche sans internet (tout est en cache)', async () => {
  horsLigne = true;
  const avant = versHf.length;
  const r = await page.evaluate(() => (window as any).banc.transcrire());
  horsLigne = false;
  const c = comparer(r.mots, ATTENDU.mots);
  const pret = r.progres.find((x: [number, string, number]) => x[1] === 'J\'écoute ta vidéo…')?.[2] ?? 0;
  console.log(`[sous-titres] 2e fois (modèle en cache, sans internet) : ${r.ms} ms dont ${pret} ms de chargement du modèle, ${Math.round(c.taux * 100)} % des mots`);
  console.log(`[sous-titres] requêtes huggingface pendant ce passage : ${versHf.length - avant}`);
  expect(r.avant.present).toBe(true);
  expect(c.taux).toBeGreaterThanOrEqual(TAUX_MIN);
  // Modèle en cache : pas de « Je télécharge », directement « Je prépare… » puis « J'écoute ta vidéo… ».
  const progres = r.progres as Progres;
  verifierProgression(progres);
  expect(progres.some((x) => x[1].startsWith('Je télécharge'))).toBe(false);
  expect(progres[0]![1]).toBe('Je prépare le module sous-titres…');
  expect([...new Set(progres.map((x) => x[1]))]).toEqual(['Je prépare le module sous-titres…', 'J\'écoute ta vidéo…', 'Sous-titres prêts.']);
  // Le Worker est fermé à la fin.
  await expect.poll(() => page.workers().length).toBe(0);
});

test('une coupe et un plan accéléré : les mots restent en temps source', async () => {
  // On garde [0 ; 2,42] puis [4,1 ; 9,4] en vitesse 2 : « aujourd'hui on lance une » sont coupés.
  const r = await page.evaluate(() => (window as any).banc.transcrire([[0, 2.42], [4.1, 9.4, 2]]));
  const gardes = ATTENDU.mots.filter((m) => (m.ts >= 0 && m.fin <= 2.42) || (m.ts >= 4.1 && m.fin <= 9.4));
  const c = comparer(r.mots, gardes);
  console.log(`[sous-titres] coupe + vitesse 2 : ${Math.round(c.taux * 100)} % des ${gardes.length} mots gardés, ${r.ms} ms`);
  expect(c.taux).toBeGreaterThanOrEqual(TAUX_MIN);
  expect(r.mots.filter((m: Mot) => m[1] > 2.5 && m[1] < 4.0)).toEqual([]);
});

test('langue « auto » : Whisper reconnaît seul le français', async () => {
  const r = await page.evaluate(() => (window as any).banc.transcrire(undefined, 'auto'));
  const c = comparer(r.mots, ATTENDU.mots);
  console.log(`[sous-titres] langue auto : ${Math.round(c.taux * 100)} % des mots, ${r.ms} ms`);
  expect(c.taux).toBeGreaterThanOrEqual(TAUX_MIN);
});

test('Annuler arrête la transcription et ferme le Worker', async () => {
  expect(await page.evaluate(() => (window as any).banc.annuler(1500))).toBe('annule');
  await expect.poll(() => page.workers().length).toBe(0);
});

test('Annuler pendant le chargement du modèle ferme aussi le Worker', async () => {
  expect(await page.evaluate(() => (window as any).banc.annulerPendantPreparation())).toBe('annule (Je prépare le module sous-titres…)');
  await expect.poll(() => page.workers().length).toBe(0);
});

test('aucune requête vers un CDN de code, aucune erreur de CSP', async () => {
  const cache: string[] = await page.evaluate(() => (window as any).banc.cache());
  console.log(`[sous-titres] requêtes huggingface (${versHf.length}) : ${versHf.map((u) => u.replace(/https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/main\//, '')).join(', ')}`);
  console.log(`[sous-titres] cache : ${cache.length} entrées ; téléchargé depuis huggingface.co : ${(octetsHf / 1e6).toFixed(1)} Mo`);
  // Chaque fichier du modèle n'est téléchargé en entier qu'une fois.
  const complets = versHf.filter((u) => u.startsWith('GET '));
  expect(new Set(complets).size).toBe(complets.length);
  console.log(`[sous-titres] WASM servi par l'appli : ${toutes.filter((u) => u.includes('/ort/')).join(', ')}`);
  expect(versCdn).toEqual([]);
  expect(toutes.filter((u) => /jsdelivr|unpkg|cdnjs/.test(u))).toEqual([]);
  expect(cache.some((u) => u.includes('/arko/ort/ort-wasm-simd-threaded.wasm'))).toBe(true);
  expect(csp).toEqual([]);
});
