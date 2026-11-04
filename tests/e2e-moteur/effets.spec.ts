// Effets de la phase 3 dans Chrome :
//  1. export d'une démo (4 plans : flash, glisse, glitch ; zoom punch ; 2 sons) → MP4 enregistré pour être regardé ;
//  2. cohérence : une image en pleine transition est la même dans l'aperçu (540 × 960) et dans le MP4 exporté ;
//  3. coût du dessin d'une image à 540 × 960 (< 10 ms).
// Le banc est construit avec Vite (sans PWA) dans un dossier temporaire, puis servi par context.route.
import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';

const RACINE = resolve(import.meta.dirname, '../..');
const SORTIE = process.env.ARKO_SORTIE_MOTEUR ?? join(tmpdir(), 'arko-banc-effets');
const BASE = 'http://localhost:4181/banc-effets/';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp4': 'video/mp4' };

test.beforeAll(async () => {
  mkdirSync(SORTIE, { recursive: true });
  await build({
    configFile: false,
    root: RACINE,
    base: '/banc-effets/',
    logLevel: 'warn',
    worker: { format: 'es' },
    build: { outDir: join(SORTIE, 'dist'), emptyOutDir: true, rolldownOptions: { input: join(RACINE, 'tests/harness-effets/index.html') } },
  });
});

test.beforeEach(async ({ context }) => {
  await context.route(`${BASE}**`, async (route) => {
    const chemin = new URL(route.request().url()).pathname.replace('/banc-effets/', '');
    const fichier = chemin.endsWith('fixture.mp4') ? join(RACINE, 'tests/qa/fixtures/long12-1920x1080.mp4') : join(SORTIE, 'dist', chemin);
    if (!existsSync(fichier)) return route.fulfill({ status: 404, body: 'absent' });
    await route.fulfill({ status: 200, body: readFileSync(fichier), contentType: TYPES[extname(fichier)] ?? 'application/octet-stream' });
  });
});

test('démo exportée + image en pleine transition identique aperçu / export', async ({ page }) => {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  await page.goto(`${BASE}tests/harness-effets/index.html`);
  await expect(page).toHaveTitle('pret');
  // Temps = images exactes (n / 30) : flash juste avant la coupe de 2 s, glisse autour de 4 s, glitch après 6 s, zoom.
  const temps = [59, 117, 123, 181, 90].map((n) => n / 30);
  const r = await page.evaluate((t) => (window as never as { banc: { demo(t: number[]): Promise<never> } }).banc.demo(t), temps);
  const res = r as { mesures: { t: number; transition: string; psnr: number }[]; duree: number; coupes: number[]; base64: string; taille: number };
  writeFileSync(join(SORTIE, 'demo-phase3.mp4'), Buffer.from(res.base64, 'base64'));
  console.log('[démo]', join(SORTIE, 'demo-phase3.mp4'), `${(res.taille / 1e6).toFixed(2)} Mo`, `durée ${res.duree} s`, `coupes ${res.coupes.join(', ')}`);
  for (const m of res.mesures) console.log(`[PSNR] t = ${m.t.toFixed(3)} s (${m.transition}) : ${m.psnr.toFixed(2)} dB`);
  expect(res.duree).toBeCloseTo(8.5);
  for (const m of res.mesures) expect(m.psnr, `t = ${m.t} (${m.transition})`).toBeGreaterThan(30);
});

test('coût d\'une image à 540 × 960 : chaque effet coûte moins de 10 ms', async ({ page }) => {
  await page.goto(`${BASE}tests/harness-effets/index.html`);
  await expect(page).toHaveTitle('pret');
  type Cout = { total: number; sansEffet: number; surcout: number };
  const res = (await page.evaluate(() => (window as never as { banc: { cout(): Promise<never> } }).banc.cout())) as Record<string, Cout>;
  // Chrome sans GPU (VM de test) : la mise en page seule coûte déjà plusieurs ms ; on vérifie le SURCOÛT de l'effet.
  for (const [cas, m] of Object.entries(res)) console.log(`[coût] ${cas} : ${m.total} ms (sans l'effet ${m.sansEffet} ms, surcoût ${m.surcout} ms)`);
  for (const m of Object.values(res)) expect(m.surcout).toBeLessThan(10);
});
