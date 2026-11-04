// Phase 4 dans Chrome : export d'une démo des 3 combos et des 2 modèles (MP4 enregistrés pour être regardés),
// et temps de calcul des pics sonores sur 60 s de son.
// Le banc est construit avec Vite dans un dossier temporaire, puis servi par context.route (port 4181).
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { build } from 'vite';

const RACINE = resolve(import.meta.dirname, '../..');
const SORTIE = process.env.ARKO_SORTIE_MOTEUR ?? join(tmpdir(), 'arko-banc-rythme');
const BASE = 'http://localhost:4181/banc-rythme/';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp4': 'video/mp4' };
const FIXTURES: Record<string, string> = {
  'fixture.mp4': join(RACINE, 'tests/qa/fixtures/long12-1920x1080.mp4'),
  // 60 s de son fabriqué : un bip fort toutes les 3,7 s sur un fond faible.
  'son60.mp4': join(SORTIE, 'son60.mp4'),
};

test.setTimeout(240_000);

test.beforeAll(async () => {
  mkdirSync(SORTIE, { recursive: true });
  if (!existsSync(FIXTURES['son60.mp4']!)) {
    const son = "aevalsrc='if(lt(mod(t\\,3.7)\\,0.08)\\,0.8*sin(2*PI*600*t)\\,0.03*sin(2*PI*97*t)*sin(2*PI*0.3*t))':s=48000:d=60";
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=60', '-f', 'lavfi', '-i', son,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', FIXTURES['son60.mp4']!]);
  }
  await build({
    configFile: false,
    root: RACINE,
    base: '/banc-rythme/',
    logLevel: 'warn',
    worker: { format: 'es' },
    build: { outDir: join(SORTIE, 'dist'), emptyOutDir: true, rolldownOptions: { input: join(RACINE, 'tests/harness-rythme/index.html') } },
  });
});

test.beforeEach(async ({ context }) => {
  await context.route(`${BASE}**`, async (route) => {
    const chemin = new URL(route.request().url()).pathname.replace('/banc-rythme/', '');
    const nom = chemin.split('/').pop()!;
    const fichier = FIXTURES[nom] ?? join(SORTIE, 'dist', chemin);
    if (!existsSync(fichier)) return route.fulfill({ status: 404, body: 'absent' });
    await route.fulfill({ status: 200, body: readFileSync(fichier), contentType: TYPES[extname(fichier)] ?? 'application/octet-stream' });
  });
});

type Banc = { banc: Record<string, () => Promise<never>> };

test('démo : 3 combos et 2 modèles exportés', async ({ page }) => {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto(`${BASE}tests/harness-rythme/index.html`);
  await expect(page).toHaveTitle('pret');
  const res = (await page.evaluate(() => (window as never as Banc).banc.demo!())) as Record<string, { base64: string; duree: number } & Record<string, unknown>>;
  for (const [nom, r] of Object.entries(res)) {
    writeFileSync(join(SORTIE, `demo-${nom}.mp4`), Buffer.from(r.base64, 'base64'));
    const { base64: _, ...infos } = r;
    console.log(`[démo ${nom}]`, join(SORTIE, `demo-${nom}.mp4`), JSON.stringify(infos));
  }
  expect(res.combos!.duree).toBeCloseTo(14.5);
  expect(res.meilleur!.duree).toBeCloseTo(11.5);
});

test('pics sonores : 60 s de son en moins de 300 ms', async ({ page }) => {
  await page.goto(`${BASE}tests/harness-rythme/index.html`);
  await expect(page).toHaveTitle('pret');
  const r = (await page.evaluate(() => (window as never as Banc).banc.pics!())) as { premier: number; second: number; nombre: number; pics12: number[] };
  console.log(`[pics] 60 s : ${r.premier.toFixed(0)} ms (cache : ${r.second.toFixed(1)} ms), ${r.nombre} pics ; fixture 12 s : ${r.pics12.join(', ')}`);
  expect(r.premier).toBeLessThan(300);
  expect(r.second).toBeLessThan(20);
});
