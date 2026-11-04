// Banc de l'analyse (phase 6) dans Chrome, avec le serveur de dev (port 4185, voir playwright.ia.local.ts) :
//  1. une vidéo de 3 min avec un pic CONNU (bruit faible puis un gros bip à 1:20) : le pic est retrouvé ;
//  2. la vidéo de 2 h de la QA : analyse complète chronométrée (< 3 min), mémoire de Chrome mesurée,
//     puis annulation en cours de route et reprise depuis le dernier point (IndexedDB).
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RACINE = resolve(import.meta.dirname, '../..');
const PIC = join(RACINE, 'tests/harness-ia/fixtures/pic-80s.mp4');
const LONGUE = join(RACINE, 'tests/qa/fixtures/long-2h-320x180.mp4');
const mesures: Record<string, unknown> = {};

test.beforeAll(() => {
  if (existsSync(PIC)) return;
  mkdirSync(join(RACINE, 'tests/harness-ia/fixtures'), { recursive: true });
  // Bruit rose faible pendant 3 min, et un bip de 1 kHz très fort de 80 à 80,5 s. Une image clé toutes les 2 s.
  execFileSync('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=5:duration=180',
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.01:duration=180:sample_rate=44100',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100:duration=180',
    '-filter_complex', "[2:a]volume='if(between(t,80,80.5),6,0)':eval=frame[bip];[1:a][bip]amix=inputs=2:normalize=0[a]",
    '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-g', '10', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '1', '-b:a', '64k', PIC,
  ]);
});

test.afterAll(() => {
  mkdirSync(join(RACINE, 'test-results/ia'), { recursive: true });
  writeFileSync(join(RACINE, 'test-results/ia/mesures.json'), JSON.stringify(mesures, null, 2));
});

/** Mémoire (Mo) de tous les processus du Chrome de CE test : le plus récent lancé par Playwright. */
function memoireChrome(): number | null {
  try {
    const lignes = execFileSync('ps', ['-eo', 'pid=,ppid=,etimes=,rss=,args=']).toString().trim().split('\n');
    const procs = lignes.map((l) => {
      const [pid, ppid, age, rss, ...args] = l.trim().split(/\s+/);
      return { pid: Number(pid), ppid: Number(ppid), age: Number(age), rss: Number(rss), args: args.join(' ') };
    });
    const marques = procs.filter((p) => p.args.includes('playwright_chromiumdev_profile'));
    const pids = new Set(marques.map((p) => p.pid));
    const racines = marques.filter((p) => !pids.has(p.ppid)).sort((a, b) => a.age - b.age);
    const racine = racines[0];
    if (!racine) return null;
    const famille = new Set([racine.pid]);
    let ajout = true;
    while (ajout) {
      ajout = false;
      for (const p of procs) if (famille.has(p.ppid) && !famille.has(p.pid)) famille.add(p.pid), (ajout = true);
    }
    return Math.round(procs.filter((p) => famille.has(p.pid)).reduce((s, p) => s + p.rss, 0) / 1024);
  } catch {
    return null;
  }
}

async function ouvrirBanc(page: Page, fichier: string) {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
  await page.goto('/tests/harness-ia/index.html');
  await page.waitForFunction(() => 'banc' in window, null, { timeout: 120_000 });
  await page.setInputFiles('#fichier', fichier);
}

type Resultat = {
  ok: boolean; ms: number; code?: string; message?: string;
  moments: { pic: number; score: number; etiquettes: string[]; debut: number; fin: number; raison: string }[];
  stats: { repris: boolean; reprisA: number; imagesCles: number; ms: number; duree: number };
  clips: { recette: { plans: { de: number; a: number }[]; textes: { txt: string }[]; statut: string } }[];
  memoirePageMo: number; resume: string; dernieres: unknown;
};

function analyser(page: Page, options: Record<string, unknown>): Promise<Resultat> {
  return page.evaluate((o) => (window as unknown as { banc: { analyser(o: unknown): Promise<Resultat> } }).banc.analyser(o), options);
}

test('pic connu à 1:20 retrouvé (calme → pic), clip sans IA autour', async ({ page }) => {
  await ouvrirBanc(page, PIC);
  const r = await analyser(page, { reprendre: false });
  expect(r.ok, r.message).toBe(true);
  const meilleur = [...r.moments].sort((a, b) => b.score - a.score)[0]!;
  mesures.pic = { ms: r.ms, meilleur, nb: r.moments.length, resume: r.resume.split('\n').slice(0, 4) };
  console.log('PIC', JSON.stringify(mesures.pic));
  expect(Math.abs(meilleur.pic - 80)).toBeLessThan(0.5);
  expect(meilleur.etiquettes).toContain('silence>pic');
  const plan = r.clips[0]!.recette.plans[0]!;
  expect(plan.de).toBeLessThan(80);
  expect(plan.a).toBeGreaterThan(80);
  expect(r.clips[0]!.recette.statut).toBe('brouillon');
});

test('vidéo de 2 h : < 3 min, mémoire, annulation puis reprise', async ({ page }) => {
  await ouvrirBanc(page, LONGUE);
  // 1. Analyse complète, de zéro, chronométrée ; la mémoire de Chrome est relevée toutes les 2 s.
  const memAvant = memoireChrome();
  let memMax = 0;
  const releve = setInterval(() => (memMax = Math.max(memMax, memoireChrome() ?? 0)), 2000);
  const complete = await analyser(page, { reprendre: false });
  clearInterval(releve);
  expect(complete.ok, complete.message).toBe(true);
  mesures.complete = { ms: complete.ms, stats: complete.stats, nb: complete.moments.length, memoireChromeAvantMo: memAvant, memoireChromeMaxMo: memMax, memoirePageMo: complete.memoirePageMo };
  console.log('2H', JSON.stringify(mesures.complete));
  expect(complete.ms).toBeLessThan(180_000);
  expect(complete.stats.imagesCles).toBeGreaterThan(3000);

  // 2. Nouvelle analyse de zéro, arrêtée net vers la moitié (au moins un point de reprise écrit).
  const coupee = await analyser(page, { reprendre: false, couperApresMs: Math.round(complete.ms * 0.5) });
  expect(coupee.ok).toBe(false);
  expect(coupee.code).toBe('annule');

  // 3. Relance : elle repart du dernier point de reprise, et trouve les mêmes moments.
  const reprise = await analyser(page, { reprendre: true });
  expect(reprise.ok, reprise.message).toBe(true);
  const memes = reprise.moments.filter((m) => complete.moments.some((c) => Math.abs(c.pic - m.pic) < 0.05)).length;
  mesures.reprise = { ms: reprise.ms, reprisA: reprise.stats.reprisA, memes, nb: reprise.moments.length, coupeeA: coupee.dernieres };
  console.log('REPRISE', JSON.stringify(mesures.reprise));
  expect(reprise.stats.repris).toBe(true);
  expect(reprise.stats.reprisA).toBeGreaterThanOrEqual(120);
  expect(memes).toBeGreaterThanOrEqual(Math.floor(complete.moments.length * 0.9));

  // 4. Une fois finie, l'analyse gardée revient en un instant.
  const encore = await analyser(page, { reprendre: true });
  mesures.encore = { ms: encore.ms };
  expect(encore.ok).toBe(true);
  expect(encore.ms).toBeLessThan(10_000);
});
