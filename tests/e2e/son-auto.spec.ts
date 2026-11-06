// Montage auto « Son » (E + F) dans Chrome, au format téléphone :
// 1. import d'un petit pack .zip À DOSSIERS dans Mes sons (le dossier devient l'étiquette, une vidéo .mp4 ne garde
//    que son son, un .txt est ignoré) ;
// 2. « Bruitages auto » (mode prudent : après la phrase, coché par l'utilisateur) sur une vraie voix (tests/fixtures/parole-fr.mp4 ; ses mots, connus, sont posés dans la
//    sauvegarde pour ne pas télécharger Whisper) : propositions, mot ajouté à la liste des déclencheurs, « Tout poser » ;
// 3. « Musique » : un morceau « Kevin MacLeod » de Mes sons → ligne de crédit CC BY ;
// 4. export avec le volume final : la mesure affichée et celle du MP4 (ffmpeg ebur128) donnent −14 LUFS ±1.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const VIDEO = 'tests/fixtures/parole-fr.mp4';
const PAROLE = JSON.parse(readFileSync('tests/fixtures/parole-fr.json', 'utf-8')) as { mots: { txt: string; ts: number; fin: number }[] };

test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

/** WAV stéréo 48 kHz : somme de sinus (fréquences, amplitude totale). */
function wav(freqs: number[], duree: number, amplitude = 0.5): Buffer {
  const n = Math.round(duree * 48000);
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8);
  [16, 0x20001, 48000, 192000, 0x100004].forEach((v, k) => b.writeUInt32LE(v, 16 + k * 4));
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = freqs.reduce((s, f) => s + Math.sin((2 * Math.PI * f * i) / 48000), 0) / freqs.length;
    const x = Math.round(32767 * amplitude * v * Math.min(1, i / 480, (n - i) / 480));
    b.writeInt16LE(x, 44 + i * 4);
    b.writeInt16LE(x, 46 + i * 4);
  }
  return b;
}

/** .zip « stocké » (sans compression). */
function zip(entrees: { nom: string; donnees: Buffer }[]): Buffer {
  const parties: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = Buffer.from(e.nom);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(e.donnees.length, 18);
    local.writeUInt32LE(e.donnees.length, 22);
    local.writeUInt16LE(nom.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(e.donnees.length, 20);
    central.writeUInt32LE(e.donnees.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    parties.push(local, nom, e.donnees);
    centraux.push(central, nom);
    decalage += 30 + nom.length + e.donnees.length;
  }
  const rep = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(rep.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...parties, rep, fin]);
}

