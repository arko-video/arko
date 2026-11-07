// e2e du dev 1 (v3 « Best-of ») dans Chrome :
//  1. Monteur sans IA sur une session fabriquée de 6 min (bips + un rire) → clips racontés (mise en place avant le pic),
//     titre retiré d'un toucher sur la carte → clip gardé → retouché → export MP4 sans texte.
//  2. « Qui parle ? » sur une vidéo fabriquée à deux voix (−40 et −25 dB, comme la session de Romain) : 2 voix trouvées
//     par niveau + timbre, extraits à écouter, noms, une phrase corrigée d'un toucher, Valider, puis réouverture.
//   npx vite build --outDir dist-dev1 && ARKO_PORT=4391 [CAPTURES=/un/dossier] npx playwright test --config playwright.dev1.config.ts
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import { bruitDeJeu, fabriquerVoix, FREQ_TEST, mixer, toursAlternes, VOIX_A, VOIX_B } from '../../src/auto/voix/voix-test';

const DOSSIER = join(tmpdir(), 'arko-dev1-e2e');
const SESSION = join(DOSSIER, 'session-6min.mp4');
const DEUX_VOIX = join(DOSSIER, 'deux-voix-40s.mp4');
const DEUX_PISTES = join(DOSSIER, 'deux-pistes-30s.mp4');
const BIPS = [60, 180, 300];
const DUREE_VOIX = 40;
const VRAI = toursAlternes(DUREE_VOIX, 3);

test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, serviceWorkers: 'block' });

function wav(chemin: string, son: Float32Array) {
  const n = son.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(FREQ_TEST, 24);
  b.writeUInt32LE(FREQ_TEST * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(son[i]! * 32767))), 44 + i * 2);
  writeFileSync(chemin, b);
}

test.beforeAll(() => {
  mkdirSync(DOSSIER, { recursive: true });
  const lavfi = (source: string) => ['-f', 'lavfi', '-i', source];
  if (!existsSync(SESSION)) {
    // Bruit rose faible 6 min, gros bip 1 kHz (0,5 s) à 60, 180, 300 s, et un « rire » (son haché à 5 Hz) juste après 180 s.
    const bips = BIPS.map((t) => `between(t,${t},${t + 0.5})`).join('+');
    const filtre =
      `[2:a]volume='if(${bips},6,0)':eval=frame[bip];` +
      `[3:a]volume='if(between(t,181,184),2.5*(0.55+0.45*sin(2*PI*5*t)),0)':eval=frame[rire];` +
      `[1:a][bip][rire]amix=inputs=3:normalize=0[a]`;
    execFileSync('ffmpeg', [
      ...'-y -v error'.split(' '),
      ...lavfi('testsrc2=size=320x180:rate=5:duration=360'),
      ...lavfi('anoisesrc=color=pink:amplitude=0.01:duration=360:sample_rate=44100'),
      ...lavfi('sine=frequency=1000:sample_rate=44100:duration=360'),
      ...lavfi('sine=frequency=500:sample_rate=44100:duration=360'),
      ...['-filter_complex', filtre, ...'-map 0:v -map [a] -c:v libx264 -g 10 -pix_fmt yuv420p -c:a aac -ac 1 -b:a 96k'.split(' '), SESSION],
    ]);
  }
  if (!existsSync(DEUX_VOIX)) {
    const a = fabriquerVoix(VOIX_A, VRAI.filter((t) => t.v === 0), DUREE_VOIX, -40, 1);
    const b = fabriquerVoix(VOIX_B, VRAI.filter((t) => t.v === 1), DUREE_VOIX, -25, 2);
    const son = join(DOSSIER, 'deux-voix.wav');
    wav(son, mixer(a, b, bruitDeJeu(DUREE_VOIX, -52)));
    execFileSync('ffmpeg', [
      ...'-y -v error'.split(' '),
      ...lavfi(`testsrc2=size=320x180:rate=10:duration=${DUREE_VOIX}`),
      ...['-i', son, ...'-map 0:v -map 1:a -c:v libx264 -g 20 -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 160k -shortest'.split(' '), DEUX_VOIX],
    ]);
  }
});

