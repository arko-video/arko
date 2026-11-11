// Best-of v4 — le parcours complet (QA, 7/11/2026), dans Chrome headless, au format téléphone, en YouTube 16:9, sur
// une session FABRIQUÉE de 4 min (aucune donnée privée, outils-best-of.ts → sessionV4) : 2 voix dans UN mélange
// (−40 / −25 dB, comme Romain et Guts), 3 scènes séparées par 30 s sans parole, une explosion hors parole, bruit et
// musique de jeu partout.
// 1. Avec le module sous-titres (SIMULÉ : transcription déjà posée, rien n'est téléchargé) et les morceaux de Kevin
//    MacLeod servis par le serveur de test : Analyser → Monter la vidéo = 2 touchers ; le détecteur de voix rangé dans
//    l'appli se charge SANS accord (public/modeles/, gardé dans le cache « arko-modeles ») et donne les mêmes
//    probabilités que le banc (onnxruntime-node) ; 2 voix, 2 persos à leur place (forte à gauche, faible à droite) ;
//    musique de Kevin MacLeod d'office, jamais pendant l'accroche, qui baisse sous la parole ; aucun blanc > 2 s ;
//    un seul Annuler ; export 1920 × 1080 à −14 LUFS ± 1 ; aperçu = export (PSNR) ; puis Habiller → Couper →
//    panneau Séquences (descendre, retirer : un Annuler chacun).
// 2. Sans le module sous-titres et sans réseau : la carte d'accord apparaît (le détecteur de voix n'y est pas),
//    « Pas maintenant » → bandeau sur la revue ; « − 1 / + 1 phrase », décocher (la durée baisse) et déplacer une séquence (l'ordre est
//    gardé au montage) ; montage = un seul Annuler ;
//    la musique fabriquée par Arko prend le relais ; puis Habiller : Rythme des coupes, Qui parle ?
//    (menu Émotion), Sons → Musique (Remplacer, onglet « Musiques d'Arko »).
// 3. L'empreinte de voix (CAM++, 28 Mo) : 2 voix au même niveau → proposée sur la revue → téléchargée (servie depuis
//    /home/claude/modeles/, hors dépôt : sauté si absent), calculée dans son Worker, rangée dans « arko-modeles ».
// Captures : dans le dossier de sortie du test, et dans ARKO_CAPTURES=/dossier si donné (préfixe « qa- »).

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import sharp from 'sharp';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { paroleDepuisProbas } from '../../src/auto/vad/segments';
import { fabriquerVoix, mixer, toursAlternes, VOIX_A, type TourVrai } from '../../src/auto/voix/voix-test';
import {
  decoderMono,
  lireRecette,
  motsDesTours,
  png,
  poserTranscription,
  psnr,
  rmsDb,
  sessionV4,
  simulerModuleWhisper,
  sortieVersSource,
  verifierPersos,
  versSource,
  vadDuBanc,
  VOIX_DISCORD,
  wav16k,
  type RecetteLue,
  type SessionV4,
} from './outils-best-of';

const port = Number(env.ARKO_PORT) || 4173;
const CAMPLUS_LOCAL = '/home/claude/modeles/3dspeaker-campplus-zh-en/model.onnx';
const URL_CAMPLUS = /huggingface\.co\/csukuangfj\/speaker-embedding-models\/resolve\/[0-9a-f]{40}\/3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced\.onnx/;

test.use({
  actionTimeout: 20_000,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  // Le style Best-of a déjà été choisi une fois sur cet appareil (il est retenu) : le chemin d'office = 2 touchers.
  storageState: {
    cookies: [],
    origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'arko.destination', value: 'youtube' }, { name: 'arko.express.style', value: 'bestOf' }] }],
  },
});

async function capture(page: Page, info: TestInfo, nom: string, pleine = false) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath(`${nom}.png`), fullPage: pleine });
  if (env.ARKO_CAPTURES) await page.screenshot({ path: `${env.ARKO_CAPTURES}/${nom}.png`, fullPage: pleine });
}

/** La vidéo de la session (fond bleu 1280 × 720, 15 i/s) ; renvoie son chemin. */
function video(dossier: string, son: Float32Array, duree: number, nom: string): string {
  const wav = join(dossier, 'son.wav');
  writeFileSync(wav, wav16k(son));
  const mp4 = join(dossier, `${nom}.mp4`);
  execFileSync('ffmpeg', [
    ...'-y -v error -f lavfi'.split(' '),
    '-i', `color=c=0x2040C0:s=1280x720:r=15:d=${duree}`,
    '-i', wav,
    ...'-map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 30 -g 30 -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 160k -shortest'.split(' '),
    mp4,
  ]);
  return mp4;
}

/** Importe la vidéo, puis revient à « Mes montages » (le projet est enregistré). Rend l'empreinte et la durée. */
async function importer(page: Page, mp4: string): Promise<{ emp: string; duree: number }> {
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(mp4);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await expect.poll(async () => !!(await lireRecette(page)), { timeout: 10_000 }).toBe(true);
  const { emp, duree } = (await lireRecette(page))!.sources[0]!;
  return { emp, duree };
}

async function ouvrirExpress(page: Page) {
  for (let i = 0; i < 5 && !(await page.getByTestId('mes-montages').isVisible()); i++) {
    await page.getByTestId('retour').click();
    await page.waitForTimeout(300);
  }
  await page.getByTestId('montage-menu-0').click();
  await page.getByTestId('action-express').click();
  await expect(page.getByTestId('express-reglages')).toBeVisible();
}

