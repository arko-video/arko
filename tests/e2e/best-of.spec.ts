// Best-of serré (intégrateur, contrat-wankil §6) dans Chrome headless, au format téléphone, en YouTube 16:9.
// 1. Session fabriquée de 3 min 25 (fond bleu 1280 × 720) : 2 voix synthétiques dans UN mélange, comme la session de
//    Romain (voix « micro » à −40 dB, voix « Discord » à −25 dB), bruit de jeu, un fou rire de 4 s ; deux scènes
//    (0–22 s, puis 50–200 s : 150 s d'échanges) ; les mots posés comme une transcription déjà faite ; une musique
//    « Kevin MacLeod » dans Mes sons. v4 : la voix forte est VOIX_DISCORD (le détecteur de voix entend mal VOIX_B).
// 2. Mes montages → ⋮ → Montage express → style « Best-of serré » (v4 : coupe Normal d'office, réglages repliés sous
//    « Changer les réglages », titres décochés d'office ; module sous-titres SIMULÉ, transcription déjà posée) → revue :
//    2 voix (p1 = la voix FORTE, p2 = la voix faible), chibi par défaut, noms, « Sous-titres pour : » = la voix faible
//    (p2) → « Monter la vidéo ».
// 3. Recette : pas de titre, avatars, chibis, sous-titres pour la voix faible, passages pas retenus (v4 : la séquence
//    décochée sur la revue), pas de bruitage ;
//    un seul Annuler revient à la vidéo brute ; « Passages pas retenus » → Ajouter (un seul Annuler).
// 4. Export 1920 × 1080 sans erreur, −14 LUFS ± 1 ; dans les images : l'avatar de la voix qui parle (v4 : la voix
//    forte en bas à GAUCHE, la voix faible à DROITE), la boîte des sous-titres seulement quand la voix faible parle ;
//    aperçu = export (PSNR) sur une image avec avatar.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import sharp from 'sharp';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'node:process';
import { bruitDeJeu, fabriquerVoix, FREQ_TEST, mixer, toursAlternes, VOIX_A, type TourVrai } from '../../src/auto/voix/voix-test';
import { lireRecette, motsDesTours, png, poserTranscription, psnr, simulerModuleWhisper, sortieVersSource, verifierPersos, VOIX_DISCORD, wav16k, wavStereo, zipStocke } from './outils-best-of';

const port = Number(env.ARKO_PORT) || 4173;
const DUREE = 205;
const RIRE = { de: 150, a: 154 };

test.use({
  actionTimeout: 20_000,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  storageState: { cookies: [], origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'arko.destination', value: 'youtube' }] }] },
});

async function capture(page: Page, info: TestInfo, nom: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath(`${nom}.png`), fullPage: true });
  if (env.ARKO_CAPTURES) await page.screenshot({ path: `${env.ARKO_CAPTURES}/${nom}.png`, fullPage: true });
}

/** Tours vrais : scène 1 (0–22 s) et scène 2 (50–200 s) ; voix 0 = « micro » (faible), voix 1 = « Discord ». */
function toursVrais(): TourVrai[] {
  const decaler = (l: TourVrai[], d: number) => l.map((t) => ({ ...t, de: t.de + d, a: t.a + d }));
  return [...toursAlternes(22, 3), ...decaler(toursAlternes(150, 5), 50)];
}

function fabriquer(dossier: string, tours: TourVrai[]): string {
  const a = fabriquerVoix(VOIX_A, tours.filter((t) => t.v === 0), DUREE, -40, 1);
  // Voix forte : VOIX_DISCORD (le détecteur de voix v4 n'entend presque pas VOIX_B, voir outils-best-of.ts).
  const b = fabriquerVoix(VOIX_DISCORD, tours.filter((t) => t.v === 1), DUREE, -25, 2);
  // Fou rire : son haché à 5 Hz (« ha-ha-ha »), fort, pendant 4 s.
  const rire = new Float32Array(DUREE * FREQ_TEST);
  for (let i = RIRE.de * FREQ_TEST; i < RIRE.a * FREQ_TEST; i++) {
    const t = i / FREQ_TEST;
    rire[i] = 0.35 * Math.max(0, Math.sin(2 * Math.PI * 5 * t)) * (Math.sin(2 * Math.PI * 420 * t) + 0.5 * Math.sin(2 * Math.PI * 840 * t));
  }
  const son = join(dossier, 'son.wav');
  writeFileSync(son, wav16k(mixer(a, b, rire, bruitDeJeu(DUREE, -52))));
  const mp4 = join(dossier, 'session-best-of.mp4');
  execFileSync('ffmpeg', [
    ...'-y -v error -f lavfi'.split(' '),
    '-i', `color=c=0x2040C0:s=1280x720:r=15:d=${DUREE}`,
    '-i', son,
    ...'-map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 30 -g 30 -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 160k -shortest'.split(' '),
    mp4,
  ]);
  return mp4;
}