/** Petite vidéo .mp4 (H.264 + AAC) fabriquée par ffmpeg : un « wow » de pack de mèmes. */
function videoMeme(testInfo: TestInfo): Buffer {
  const chemin = join(tmpdir(), `arko-${testInfo.testId}-wow.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=15:duration=1.5', '-f', 'lavfi', '-i', 'sine=frequency=800:duration=1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', chemin]);
  return readFileSync(chemin);
}

function fichier(testInfo: TestInfo, nom: string, contenu: Buffer): string {
  const chemin = join(tmpdir(), `arko-${testInfo.testId}-${nom}`);
  writeFileSync(chemin, contenu);
  return chemin;
}

/** Pose les mots de la phrase connue dans la sauvegarde, puis rouvre le projet à l'étape Habiller. */
async function poserMots(page: Page) {
  await expect(page.getByTestId('enregistre')).toHaveAttribute('data-etat', 'enregistre', { timeout: 10_000 });
  const mots = PAROLE.mots.map((m) => [m.txt, m.ts, m.fin]);
  await page.evaluate(async (mots) => {
    const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
    const db = await attendre(indexedDB.open('keyval-store'));
    const store = () => db.transaction('keyval', 'readwrite').objectStore('keyval');
    const index = await attendre(store().get('arko.projets'));
    const cle = `arko.projet.${index.courant}`;
    for (const p of index.projets) if (p.id === index.courant) p.etape = 'habiller';
    await attendre(store().put(index, 'arko.projets'));
    const projet = await attendre(store().get(cle));
    projet.etape = 'habiller';
    projet.recette.sousTitres = { style: 'karaoke', mots };
    await attendre(store().put(projet, cle));
  }, mots);
  await page.reload();
  const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await selecteur.setFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 30_000 });
}

/** Sonie intégrée et crête vraie d'un fichier, mesurées par ffmpeg (ebur128, BS.1770). */
function mesurerFfmpeg(chemin: string): { lufs: number; crete: number } {
  const texte = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', chemin, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf-8' }).stderr;
  const resume = texte.slice(texte.lastIndexOf('Summary:'));
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(resume)?.[1]), crete: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(resume)?.[1]) };
}

test('Montage auto Son : pack .zip à dossiers → bruitages auto + musique → export à −14 LUFS', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  page.on('pageerror', (e) => console.log('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('[navigateur]', m.text()));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await poserMots(page);
  await page.getByTestId('outil-sons').click();
  await expect(page.getByTestId('famille-messons')).toHaveAttribute('aria-selected', 'true');

  // 1. Pack .zip à dossiers : étiquette = nom du dossier ; la vidéo ne garde que son son ; le .txt est ignoré.
  const pack = zip([
    { nom: 'Pack/Laughs/sitcom laugh.wav', donnees: wav([500, 750], 2) },
    { nom: 'Pack/MLG Sound Effects/wow.mp4', donnees: videoMeme(testInfo) },
    { nom: 'Pack/Windows/windows shutdown.wav', donnees: wav([600, 450, 300], 2.5) },
    { nom: 'Pack/Musique/Kevin MacLeod - Sneaky Test.wav', donnees: wav([220, 277, 330], 12, 0.6) },
    { nom: 'Pack/lisez-moi.txt', donnees: Buffer.from('salut') },
  ]);
  await page.getByTestId('mes-sons-fichiers').setInputFiles([fichier(testInfo, 'pack.zip', pack)]);
  await expect(page.getByTestId('toast')).toContainText('4 sons gardés dans Mes sons. 1 ignoré', { timeout: 30_000 });
  const ligne = (texte: string) => page.locator('[data-testid^="mon-son-"]', { hasText: texte }).first();
  await expect(ligne('wow').locator('.son-etiquette')).toHaveText('MLG Sound Effects');
  await expect(ligne('sitcom laugh').locator('.son-etiquette')).toHaveText('Laughs');
  await expect(ligne('windows shutdown').locator('.son-etiquette')).toHaveText('Windows');
  await expect(page.getByTestId('mes-sons-place')).toContainText('sur 600');

  // 2. Bruitages auto : « Salut tout le monde » → extinction (son de Mes sons, dossier Windows).
  await page.getByTestId('auto-bruitages').click();
  await expect(page.getByTestId('liste-bruitages')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('bruitage-0')).toContainText('Extinction');
  await expect(page.getByTestId('bruitage-0')).toContainText('windows shutdown');
  // Mode prudent (retour de Romain) : posé APRÈS la phrase (pas sur le mot), et rien n'est posé sans validation.
  await expect(page.getByTestId('bruitages-tout-poser')).toBeDisabled();
  // Écouter dans la vidéo : l'aperçu joue autour du bruitage, puis revient.
  await page.getByTestId('bruitage-contexte-0').click();
  await expect(page.getByTestId('bruitage-contexte-0')).toHaveText('J\'écoute…', { timeout: 10_000 });
  await expect(page.getByTestId('bruitage-contexte-0')).toHaveText('Écouter dans la vidéo', { timeout: 15_000 });
  // Liste éditable : « ce match » ajouté aux « Wow » ; même fin de phrase → toujours 1 seul (1 toutes les 2 min).
  await page.getByTestId('bruitages-mots').click();
  await page.getByTestId('declencheur-wow').fill('wow, ce match');
  await page.getByTestId('declencheur-wow').press('Tab');
  expect(await page.evaluate(() => localStorage.getItem('arko.declencheurs'))).toContain('ce match');
  await expect(page.locator('[data-testid^="bruitage-ecouter-"]')).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId('bruitage-garder-0').check();
  await page.getByTestId('bruitages-tout-poser').click();
  await expect(page.getByTestId('toast')).toContainText('1 bruitage posé', { timeout: 30_000 });
  await expect(page.locator('[data-testid^="calque-son-"]')).toHaveCount(1);

  // 3. Musique : le morceau « Kevin MacLeod » → crédit CC BY à copier.
  await page.getByTestId('auto-musique').click();
  await expect(page.getByTestId('panneau-musique')).toBeVisible();
  await page.locator('[data-testid="musique-mes-sons"] li', { hasText: 'Kevin MacLeod' }).locator('[data-testid^="musique-ajouter-"]').click();
  await expect(page.getByTestId('musique-morceau-0')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('musique-credit')).toContainText('"Sneaky Test" Kevin MacLeod (incompetech.com)');
  await expect(page.getByTestId('musique-baisse')).toBeChecked();
  await page.getByTestId('musique-retour').click();
  await page.getByTestId('panneau-fermer').click();

  // 4. Export avec le volume final (réglé avec la musique) : mesure affichée, puis mesure du MP4 par ffmpeg.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('auto-volume-final')).toBeChecked();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 240_000 });
  const bilan = page.getByTestId('auto-bilan-volume');
  await expect(bilan).toContainText('LUFS');
  const lufsAffiche = Number(await bilan.getAttribute('data-lufs'));
  const creteAffichee = Number(await bilan.getAttribute('data-crete'));
  const mp4 = testInfo.outputPath('son-auto.mp4');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  await telechargement.saveAs(mp4);
  const mesure = mesurerFfmpeg(mp4);
  console.log(`[son-auto] affiché ${lufsAffiche} LUFS / crête ${creteAffichee} dBTP ; ffmpeg ${mesure.lufs} LUFS / crête ${mesure.crete} dBTP (après AAC)`);
  expect(Math.abs(lufsAffiche + 14)).toBeLessThanOrEqual(0.5);
  expect(creteAffichee).toBeLessThanOrEqual(-1.5);
  expect(Math.abs(mesure.lufs + 14)).toBeLessThanOrEqual(1);
  expect(mesure.crete).toBeLessThanOrEqual(-1);
});