/** Comme OBS : la voix du micro sur la piste 1, celle de Discord sur la piste 2 (30 s). */
function fabriquerDeuxPistes() {
  if (existsSync(DEUX_PISTES)) return;
  const vrai = VRAI.filter((t) => t.a <= 30);
  const micro = join(DOSSIER, 'micro.wav');
  const discord = join(DOSSIER, 'discord.wav');
  wav(micro, mixer(fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), 30, -40, 1), bruitDeJeu(30, -70, 3)));
  wav(discord, mixer(fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), 30, -25, 2), bruitDeJeu(30, -75, 4)));
  execFileSync('ffmpeg', [
    ...'-y -v error -f lavfi -i testsrc2=size=320x180:rate=10:duration=30'.split(' '),
    ...['-i', micro, '-i', discord],
    ...'-map 0:v -map 1:a -map 2:a -c:v libx264 -g 20 -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 128k -shortest'.split(' '),
    ...['-metadata:s:a:0', 'title=Micro', '-metadata:s:a:1', 'title=Discord', DEUX_PISTES],
  ]);
}

async function capture(page: Page, nom: string) {
  const d = process.env.CAPTURES;
  if (d) await page.waitForTimeout(400).then(() => page.screenshot({ path: join(d, `dev1-${nom}.png`), fullPage: true }));
}

function preparer(page: Page, drapeaux = '') {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  return page.addInitScript((d) => {
    localStorage.setItem('arko.conseils.vus', '1');
    if (d) localStorage.setItem('arko.auto', d);
  }, drapeaux);
}

test('monteur sans IA : clip raconté, titre retiré d\'un toucher, export', async ({ page }, info) => {
  await preparer(page);
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(SESSION);
  await page.getByTestId('choix-monteur-ia').click({ timeout: 30_000 });
  await expect(page.getByTestId('monteur-demande')).toBeVisible();
  for (let i = 10; i > 3; i--) await page.getByTestId('nombre-moins').click();
  await expect(page.getByTestId('titre-clips')).toBeChecked();
  await capture(page, '1-demande');
  await page.getByTestId('lancer').click();
  await expect(page.getByTestId('voir-clips')).toBeVisible({ timeout: 180_000 });
  await page.getByTestId('voir-clips').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('1 / 3');
  // Chaque clip couvre un bip avec sa MISE EN PLACE (≥ 5 s avant) et sa chute (≥ 1 s après la fin du bip).
  const carte = page.getByTestId('revue-carte');
  const [de, a] = [Number(await carte.getAttribute('data-de')), Number(await carte.getAttribute('data-a'))];
  const bip = BIPS.find((t) => t >= de && t <= a)!;
  expect(bip).toBeDefined();
  expect(bip - de).toBeGreaterThanOrEqual(4.9);
  expect(a - (bip + 0.5)).toBeGreaterThanOrEqual(0.9);
  // Le titre posé est affiché sur la carte, et se retire d'un toucher.
  await expect(page.getByTestId('v3-titre-texte')).toBeVisible();
  await capture(page, '2-revue-titre');
  await page.getByTestId('v3-titre-retirer').click();
  await expect(page.getByTestId('v3-titre-actions')).toHaveCount(0);
  await capture(page, '3-revue-sans-titre');
  await page.getByTestId('garder').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('2 / 3');
  // Le 2e : on change son titre (champ + Valider), puis on le jette.
  await page.getByTestId('v3-titre-modifier').click();
  await page.getByTestId('v3-titre-champ').fill('LE CLUTCH');
  await page.getByTestId('v3-titre-valider').click();
  await expect(page.getByTestId('v3-titre-texte')).toHaveText('« LE CLUTCH »');
  await expect(page.getByTestId('revue-titre')).toHaveText('Le clutch');
  await page.getByTestId('jeter').click();
  await expect(page.getByTestId('revue-compteur')).toHaveText('3 / 3');
  await page.getByTestId('jeter').click();
  await expect(page.getByTestId('revue-fin-titre')).toBeVisible();
  // Retoucher le clip gardé : aucun texte dans Habiller, puis export.
  await page.getByTestId('retoucher-premier').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('barre-outils')).toBeVisible();
  await expect(page.locator('[data-testid^="texte-boite-"]')).toHaveCount(0);
  await capture(page, '4-habiller-sans-titre');
  await page.getByTestId('suivant').click();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 200_000 });
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const chemin = info.outputPath('clip.mp4');
  await telechargement.saveAs(chemin);
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(chemin) });
  const duree = await input.computeDuration();
  input.dispose();
  expect(Math.abs(duree - (a - de))).toBeLessThan(0.2);
  await capture(page, '5-export');
});