test('Best-of serré : 2 voix (−40 / −25 dB) + musique → avatars, sous-titres de la voix faible, pas de titre, export −14 LUFS, passages pas retenus', async ({ page }, info) => {
  test.setTimeout(900_000);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  const dossier = mkdtempSync(join(tmpdir(), 'arko-best-of-'));
  const tours = toursVrais();
  const mp4 = fabriquer(dossier, tours);
  const mots = motsDesTours(tours);

  // 1. La vidéo, puis la musique dans Mes sons, puis la transcription déjà faite.
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(mp4);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await page.getByTestId('outil-sons').click();
  const pack = join(dossier, 'pack.zip');
  writeFileSync(pack, zipStocke([{ nom: 'Pack/Musique/Kevin MacLeod - Sneaky Test.wav', donnees: wavStereo([220, 277, 330], 12, 0.6) }]));
  await page.getByTestId('mes-sons-fichiers').setInputFiles([pack]);
  await expect(page.getByTestId('toast')).toContainText('1 son gardé', { timeout: 30_000 });
  await expect.poll(async () => !!(await lireRecette(page)), { timeout: 10_000 }).toBe(true);
  const { emp, duree } = (await lireRecette(page))!.sources[0]!;
  await poserTranscription(page, emp, duree, mots);
  // v4 : sans module sous-titres, la carte d'accord s'ouvre (best-of-v4.spec.ts) ; ici il est simulé (déjà là).
  await simulerModuleWhisper(page);

  // 2. Mes montages → ⋮ → Montage express → Best-of serré.
  for (let i = 0; i < 5 && !(await page.getByTestId('mes-montages').isVisible()); i++) {
    await page.getByTestId('retour').click();
    await page.waitForTimeout(300);
  }
  await page.getByTestId('montage-menu-0').click();
  await page.getByTestId('action-express').click();
  await expect(page.getByTestId('express-reglages')).toBeVisible();
  await page.getByTestId('express-style-bestOf').click();
  await expect(page.getByTestId('express-style-bestOf')).toHaveAttribute('aria-checked', 'true');
  // v4 : « Tout est prêt » ; le détail est replié sous « Changer les réglages » ; coupe Normal d'office (la DA).
  await expect(page.getByTestId('express-pret')).toBeVisible();
  await expect(page.getByTestId('express-module-propose')).toHaveCount(0); // module simulé : rien à proposer
  await page.getByTestId('express-plus-reglages').locator('summary').click();
  await expect(page.getByTestId('express-niveau-normal')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('express-musique-auto')).toBeChecked(); // musique automatique d'office
  await expect(page.getByTestId('express-bo-titres')).not.toBeChecked(); // titres facultatifs : décochés d'office
  await expect(page.getByTestId('express-bo-avatars')).toBeChecked();
  await expect(page.getByTestId('express-bo-qui-parle')).toBeChecked();
  await expect(page.getByTestId('express-bo-bips')).not.toBeChecked();
  await expect(page.getByTestId('express-bruitages')).toHaveCount(0); // jamais de bruitages en Best-of
  if (!(await page.getByTestId('express-transcrire').isChecked())) await page.getByTestId('express-transcrire').click();
  if (await page.getByTestId('express-bords').isChecked()) await page.getByTestId('express-bords').click();
  await page.getByTestId('express-musique').locator('label', { hasText: 'Kevin MacLeod' }).locator('input').click();
  await capture(page, info, 'best-of-1-reglages');

  const debut = Date.now();
  await page.getByTestId('express-lancer').click();
  await expect(page.getByTestId('express-revue')).toBeVisible({ timeout: 300_000 });
  console.log(`[best-of] analyse en ${((Date.now() - debut) / 1000).toFixed(1)} s ; ${await page.getByTestId('express-total').textContent()}`);
  await expect(page.getByTestId('express-best-of')).toBeVisible();
  // v4 : les séquences tiennent toutes dans la durée visée (rien « pas retenu » d'office, plus de « resserrée ») ;
  // on en décoche une sur la revue : elle ira dans « Passages pas retenus ».
  await expect(page.getByTestId('express-revue')).toHaveAttribute('data-v4', '1');
  await expect(page.getByTestId('express-bandeau-textes')).toHaveCount(0); // module là : pas de bandeau
  await expect(page.getByTestId('v3-cartes-voix').locator('li')).toHaveCount(2);
  // Chibi par défaut affiché (jamais « Aucun ») et bouton « Choisir un chibi ».
  await expect(page.getByTestId('v3-voix-chibi-p1-apercu')).toBeVisible();
  await expect(page.getByTestId('v3-voix-chibi-p1')).toContainText('Choisir un perso');
  // v4 : p1 = la voix FORTE (−25 dB, « Guts »), p2 = la voix faible (−40 dB, « Romain »).
  await page.getByTestId('v3-voix-nom-p1').fill('Guts');
  await page.getByTestId('v3-voix-nom-p1').press('Tab');
  await page.getByTestId('v3-voix-nom-p2').fill('Romain');
  await page.getByTestId('v3-voix-nom-p2').press('Tab');
  // La voix faible (p2, −40 dB) est sous-titrée d'office.
  await expect(page.getByTestId('express-st-pour-p2')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('express-st-pour-p2')).toHaveText('Romain');
  const nSeq = await page.locator('[data-testid^="express-scene-"]').count();
  expect(nSeq).toBeGreaterThanOrEqual(2);
  const totalAvant = Number(await page.getByTestId('express-total').getAttribute('data-secondes'));
  await page.getByTestId(`express-cocher-${nSeq - 1}`).click();
  await expect(page.getByTestId(`express-cocher-${nSeq - 1}`)).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => Number(await page.getByTestId('express-total').getAttribute('data-secondes'))).toBeLessThan(totalAvant);
  await capture(page, info, 'best-of-2-revue');

  await page.getByTestId('express-monter').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 90_000 });
  await expect(page.getByTestId('toast')).toContainText('Best-of prêt');
  await capture(page, info, 'best-of-3-habiller');

  // 3. La recette du Best-of.
  await expect.poll(async () => (await lireRecette(page))?.titre, { timeout: 10_000 }).toBe('Best-of — session-best-of');
  const r = (await lireRecette(page))!;
  writeFileSync(info.outputPath('recette.json'), JSON.stringify({ recette: r, tours }, null, 1)); // pour comprendre un échec
  console.log(`[best-of] ${r.plans.length} plans, ${r.derush?.passages.length} passages pas retenus, ${r.paroles?.length} tours, pour = ${r.sousTitres?.pour}`);
  expect(r.textes).toEqual([]); // ni « ATTENDS… » ni titre de section
  expect(r.personnes?.map((p) => p.nom)).toEqual(['Guts', 'Romain']);
  expect(r.personnes?.every((p) => !!p.chibi)).toBe(true);
  expect(r.avatars).toEqual({ mode: 'reactions', rebond: true, tenue: 0.35 });
  expect(r.sousTitres).toMatchObject({ mode: 'punchlines', pour: 'p2' });
  expect(r.derush?.passages.length).toBeGreaterThan(0);
  expect(r.sons.some((s) => s.role === 'bruitage')).toBe(false);
  expect(r.bips).toBeUndefined();
  expect(r.musique?.morceaux).toHaveLength(1);
  // Le morceau choisi à la main : après l'accroche (pas à 0:00), et la baisse suit la parole (v4).
  expect(r.musique!.morceaux[0]!.t).toBeGreaterThan(3);
  expect(r.musique?.baisseSur).toBe('parole');
  expect(r.volumeFinal).toEqual({ lufs: -13, crete: -1.5 });

  // Un seul Annuler revient à la vidéo brute ; Rétablir remet le Best-of.
  await page.getByTestId('retour').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5');
  const dureeMontage = (await page.getByTestId('duree-finale').textContent())!;
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('plan-1')).toHaveCount(0);
  await expect(page.getByTestId('duree-finale')).toContainText(/3\s*min\s*25/);
  await page.getByTestId('retablir').click();
  await expect(page.getByTestId('plan-1')).toBeVisible();
  await expect(page.getByTestId('duree-finale')).toHaveText(dureeMontage);

  // « Passages pas retenus » → Ajouter d'un toucher (un seul Annuler).
  const nPlans = (await lireRecette(page))!.plans.length;
  await page.getByTestId('v3-passages-couper').click();
  await expect(page.getByTestId('v3-passages')).toBeVisible();
  await expect(page.getByTestId('v3-passage-0')).toBeVisible();
  await capture(page, info, 'best-of-4-passages');
  await page.getByTestId('v3-passage-ajouter-0').click();
  await expect(page.getByTestId('toast')).toContainText('est ajouté au montage');
  await page.getByTestId('v3-passages-fermer').click();
  await expect.poll(async () => (await lireRecette(page))!.plans.length, { timeout: 10_000 }).toBeGreaterThan(nPlans);
  await page.getByTestId('annuler').click();
  await expect.poll(async () => (await lireRecette(page))!.plans.length, { timeout: 10_000 }).toBe(nPlans);

  // 4. Export 16:9.
  const finale = (await lireRecette(page))!;
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  // Aperçu à une image où la voix 1 parle seule (pour comparer avec l'export).
  const echantillons = sortieVersSource(finale, tours, 0.6);
  console.log(`[best-of] ${echantillons.length} images à vérifier (voix 1 : ${echantillons.filter((e) => e.qui === 0).length}, voix 2 : ${echantillons.filter((e) => e.qui === 1).length}) ; ${finale.sousTitres?.punchlines?.length ?? 0} punchlines`);
  const t1 = echantillons.find((e) => e.qui === 0 && e.t > 7)!;
  expect(t1).toBeTruthy();
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < Math.floor(t1.t); i++) await tete.press('PageUp');
  await page.waitForTimeout(1200);
  const tApercu = Math.floor(t1.t);
  const url = await page.getByTestId('apercu').locator('canvas').first().evaluate((c) => (c as HTMLCanvasElement).toDataURL('image/png'));
  const apercu = Buffer.from(url.split(',')[1]!, 'base64');
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  const t0 = Date.now();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 600_000 });
  console.log(`[best-of] export en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const bilan = page.getByTestId('auto-bilan-volume');
  await expect(bilan).toContainText('LUFS');
  await capture(page, info, 'best-of-5-export');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const sortie = info.outputPath('best-of.mp4');
  await dl.saveAs(sortie);
  const input = new Input({ source: new FilePathSource(sortie), formats: ALL_FORMATS });
  const video = await input.getPrimaryVideoTrack();
  const v = { l: video!.displayWidth, h: video!.displayHeight, duree: await input.computeDuration() };
  input.dispose();
  const texte = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', sortie, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf-8' }).stderr;
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(texte.slice(texte.lastIndexOf('Summary:')))?.[1]);
  console.log(`[best-of] ${v.l} × ${v.h}, ${v.duree.toFixed(2)} s ; Arko ${await bilan.getAttribute('data-lufs')} LUFS ; ffmpeg ${lufs} LUFS`);
  expect(v.l).toBe(1920);
  expect(v.h).toBe(1080);
  expect(Math.abs(lufs + 14)).toBeLessThanOrEqual(1);

  // Avatars et sous-titres de la voix faible, image par image (hors punchlines, hors bords de plan). v4 : voix forte
  // (p1) à GAUCHE, voix faible (p2) à DROITE ; 10 % de ratés tolérés (changements de tour, voir verifierPersos).
  const b = await verifierPersos(sortie, echantillons, (t) => info.outputPath(`image-${t.toFixed(2)}.png`));
  console.log(`[best-of] images : ${b.mesures.join(' ')}`);
  console.log(`[best-of] persos justes : voix faible ${b.faible.ok}/${b.faible.n}, voix forte ${b.forte.ok}/${b.forte.n} ; ratés : ${b.rates.join(' ; ') || 'aucun'}`);
  expect(b.faible.n).toBeGreaterThanOrEqual(3);
  expect(b.forte.n).toBeGreaterThanOrEqual(3);
  expect(b.faible.ok, 'perso de la voix faible, à droite seulement').toBeGreaterThanOrEqual(0.9 * b.faible.n);
  expect(b.forte.ok, 'perso de la voix forte, à gauche seulement').toBeGreaterThanOrEqual(0.9 * b.forte.n);
  console.log(`[best-of] boîte de la voix faible vue ${b.boite} fois sur ${b.motsFaibles} mots de la voix faible ; sur la voix forte ${b.boiteSurForte} fois (${b.forte.n} images)`);
  expect(b.boiteSurForte).toBeLessThanOrEqual(0.1 * b.forte.n);
  expect(b.boite).toBeGreaterThanOrEqual(2);
  expect(b.boite).toBeGreaterThanOrEqual(b.motsFaibles * 0.6);

  // Aperçu = export sur une image avec avatar.
  const exportee = await sharp(png(sortie, tApercu, info.outputPath('image-apercu-export.png'))).removeAlpha().resize(480, 270, { fit: 'fill' }).raw().toBuffer();
  const vue = await sharp(apercu).removeAlpha().resize(480, 270, { fit: 'fill' }).raw().toBuffer();
  const db = psnr(exportee, vue);
  console.log(`[best-of] aperçu / export à ${tApercu} s : PSNR ${db.toFixed(1)} dB`);
  expect(db).toBeGreaterThan(25);
  expect(erreurs).toEqual([]);
});