/** Clés du Cache Storage `nom` (adresses). */
async function clesCache(page: Page, nom: string): Promise<string[]> {
  return page.evaluate(async (n) => ((await caches.has(n)) ? (await (await caches.open(n)).keys()).map((r) => r.url) : []), nom);
}

/** Les probabilités de la VAD gardées par l'appareil après l'analyse (IndexedDB `arko.mesures.<emp>`). */
async function vadGardee(page: Page, emp: string): Promise<{ pas: number; p: number[]; modele: string } | null> {
  return page.evaluate(async (emp) => {
    const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
    const db = await attendre(indexedDB.open('keyval-store'));
    const g = (await attendre(db.transaction('keyval', 'readonly').objectStore('keyval').get(`arko.mesures.${emp}`))) as { vad?: { pas: number; p: Uint8Array; modele: string } } | undefined;
    return g?.vad ? { pas: g.vad.pas, p: Array.from(g.vad.p), modele: g.vad.modele } : null;
  }, emp);
}

/** Durée de sortie d'une recette (plans seulement : le Best-of n'a ni intro ni outro). */
function dureeSortie(r: RecetteLue): number {
  return r.plans.reduce((s, p) => s + (p.a - p.de) / (p.vit ?? 1) + (p.fige ?? 0), 0);
}

/** Le plus long « blanc » du montage (temps de sortie) : ni voix vraie, ni explosion. */
function plusLongBlanc(r: RecetteLue, s: SessionV4): { duree: number; t: number; total: number; n05: number } {
  const actif = (ts: number | null) => ts !== null && (s.tours.some((x) => ts >= x.de - 0.05 && ts < x.a + 0.05) || (ts >= s.explosion.de && ts < s.explosion.a));
  const fin = dureeSortie(r);
  let pire = { duree: 0, t: 0 };
  let total = 0;
  let n05 = 0;
  let debut = -1;
  const pas = 0.02;
  for (let t = 0; t <= fin; t += pas) {
    const vide = t < fin && !actif(versSource(r.plans, t));
    if (vide && debut < 0) debut = t;
    if (!vide && debut >= 0) {
      const d = t - debut;
      total += d;
      if (d > 0.5) n05++;
      if (d > pire.duree) pire = { duree: d, t: debut };
      debut = -1;
    }
  }
  return { ...pire, total, n05 };
}