test('Qui parle ? : deux voix à −40 et −25 dB, noms, correction d\'un toucher, Valider', async ({ page }) => {
  await preparer(page, 'avatars');
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(DEUX_VOIX);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await page.getByTestId('outil-avatars').click();
  const debut = Date.now();
  await page.getByTestId('v3-qui-parle').click();
  await expect(page.getByTestId('v3-qp-methode')).toHaveAttribute('data-methode', 'niveau+timbre', { timeout: 60_000 });
  console.info(`Qui parle : ${DUREE_VOIX} s de son analysées en ${((Date.now() - debut) / 1000).toFixed(1)} s`);
  await expect(page.locator('[data-testid^="v3-voix-p"][data-testid$="1"], [data-testid="v3-voix-p2"]')).toHaveCount(2);
  // Les tours trouvés collent à la vérité (p1 = la voix la plus faible, celle du micro).
  const lignes = await page.locator('[data-testid^="v3-qp-phrase-"]').evaluateAll((els) =>
    els.map((e) => ({ ts: Number(e.getAttribute('data-ts')), fin: Number(e.getAttribute('data-fin')), p: e.getAttribute('data-p') })),
  );
  let justes = 0;
  let total = 0;
  for (const l of lignes)
    for (const t of VRAI) {
      const commun = Math.max(0, Math.min(l.fin, t.a) - Math.max(l.ts, t.de));
      total += commun;
      if (l.p === (t.v === 0 ? 'p1' : 'p2')) justes += commun;
    }
  console.info(`Qui parle dans Chrome : ${((100 * justes) / total).toFixed(1)} % du temps bien attribué (${lignes.length} tours)`);
  expect(justes / total).toBeGreaterThanOrEqual(0.9);
  // Écouter un extrait, nommer les voix.
  await page.getByTestId('v3-extrait-p1-0').click();
  await expect(page.getByTestId('v3-extrait-p1-0')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('v3-voix-nom-p1').fill('Romain');
  await page.getByTestId('v3-voix-nom-p1').press('Tab');
  await page.getByTestId('v3-voix-nom-p2').fill('Guts');
  await page.getByTestId('v3-voix-nom-p2').press('Tab');
  // Une phrase corrigée d'un toucher.
  const phrase = page.getByTestId('v3-qp-phrase-0');
  const avant = await phrase.getAttribute('data-p');
  await phrase.click();
  await expect(phrase).toHaveAttribute('data-p', avant === 'p1' ? 'p2' : 'p1');
  await capture(page, '6-qui-parle');
  await page.getByTestId('v3-qp-valider').click();
  await expect(page.getByTestId('v3-qui-parle-ecran')).toHaveCount(0);
  // Rouvert : les voix posées sont là tout de suite (pas de nouvelle écoute), avec la correction.
  await page.getByTestId('v3-qui-parle').click();
  await expect(page.getByTestId('v3-voix-nom-p1')).toHaveValue('Romain');
  await expect(page.getByTestId('v3-voix-nom-p2')).toHaveValue('Guts');
  await expect(page.getByTestId('v3-qp-phrase-0')).toHaveAttribute('data-p', avant === 'p1' ? 'p2' : 'p1');
  await capture(page, '7-qui-parle-rouvert');
});

test('Qui parle ? : vidéo OBS à 2 pistes (micro, Discord) → pistes séparées, exact', async ({ page }) => {
  fabriquerDeuxPistes();
  await preparer(page, 'avatars');
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(DEUX_PISTES);
  // Le dialogue des pistes (dev 2) peut s'ouvrir : on garde les deux.
  const pistes = page.getByTestId('v3-pistes');
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  if (await pistes.isVisible().catch(() => false)) await page.getByTestId('v3-pistes-valider').click();
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await page.getByTestId('outil-avatars').click();
  await page.getByTestId('v3-qui-parle').click();
  await expect(page.getByTestId('v3-qp-methode')).toHaveAttribute('data-methode', 'pistes', { timeout: 60_000 });
  const lignes = await page.locator('[data-testid^="v3-qp-phrase-"]').evaluateAll((els) =>
    els.map((e) => ({ ts: Number(e.getAttribute('data-ts')), fin: Number(e.getAttribute('data-fin')), p: e.getAttribute('data-p') })),
  );
  let justes = 0;
  let total = 0;
  for (const l of lignes)
    for (const t of VRAI) {
      const commun = Math.max(0, Math.min(l.fin, t.a) - Math.max(l.ts, t.de));
      total += commun;
      if (l.p === (t.v === 0 ? 'p1' : 'p2')) justes += commun;
    }
  console.info(`Qui parle, pistes séparées : ${((100 * justes) / total).toFixed(1)} % du temps bien attribué (${lignes.length} tours)`);
  expect(justes / total).toBeGreaterThanOrEqual(0.98);
  // Nom proposé = nom de la piste dans le fichier.
  await expect(page.getByTestId('v3-voix-nom-p1')).toHaveValue('Micro');
  await expect(page.getByTestId('v3-voix-nom-p2')).toHaveValue('Discord');
  await capture(page, '8-qui-parle-pistes');
});