test('Best-of v4 : Analyser → Monter (2 touchers), VAD sans accord = banc, 2 persos à leur place, musique de Kevin MacLeod qui baisse sous la parole, aucun blanc > 2 s, export −14 LUFS, aperçu = export, panneau Séquences', async ({ page, context }, info) => {
  test.setTimeout(900_000);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  const requetes: string[] = [];
  context.on('request', (r) => requetes.push(r.url()));
  const versHf: string[] = [];
  await context.route(/^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//, (route) => (versHf.push(route.request().url()), route.abort()));

  const s = sessionV4();
  const dossier = mkdtempSync(join(tmpdir(), 'arko-best-of-v4-'));
  const mp4 = video(dossier, s.son, s.duree, 'session-v4');
  const { emp, duree } = await importer(page, mp4);
  await poserTranscription(page, emp, duree, motsDesTours(s.tours));
  await simulerModuleWhisper(page);
  await ouvrirExpress(page);

  // Réglages : Best-of déjà choisi (retenu), « Tout est prêt », rien à télécharger, détail replié.
  await expect(page.getByTestId('express-style-bestOf')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('express-pret')).toBeVisible();
  await expect(page.getByTestId('express-pret')).toContainText('Musique de fond');
  await expect(page.getByTestId('express-module-propose')).toHaveCount(0);
  await expect(page.getByTestId('express-plus-reglages')).not.toHaveAttribute('open', '');
  await capture(page, info, 'qa-1-reglages', true);

  // Toucher 1 : « Analyser ma vidéo » → la revue, sans carte d'accord.
  let touchers = 0;
  const debut = Date.now();
  await page.getByTestId('express-lancer').click();
  touchers++;
  await expect(page.getByTestId('express-revue')).toBeVisible({ timeout: 300_000 });
  await expect(page.getByTestId('express-carte-modules')).toHaveCount(0);
  console.log(`[v4] analyse en ${((Date.now() - debut) / 1000).toFixed(1)} s ; ${await page.getByTestId('express-total').textContent()}`);
  await expect(page.getByTestId('express-revue')).toHaveAttribute('data-v4', '1');
  await expect(page.getByTestId('express-bandeau-textes')).toHaveCount(0);
  await expect(page.getByTestId('express-bandeau-precision')).toHaveCount(0); // le détecteur de voix a marché
  await expect(page.getByTestId('v3-cartes-voix').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('express-voix-2')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('express-st-pour-p2')).toHaveAttribute('aria-checked', 'true'); // la voix faible
  await expect(page.getByTestId('express-empreinte')).toHaveCount(0); // 2 voix séparées au niveau : rien à proposer
  const nSeq = await page.locator('[data-testid^="express-scene-"]').count();
  expect(nSeq).toBeGreaterThanOrEqual(3);
  await capture(page, info, 'qa-3-revue', true);

  // Le détecteur de voix : lu dans l'appli (jamais sur internet), gardé dans « arko-modeles », sans accord.
  expect(requetes.some((u) => /\/arko\/modeles\/silero-vad-v5\.onnx/.test(u))).toBe(true);
  expect((await clesCache(page, 'arko-modeles')).some((u) => /\/modeles\/silero-vad-v5\.onnx\?sha=/.test(u))).toBe(true);
  expect(versHf).toEqual([]);
  // … et ses probabilités (Worker, onnxruntime-web 1 fil) sont celles du banc (onnxruntime-node) sur le même son.
  const nav = await vadGardee(page, emp);
  expect(nav?.modele).toBe('silero-vad-v5');
  const banc = await vadDuBanc(mp4, duree);
  if (!banc) console.log('[v4] onnxruntime-node absent : comparaison avec le banc sautée');
  else {
    const n = Math.min(banc.length, nav!.p.length);
    let memes = 0;
    let ecart = 0;
    for (let k = 0; k < n; k++) {
      if (banc[k]! >= 128 === nav!.p[k]! >= 128) memes++;
      ecart += Math.abs(banc[k]! - nav!.p[k]!) / 255;
    }
    const segN = paroleDepuisProbas({ src: 's', pas: nav!.pas, p: Uint8Array.from(nav!.p), plages: [], modele: nav!.modele }, duree).segments;
    const segB = paroleDepuisProbas({ src: 's', pas: nav!.pas, p: banc, plages: [], modele: 'silero-vad-v5' }, duree).segments;
    const bords = segN.flatMap((x) => [x.de, x.a]);
    const bordsB = segB.flatMap((x) => [x.de, x.a]);
    const pireBord = bords.length === bordsB.length ? Math.max(0, ...bords.map((b, i) => Math.abs(b - bordsB[i]!))) : Infinity;
    console.log(`[v4] VAD navigateur / banc : même décision sur ${((100 * memes) / n).toFixed(2)} % des ${n} cases, écart moyen ${(ecart / n).toFixed(4)} ; segments ${segN.length} / ${segB.length}, pire bord ${pireBord.toFixed(3)} s`);
    expect(memes / n).toBeGreaterThan(0.98);
    expect(segN.length).toBe(segB.length);
    expect(pireBord).toBeLessThanOrEqual(0.1);
  }

  // Toucher 2 : « Monter la vidéo » → Habiller, avec la musique (crédit de Kevin MacLeod rappelé).
  await page.getByTestId('express-monter').click();
  touchers++;
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 120_000 });
  await expect(page.getByTestId('toast')).toContainText('Best-of prêt');
  await expect(page.getByTestId('toast')).toContainText('Kevin MacLeod');
  expect(touchers).toBe(2);
  await expect.poll(async () => (await lireRecette(page))?.titre, { timeout: 10_000 }).toBe('Best-of — session-v4');
  const r = (await lireRecette(page))!;
  writeFileSync(info.outputPath('recette.json'), JSON.stringify({ recette: r, tours: s.tours, explosion: s.explosion }, null, 1));
  console.log(`[v4] ${r.plans.length} plans, ${r.paroles?.length} phrases, ${r.chapitres?.length ?? 0} chapitres, musique ${r.musique?.morceaux.length} morceaux, pour = ${r.sousTitres?.pour}`);

  // 2 voix, la faible sous-titrée ; persos tenus 0,35 s (DA).
  expect(r.personnes?.map((p) => p.id)).toEqual(['p1', 'p2']);
  expect(r.avatars).toEqual({ mode: 'parle', rebond: true, tenue: 0.35 });
  expect(r.sousTitres).toMatchObject({ mode: 'punchlines', pour: 'p2' });
  expect(r.sons.some((x) => x.role === 'bruitage')).toBe(false);
  expect(r.volumeFinal).toEqual({ lufs: -13, crete: -1.5 });
  // Musique d'office : les morceaux de Kevin MacLeod (servis par le serveur de test), après l'accroche, baisse sur la parole.
  const musique = r.musique!;
  expect(musique.morceaux.length).toBeGreaterThanOrEqual(1);
  const noms = musique.morceaux.map((m) => r.sources.find((x) => x.id === m.src)?.nom ?? '?');
  console.log(`[v4] musique : ${musique.morceaux.map((m, i) => `${noms[i]} à ${m.t.toFixed(2)} s`).join(' ; ')}`);
  expect(noms.every((n) => n.startsWith('Kevin MacLeod - '))).toBe(true);
  expect(requetes.some((u) => /\/arko\/musiques\/kevin-macleod\/.+\.m4a/.test(u))).toBe(true);
  expect(musique.baisseSur).toBe('parole');
  const finAccroche = musique.morceaux[0]!.t;
  expect(finAccroche).toBeGreaterThan(3);
  expect(finAccroche).toBeLessThan(12);
  // Aucun blanc > 2 s (ni voix ni explosion), d'après les plans et la vérité.
  const blanc = plusLongBlanc(r, s);
  console.log(`[v4] blancs : le plus long ${blanc.duree.toFixed(2)} s (à ${blanc.t.toFixed(1)} s), ${blanc.n05} de plus de 0,5 s, ${blanc.total.toFixed(1)} s en tout sur ${dureeSortie(r).toFixed(1)} s`);
  expect(blanc.duree).toBeLessThanOrEqual(2);
  // Les silences de 30 s entre les scènes ne sont pas dans le montage.
  for (const [de, a] of [[41, 69], [133, 164]] as const) expect(r.plans.filter((p) => p.a > de + 1 && p.de < a - 1)).toEqual([]);
  await capture(page, info, 'qa-4-habiller');

  // Un seul Annuler revient à la vidéo brute ; Rétablir remet le Best-of.
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  const dureeMontage = (await page.getByTestId('duree-finale').textContent())!;
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('plan-1')).toHaveCount(0);
  await expect(page.getByTestId('duree-finale')).toContainText(/4\s*min/);
  await page.getByTestId('retablir').click();
  await expect(page.getByTestId('plan-1')).toBeVisible();
  await expect(page.getByTestId('duree-finale')).toHaveText(dureeMontage);

  // Export 16:9 ; l'aperçu à une image où la voix faible parle seule (son perso à droite, sa boîte).
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  const echantillons = sortieVersSource(r, s.tours, 0.6);
  const t1 = echantillons.find((e) => e.qui === 0 && e.motFaible && e.t > 8) ?? echantillons.find((e) => e.qui === 0 && e.t > 8)!;
  expect(t1).toBeTruthy();
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < Math.floor(t1.t); i++) await tete.press('PageUp');
  await page.waitForTimeout(1500);
  const tApercu = Math.floor(t1.t);
  const url = await page.getByTestId('apercu').locator('canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL('image/png'));
  const apercu = Buffer.from(url.split(',')[1]!, 'base64');
  await capture(page, info, 'qa-5-montage-voix-faible');
  const t2 = echantillons.find((e) => e.qui === 1 && e.t > 8);
  if (t2) {
    await tete.press('Home');
    for (let i = 0; i < Math.floor(t2.t); i++) await tete.press('PageUp');
    await page.waitForTimeout(1500);
    await capture(page, info, 'qa-5-montage-voix-forte');
  }
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  const t0 = Date.now();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 600_000 });
  console.log(`[v4] export en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const bilan = page.getByTestId('auto-bilan-volume');
  await expect(bilan).toContainText('LUFS');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const sortie = info.outputPath('best-of-v4.mp4');
  await dl.saveAs(sortie);
  const input = new Input({ source: new FilePathSource(sortie), formats: ALL_FORMATS });
  const piste = await input.getPrimaryVideoTrack();
  const v = { l: piste!.displayWidth, h: piste!.displayHeight, duree: await input.computeDuration() };
  input.dispose();
  const texte = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', sortie, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf-8' }).stderr;
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(texte.slice(texte.lastIndexOf('Summary:')))?.[1]);
  console.log(`[v4] ${v.l} × ${v.h}, ${v.duree.toFixed(2)} s (montage ${dureeSortie(r).toFixed(2)} s) ; Arko ${await bilan.getAttribute('data-lufs')} LUFS ; ffmpeg ${lufs} LUFS`);
  expect(v.l).toBe(1920);
  expect(v.h).toBe(1080);
  expect(Math.abs(v.duree - dureeSortie(r))).toBeLessThan(0.5);
  expect(Math.abs(lufs + 14)).toBeLessThanOrEqual(1);

  // 2 persos à leur place, image par image (10 % de ratés tolérés aux changements de tour, voir verifierPersos).
  const b = await verifierPersos(sortie, echantillons, (t) => info.outputPath(`image-${t.toFixed(2)}.png`));
  console.log(`[v4] persos justes : voix faible ${b.faible.ok}/${b.faible.n}, voix forte ${b.forte.ok}/${b.forte.n} ; boîte ${b.boite}/${b.motsFaibles} mots faibles, ${b.boiteSurForte} sur la voix forte ; ratés : ${b.rates.join(' ; ') || 'aucun'}`);
  expect(b.faible.n).toBeGreaterThanOrEqual(3);
  expect(b.forte.n).toBeGreaterThanOrEqual(3);
  expect(b.faible.ok).toBeGreaterThanOrEqual(0.9 * b.faible.n);
  expect(b.forte.ok).toBeGreaterThanOrEqual(0.9 * b.forte.n);
  expect(b.boiteSurForte).toBeLessThanOrEqual(0.1 * b.forte.n);
  expect(b.boite).toBeGreaterThanOrEqual(b.motsFaibles * 0.6);

  // La musique dans l'export, pendant la voix FAIBLE seule (sous la voix forte, la musique baissée est 18 dB plus bas
  // que la voix : rien à mesurer). Puissance de l'export − puissance du son de la vidéo aux mêmes instants (connu : on
  // l'a fabriqué ; × le gain de la chaîne, mesuré sur l'accroche qui n'a pas de musique) = la musique ; comparée au
  // morceau lui-même au même instant et au volume de la piste → la baisse. Le chiffre exact (−8 dB) est vérifié dans
  // le vrai mixeur par baisse-parole.test.ts ; ici, la chaîne entière, à ± 3 dB (codeur AAC, estimation du gain).
  const W = 0.2;
  const fin = dureeSortie(r);
  const exporte = decoderMono(sortie, undefined, 16000);
  const pw = (db: number) => 10 ** (db / 10);
  const mediane = (x: number[]) => (x.length ? [...x].sort((a, b) => a - b)[Math.floor(x.length / 2)]! : NaN);
  const continu = (t: number) => {
    const a = versSource(r.plans, t - 0.05);
    const z = versSource(r.plans, t + W + 0.05);
    return a !== null && z !== null && Math.abs(z - a - W - 0.1) < 0.01 ? versSource(r.plans, t)! : null;
  };
  const voixA = (t: number, v: 0 | 1, marge = 0.1) => {
    const ts = versSource(r.plans, t);
    return ts !== null && s.tours.some((x) => x.v === v && ts >= x.de + marge && ts < x.a - marge);
  };
  const faibleSeule = (t: number) => {
    if (!voixA(t, 0) || !voixA(t + W, 0)) return false;
    for (let u = t - 0.6; u <= t + W + 0.3; u += 0.05) if (voixA(u, 1, -0.05)) return false;
    return true;
  };
  const gains: number[] = [];
  for (let t = 0.3; t + W < finAccroche - 0.3; t += W) {
    const ts = continu(t);
    if (ts === null) continue;
    const src = rmsDb(s.son, ts, ts + W, 16000);
    if (src > -45) gains.push(rmsDb(exporte, t, t + W, 16000) - src);
  }
  const gain = mediane(gains);
  /** Export / son de la vidéo seul (dB) et puissance de ce qui reste (la musique), dans [t, t + W[. */
  const reste = (t: number, ts: number) => {
    const e = pw(rmsDb(exporte, t, t + W, 16000));
    const v = pw(rmsDb(s.son, ts, ts + W, 16000) + gain);
    return { rapport: 10 * Math.log10(e / v), db: 10 * Math.log10(Math.max(1e-12, e - v)) };
  };
  const accroche: number[] = [];
  for (let t = 0.3; t + W < finAccroche - 0.6; t += W) {
    const ts = continu(t);
    if (ts !== null && faibleSeule(t)) accroche.push(reste(t, ts).rapport);
  }
  const fichierKml = (nom: string) => {
    const slug = (x: string) => x.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const titre = slug(nom.replace(/^Kevin MacLeod - /, '').replace(/\.m4a$/, ''));
    const f = ['carefree', 'divertissement', 'fluffing-a-duck', 'hidden-agenda', 'investigations', 'monkeys-spinning-monkeys', 'pixel-peeker-polka-faster', 'scheming-weasel-faster', 'sneaky-snitch'].find((x) => titre.startsWith(x) || x.startsWith(titre));
    return `public/musiques/kevin-macleod/${f}.m4a`;
  };
  const vol = 20 * Math.log10(musique.vol ?? 0.14);
  const apres: number[] = [];
  const baisses: number[] = [];
  musique.morceaux.forEach((m, i) => {
    const piste = decoderMono(fichierKml(noms[i]!), undefined, 16000);
    const dp = piste.length / 16000;
    const finM = m.fin ?? musique.morceaux[i + 1]?.t ?? fin;
    for (let t = m.t + 1.7; t + W < finM - 1.7; t += W) {
      const ts = continu(t);
      if (ts === null || !faibleSeule(t)) continue;
      let tau = t - m.t + (m.debut ?? 0);
      if (tau >= dp) tau %= dp;
      if (tau + W > dp) continue;
      const ref = rmsDb(piste, tau, tau + W, 16000);
      if (ref < -40) continue; // un silence du morceau
      const x = reste(t, ts);
      apres.push(x.rapport);
      baisses.push(x.db - ref - vol - gain);
    }
  });
  // La commande de la baisse : les tours de parole de la recette couvrent-ils la parole vraie gardée ?
  const couverture = (v: 0 | 1) => {
    let n = 0;
    let oui = 0;
    for (const x of s.tours.filter((y) => y.v === v))
      for (let ts = x.de; ts < x.a; ts += 0.02)
        if (r.plans.some((p) => p.de <= ts && ts < p.a)) {
          n++;
          if ((r.paroles ?? []).some((p) => p.ts - 0.05 <= ts && ts < p.fin + 0.05)) oui++;
        }
    return n ? oui / n : 0;
  };
  console.log(`[v4] musique (voix faible seule) : gain de la chaîne ${gain.toFixed(1)} dB (${gains.length}) ; export / vidéo seule : accroche ${mediane(accroche).toFixed(2)} dB (max ${Math.max(-99, ...accroche).toFixed(2)}, ${accroche.length}), après ${mediane(apres).toFixed(2)} dB (${apres.length}) ; baisse médiane ${mediane(baisses).toFixed(1)} dB ; parole vraie couverte par les tours (commande de la baisse) : voix faible ${(100 * couverture(0)).toFixed(0)} %, forte ${(100 * couverture(1)).toFixed(0)} %`);
  expect(gains.length).toBeGreaterThanOrEqual(5);
  expect(apres.length).toBeGreaterThanOrEqual(20);
  if (accroche.length >= 3) expect(Math.max(...accroche)).toBeLessThan(0.25); // pas de musique pendant l'accroche
  expect(mediane(apres)).toBeGreaterThan(Math.max(0.3, mediane(accroche) + 0.3)); // la musique est là ensuite
  expect(mediane(baisses)).toBeLessThan(-5); // baissée sous la voix faible (−40 dB)
  expect(mediane(baisses)).toBeGreaterThan(-16);
  expect(musique.morceaux.at(-1)!.fin ?? fin).toBeGreaterThanOrEqual(fin - 0.5); // jusqu'à la fin
  // Silero n'entend qu'≈ 65 % de la voix faible FABRIQUÉE sous la musique de jeu (mesuré, banc = navigateur) ; la voix
  // forte : 99 %. Sur la vraie session : 100 % / 100 % de la parole de Romain et Guts baissée (rapport intégrateur).
  expect(couverture(1)).toBeGreaterThan(0.85);
  expect(couverture(0)).toBeGreaterThan(0.6);

  // Aperçu = export sur une image avec un perso.
  const exportee = await sharp(png(sortie, tApercu, info.outputPath('image-apercu-export.png'))).removeAlpha().resize(480, 270, { fit: 'fill' }).raw().toBuffer();
  const vue = await sharp(apercu).removeAlpha().resize(480, 270, { fit: 'fill' }).raw().toBuffer();
  const db = psnr(exportee, vue);
  console.log(`[v4] aperçu / export à ${tApercu} s : PSNR ${db.toFixed(1)} dB`);
  expect(db).toBeGreaterThan(25);

  // Habiller → Couper → le panneau Séquences (une par chapitre) : descendre, retirer ; un Annuler chacun.
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('outil-couper').click();
  const panneau = page.getByTestId('sequences-montage');
  await expect(panneau).toBeVisible();
  await expect(page.getByTestId('sequence-1')).toBeVisible();
  const chap0 = (await lireRecette(page))!.chapitres!.map((c) => c.nom);
  const plans0 = JSON.stringify((await lireRecette(page))!.plans);
  await page.getByTestId('sequence-descendre-0').click();
  await expect.poll(async () => (await lireRecette(page))!.chapitres!.map((c) => c.nom)).toEqual([chap0[1], chap0[0], ...chap0.slice(2)]);
  await panneau.scrollIntoViewIfNeeded();
  await capture(page, info, 'qa-6-couper-sequences');
  await page.getByTestId('annuler').click();
  await expect.poll(async () => JSON.stringify((await lireRecette(page))!.plans)).toBe(plans0);
  const passages0 = (await lireRecette(page))!.derush?.passages.length ?? 0;
  await page.getByTestId('sequence-retirer-1').click();
  await expect(page.getByTestId('toast')).toContainText('Passages pas retenus');
  await expect.poll(async () => (await lireRecette(page))!.chapitres!.length).toBe(chap0.length - 1);
  expect((await lireRecette(page))!.derush?.passages.length ?? 0).toBeGreaterThan(passages0);
  await page.getByTestId('annuler').click();
  await expect.poll(async () => JSON.stringify((await lireRecette(page))!.plans)).toBe(plans0);
  expect(versHf).toEqual([]);
  expect(erreurs).toEqual([]);
});

test('Best-of v4 sans module sous-titres ni réseau : carte « Pas maintenant » → bandeau, revue modifiable (± 1 phrase, décocher, déplacer), un seul Annuler, musique d’Arko ; Habiller : rythme des coupes, séquences, émotion, musique', async ({ page, context }, info) => {
  test.setTimeout(600_000);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  const versHf: string[] = [];
  await context.route(/^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//, (route) => (versHf.push(route.request().url()), route.abort()));

  const s = sessionV4();
  const dossier = mkdtempSync(join(tmpdir(), 'arko-best-of-v4-'));
  const mp4 = video(dossier, s.son, s.duree, 'session-v4');
  await importer(page, mp4);
  await ouvrirExpress(page);
  await expect(page.getByTestId('express-style-bestOf')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('express-module-propose')).toContainText('module sous-titres');

  // La carte d'accord : seulement le module sous-titres (≈ 90 Mo) ; rien n'est lancé avant la réponse.
  await page.getByTestId('express-lancer').click();
  const carte = page.getByTestId('express-carte-modules');
  await expect(carte).toBeVisible();
  await expect(carte).toHaveAttribute('data-phase', 'proposer');
  await expect(carte).toContainText(/9\d\s*Mo/);
  await expect(carte).not.toContainText(/détecteur de voix/i);
  await expect(page.getByTestId('express-reglages')).toBeVisible();
  await capture(page, info, 'qa-2-carte-whisper');
  await page.getByTestId('express-carte-pas-maintenant').click();
  await expect(page.getByTestId('express-revue')).toBeVisible({ timeout: 300_000 });
  await expect(page.getByTestId('express-bandeau-textes')).toBeVisible();
  await expect(page.getByTestId('express-bandeau-telecharger')).toBeVisible();
  await expect(page.getByTestId('express-bandeau-precision')).toHaveCount(0);
  await expect(page.getByTestId('v3-cartes-voix').locator('li')).toHaveCount(2);
  await capture(page, info, 'qa-3-revue-sans-module', true);

  // Revue : décocher la dernière séquence (la durée baisse), la recocher, puis la monter d'un cran.
  const seqs = page.locator('[data-testid^="express-scene-"]');
  const n = await seqs.count();
  expect(n).toBeGreaterThanOrEqual(2);
  const plage = async (i: number) => {
    const t = (await page.getByTestId(`express-scene-${i}`).locator('.express-scene-textes .chiffres').textContent())!;
    const [de, a] = t.split('→').map((x) => x.trim().split(' ')[0]!).map((x) => x.split(':').reduce((acc, v) => acc * 60 + Number(v), 0));
    return { de: de!, a: a! };
  };
  const tous = Array.from({ length: n }, (_, i) => i);
  // « Régler » : une phrase de moins au début de la 1ʳᵉ séquence, puis une de plus (retour au départ).
  const s0 = await plage(0);
  await page.getByTestId('express-regler-0').click();
  await expect(page.getByTestId('express-reglage-0')).toBeVisible();
  await page.getByTestId('express-debut-moins-0').click();
  await expect.poll(async () => (await plage(0)).de).toBeGreaterThan(s0.de);
  console.log(`[v4 sans module] « − 1 phrase » au début : ${s0.de} → ${(await plage(0)).de} s`);
  await page.getByTestId('express-debut-plus-0').click();
  await expect.poll(async () => (await plage(0)).de).toBe(s0.de);
  await page.getByTestId('express-regler-0').click();
  const avant = await Promise.all(tous.map(plage));
  const total0 = Number(await page.getByTestId('express-total').getAttribute('data-secondes'));
  const der = n - 1;
  await page.getByTestId(`express-cocher-${der}`).click();
  await expect(page.getByTestId(`express-cocher-${der}`)).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => Number(await page.getByTestId('express-total').getAttribute('data-secondes'))).toBeLessThan(total0);
  await page.getByTestId(`express-cocher-${der}`).click();
  await expect.poll(async () => Number(await page.getByTestId('express-total').getAttribute('data-secondes'))).toBe(total0);
  await page.getByTestId(`express-haut-${der}`).click();
  const apres = await Promise.all(tous.map(plage));
  expect(apres[der - 1]).toEqual(avant[der]);
  expect(apres[der]).toEqual(avant[der - 1]);
  console.log(`[v4 sans module] séquences : ${avant.map((x) => `${x.de}–${x.a}`).join(', ')} → ${apres.map((x) => `${x.de}–${x.a}`).join(', ')}`);

  // Montage SANS réseau : la musique fabriquée par Arko prend le relais.
  await context.setOffline(true);
  await page.getByTestId('express-monter').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 120_000 });
  await expect(page.getByTestId('toast')).toContainText('Best-of prêt');
  await expect.poll(async () => (await lireRecette(page))?.titre, { timeout: 10_000 }).toBe('Best-of — session-v4');
  const r = (await lireRecette(page))!;
  writeFileSync(info.outputPath('recette.json'), JSON.stringify({ recette: r, tours: s.tours }, null, 1));
  const noms = r.musique!.morceaux.map((m) => r.sources.find((x) => x.id === m.src)?.nom ?? '?');
  console.log(`[v4 sans module] ${r.plans.length} plans, ${r.chapitres?.length ?? 0} chapitres ; musique : ${noms.join(', ')}`);
  expect(noms.length).toBeGreaterThanOrEqual(1);
  expect(noms.every((x) => x.startsWith('Musique Arko - '))).toBe(true);
  expect(r.musique?.baisseSur).toBe('parole');
  expect(r.personnes).toHaveLength(2);
  expect(r.sousTitres?.pour).toBeUndefined(); // sans mots : pas de sous-titres de la voix faible
  // L'ordre de la revue est gardé (l'accroche, prise n'importe où, est à part).
  const finAccroche = r.musique!.morceaux[0]!.t;
  const dans = (p: { de: number; a: number }, q: { de: number; a: number }) => (p.de + p.a) / 2 >= q.de - 1 && (p.de + p.a) / 2 <= q.a + 1;
  let t0 = 0;
  const ordre: number[] = [];
  for (const p of r.plans) {
    const d = (p.a - p.de) / (p.vit ?? 1) + (p.fige ?? 0);
    if (t0 >= finAccroche - 0.05) {
      const k = apres.findIndex((q) => dans(p, q));
      if (k >= 0 && ordre[ordre.length - 1] !== k) ordre.push(k); // (hors des séquences : la transition d'après l'accroche)
    }
    t0 += d;
  }
  expect(ordre).toEqual(tous);
  // Un seul Annuler revient à la vidéo brute.
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('plan-1')).toHaveCount(0);
  await page.getByTestId('retablir').click();
  await expect(page.getByTestId('plan-1')).toBeVisible();
  await context.setOffline(false);
  for (let i = 0; i < 3 && (await page.getByTestId('etape').textContent()) !== 'Étape 4 sur 5'; i++) await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');

  // Habiller → Couper : « Rythme des coupes » Serré recoupe tout le montage sans réécouter (un Annuler).
  await expect.poll(async () => JSON.stringify((await lireRecette(page))!.plans), { timeout: 10_000 }).toBe(JSON.stringify(r.plans)); // Rétablir enregistré
  const r0 = (await lireRecette(page))!;
  await page.getByTestId('outil-couper').click();
  await expect(page.getByTestId('recoupe-best-of-habiller')).toBeVisible();
  await expect(page.getByTestId('recoupe-habiller-normal')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('recoupe-habiller-serre').click();
  await expect(page.getByTestId('recoupe-habiller-serre')).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('toast')).toContainText('appliquées');
  // (le projet est enregistré un peu après : on attend la recette recoupée)
  await expect.poll(async () => (await lireRecette(page))!.blancs?.niveau, { timeout: 10_000 }).toBe('serre');
  const rSerre = (await lireRecette(page))!;
  console.log(`[v4 sans module] rythme des coupes : Normal ${r0.plans.length} plans, ${dureeSortie(r0).toFixed(1)} s → Serré ${rSerre.plans.length} plans, ${dureeSortie(rSerre).toFixed(1)} s`);
  expect(JSON.stringify(rSerre.plans)).not.toBe(JSON.stringify(r0.plans));
  expect(dureeSortie(rSerre)).toBeLessThan(dureeSortie(r0));
  await capture(page, info, 'qa-6-couper-rythme');
  await page.getByTestId('annuler').click();
  await expect.poll(async () => JSON.stringify((await lireRecette(page))!.plans)).toBe(JSON.stringify(r0.plans));
  await expect(page.getByTestId('recoupe-habiller-normal')).toHaveAttribute('aria-checked', 'true');
  // Sans mots, le Best-of n'a pas de chapitres : le panneau Séquences n'est pas là (il est vérifié dans le 1er test).
  await expect(page.getByTestId('sequences-montage')).toHaveCount(r0.chapitres && r0.chapitres.length >= 2 ? 1 : 0);
  await page.getByTestId('panneau-fermer').click();

  // Habiller → Avatars → « Qui parle ? » : le menu Émotion d'une phrase (Valider = un Annuler).
  await page.getByTestId('outil-avatars').click();
  await page.getByTestId('v3-qui-parle').click();
  await expect(page.getByTestId('v3-qp-phrases')).toBeVisible({ timeout: 120_000 });
  const menu = page.getByTestId('v3-qp-emotion-0');
  await expect(menu).toBeVisible();
  const ts0 = Number(await page.getByTestId('v3-qp-phrase-0').getAttribute('data-ts'));
  const emoAvant = await menu.inputValue();
  const emoApres = emoAvant === 'rage' ? 'pleure' : 'rage';
  await menu.selectOption(emoApres);
  await page.getByTestId('v3-qp-phrase-0').scrollIntoViewIfNeeded();
  await capture(page, info, 'qa-7-qui-parle-emotion');
  await page.getByTestId('v3-qp-valider').click();
  await expect(page.getByTestId('v3-qui-parle-ecran')).toHaveCount(0);
  await expect.poll(async () => (await lireRecette(page))!.paroles!.find((p) => Math.abs(p.ts - ts0) < 0.6)?.emo).toBe(emoApres);
  await page.getByTestId('annuler').click();
  await expect.poll(async () => (await lireRecette(page))!.paroles!.find((p) => Math.abs(p.ts - ts0) < 0.6)?.emo).not.toBe(emoApres);
  await page.getByTestId('panneau-fermer').click();

  // Habiller → Sons → Musique : Remplacer le 1er morceau par une musique de l'onglet « Musiques d'Arko ».
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('auto-musique').click();
  await expect(page.getByTestId('panneau-musique')).toBeVisible();
  await expect(page.getByTestId('musique-morceau-0')).toBeVisible();
  const src0 = (await lireRecette(page))!.musique!.morceaux[0]!.src;
  await page.getByTestId('musique-remplacer-0').click();
  await expect(page.getByTestId('musique-remplacer-aide')).toBeVisible();
  await page.locator('#musique-rayon-onglet-arko').click();
  await expect(page.getByTestId('musique-arko')).toBeVisible();
  await expect(page.getByTestId('musique-arko-kevin:carefree')).toBeVisible();
  await page.getByTestId('musique-arko-kevin:carefree').scrollIntoViewIfNeeded();
  await capture(page, info, 'qa-8-musique-arko');
  await page.getByTestId('musique-arko-ajouter-arko:calme:2').click();
  await expect.poll(async () => (await lireRecette(page))!.musique!.morceaux[0]!.src, { timeout: 30_000 }).not.toBe(src0);
  const r2 = (await lireRecette(page))!;
  expect(r2.musique!.morceaux).toHaveLength(r.musique!.morceaux.length); // remplacé à la même place
  expect(r2.sources.find((x) => x.id === r2.musique!.morceaux[0]!.src)?.nom).toBe('Musique Arko - Fin calme 2.wav');
  await page.getByTestId('annuler').click();
  await expect.poll(async () => (await lireRecette(page))!.musique!.morceaux[0]!.src).toBe(src0);
  expect(versHf).toEqual([]);
  expect(erreurs).toEqual([]);
});

test('Best-of v4 : 2 voix au même niveau → l’empreinte de voix (CAM++) proposée, téléchargée après accord, calculée dans son Worker', async ({ page, context }, info) => {
  test.skip(!existsSync(CAMPLUS_LOCAL), `modèle CAM++ absent (${CAMPLUS_LOCAL}) : servi en local seulement, jamais dans le dépôt`);
  test.setTimeout(600_000);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  const versHf: string[] = [];
  await context.route(/^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//, (route) => {
    const u = route.request().url();
    versHf.push(u);
    if (!URL_CAMPLUS.test(u)) return route.abort();
    const corps = readFileSync(CAMPLUS_LOCAL);
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': String(corps.length), 'access-control-allow-origin': '*' }, body: corps });
  });
  // 90 s, 2 voix au MÊME niveau (−30 dB), timbres différents.
  const D = 90;
  const tours: TourVrai[] = toursAlternes(D, 21);
  const son = mixer(fabriquerVoix(VOIX_A, tours.filter((t) => t.v === 0), D, -30, 1), fabriquerVoix(VOIX_DISCORD, tours.filter((t) => t.v === 1), D, -30, 2));
  const dossier = mkdtempSync(join(tmpdir(), 'arko-best-of-v4-'));
  const mp4 = video(dossier, son, D, 'meme-niveau');
  await importer(page, mp4);
  await ouvrirExpress(page);
  await page.getByTestId('express-lancer').click();
  await page.getByTestId('express-carte-pas-maintenant').click();
  await expect(page.getByTestId('express-revue')).toBeVisible({ timeout: 300_000 });
  const proposition = page.getByTestId('express-empreinte');
  await expect(proposition).toBeVisible();
  await expect(proposition).toHaveAttribute('data-phase', 'rien');
  console.log(`[v4 empreinte] avant : ${await page.getByTestId('v3-cartes-voix').locator('li').count()} voix ; « ${await proposition.textContent()} »`);
  expect(versHf).toEqual([]); // rien avant l'accord
  await capture(page, info, 'qa-9-empreinte-proposee', true);
  const t0 = Date.now();
  const phases = new Set<string>();
  await page.getByTestId('express-empreinte-oui').click();
  for (let i = 0; i < 600 && (await proposition.count()) > 0; i++) {
    const ph = await proposition.getAttribute('data-phase').catch(() => null);
    if (ph) phases.add(ph);
    await page.waitForTimeout(100);
  }
  await expect(proposition).toHaveCount(0, { timeout: 300_000 }); // phase « faite » (une erreur la laisserait visible)
  const message = (await page.getByTestId('toast').textContent()) ?? '';
  const nVoix = await page.getByTestId('v3-cartes-voix').locator('li').count();
  console.log(`[v4 empreinte] téléchargement + calcul en ${((Date.now() - t0) / 1000).toFixed(1)} s (phases vues : ${[...phases].join(' → ')}) ; après : ${nVoix} voix ; « ${message} » ; requêtes huggingface : ${versHf.length}`);
  expect(versHf.filter((u) => URL_CAMPLUS.test(u))).toHaveLength(1); // une fois, à la révision figée
  expect((await clesCache(page, 'arko-modeles')).some((u) => URL_CAMPLUS.test(u))).toBe(true); // gardé sur l'appareil
  // Les voix FABRIQUÉES se ressemblent trop pour CAM++ (cosinus 0,80 à 0,96 entre les centres, mesuré par la QA ; il
  // en faut < 0,68) : le message doit dire honnêtement ce qui a été trouvé.
  expect(message).toContain(nVoix >= 2 ? 'Voix séparées' : 'une voix');
  await capture(page, info, 'qa-9-empreinte-faite', true);
  expect(erreurs).toEqual([]);
});
