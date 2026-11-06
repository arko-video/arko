// « Mes sons » au format téléphone (360 × 740), dans Chrome :
// 1. import de PLUSIEURS sons d'un coup (2 WAV + un .zip qui contient un WAV et un .txt) avec l'étiquette « Memes »,
//    recherche, renommer, supprimer, lien MyInstants, puis un son posé et exporté : il s'entend à l'endroit prévu ;
// 2. « Partager → Arko » : un formulaire multipart est envoyé à ./partager (comme le fait Android),
//    le service worker dépose les sons, Arko demande « Les garder ? » et ils arrivent dans Mes sons.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const VIDEO = 'tests/fixtures/test-1920x1080.mp4';

test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

/** WAV mono 48 kHz : une sinusoïde (la vidéo de test sonne à 440 Hz). */
function wav(freq: number, duree: number): Buffer {
  const n = Math.round(duree * 48000);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  [16, 0x10001, 48000, 96000, 0x100002].forEach((v, k) => b.writeUInt32LE(v, 16 + k * 4));
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(26000 * Math.sin((2 * Math.PI * freq * i) / 48000)), 44 + i * 2);
  return b;
}

/** .zip « stocké » (sans compression) : assez pour tester l'import. */
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

/** Écrit un fichier dans le dossier temporaire (les chemins accentués des résultats posent problème). */
function fichier(testInfo: TestInfo, nom: string, contenu: Buffer): string {
  const chemin = join(tmpdir(), `arko-${testInfo.testId}-${nom}`);
  writeFileSync(chemin, contenu);
  return chemin;
}

async function versSons(page: Page) {
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await page.getByTestId('outil-sons').click();
  await expect(page.getByTestId('famille-messons')).toHaveAttribute('aria-selected', 'true');
}

function amplitude(pcm: Float32Array, de: number, a: number, freq: number): number {
  const [i0, i1] = [Math.round(de * 48000), Math.min(pcm.length, Math.round(a * 48000))];
  let [re, im] = [0, 0];
  for (let i = i0; i < i1; i++) {
    const w = (2 * Math.PI * freq * i) / 48000;
    re += pcm[i]! * Math.cos(w);
    im += pcm[i]! * Math.sin(w);
  }
  return Math.hypot(re, im) / Math.max(1, i1 - i0);
}

test('Mes sons : import de plusieurs sons et d\'un .zip, recherche, renommer, supprimer, poser, exporter', async ({ page }, testInfo) => {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto('./');
  await versSons(page);

  // Rappel, lien MyInstants (nouvel onglet, sans référent) et les 3 lignes d'aide.
  await expect(page.getByTestId('mes-sons-rappel')).toContainText('sous ta responsabilité');
  const lien = page.getByTestId('mes-sons-myinstants');
  await expect(lien).toHaveAttribute('href', 'https://www.myinstants.com/fr/index/fr/');
  await expect(lien).toHaveAttribute('target', '_blank');
  await expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.mes-sons-aide li')).toHaveCount(3);

  // Import : 2 WAV + un .zip (1 WAV + 1 .txt ignoré), étiquette « Memes » proposée.
  await expect(page.getByTestId('mes-sons-etiquette')).toHaveValue('Memes');
  await page.getByTestId('mes-sons-fichiers').setInputFiles([
    fichier(testInfo, 'bip_aigu.wav', wav(1000, 0.6)),
    fichier(testInfo, 'grave.wav', wav(200, 0.5)),
    fichier(testInfo, 'pack.zip', zip([{ nom: 'dossier/klaxon.wav', donnees: wav(700, 0.4) }, { nom: 'lisez-moi.txt', donnees: Buffer.from('salut') }])),
  ]);
  await expect(page.getByTestId('toast')).toContainText('3 sons gardés dans Mes sons. 1 ignoré', { timeout: 20_000 });
  const lignes = page.locator('[data-testid^="mon-son-ecouter-"]');
  await expect(lignes).toHaveCount(3);
  await expect(page.getByTestId('liste-mes-sons')).toContainText('bip aigu');
  // Étiquette choisie pour les sons sans dossier ; un son rangé dans un dossier du .zip prend le nom du dossier.
  await expect(page.locator('[data-testid^="mon-son-"]', { hasText: 'bip aigu' }).first().locator('.son-etiquette')).toHaveText('Memes');
  await expect(page.locator('[data-testid^="mon-son-"]', { hasText: 'klaxon' }).first().locator('.son-etiquette')).toHaveText('dossier');

  // Recherche, écoute.
  await page.getByTestId('mes-sons-recherche').fill('klax');
  await expect(lignes).toHaveCount(1);
  await lignes.first().click();
  await page.getByTestId('mes-sons-recherche').fill('');

  // Renommer « grave » puis le supprimer (avec confirmation).
  const ligneGrave = page.locator('[data-testid^="mon-son-"]', { hasText: 'grave' }).first();
  await ligneGrave.locator('[data-testid^="mon-son-modifier-"]').click();
  await page.getByTestId('mon-son-nom').fill('Gros grave');
  await page.getByTestId('mon-son-enregistrer').click();
  await expect(page.getByTestId('liste-mes-sons')).toContainText('Gros grave');
  await page.locator('[data-testid^="mon-son-"]', { hasText: 'Gros grave' }).first().locator('[data-testid^="mon-son-modifier-"]').click();
  await page.getByTestId('mon-son-supprimer').click();
  await page.getByTestId('dialogue-confirmer').click();
  await expect(lignes).toHaveCount(2);

  // Poser « bip aigu » (1 kHz) à 2 s, puis exporter : le bip est dans le MP4 juste après 2 s, pas avant.
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  await tete.press('PageUp');
  await tete.press('PageUp');
  await page.locator('[data-testid^="mon-son-"]', { hasText: 'bip aigu' }).first().locator('[data-testid^="mon-son-ajouter-"]').click();
  await expect(page.locator('[data-testid^="calque-son-"]')).toHaveCount(1);
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('suivant').click();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 180_000 });
  const mp4 = testInfo.outputPath('mes-sons.mp4');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  await telechargement.saveAs(mp4);
  const brut = execFileSync('ffmpeg', ['-v', 'error', '-i', mp4, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 64 << 20 });
  const pcm = new Float32Array(brut.buffer, brut.byteOffset, brut.byteLength / 4);
  const pendant = amplitude(pcm, 2.05, 2.5, 1000);
  expect(pendant, 'bip de Mes sons dans le MP4 après 2 s').toBeGreaterThan(Math.max(0.03, 10 * amplitude(pcm, 1.3, 1.9, 1000)));
});

test('Partager → Arko : les sons reçus (dont un .zip) arrivent dans Mes sons', async ({ page, baseURL }, testInfo) => {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto('./');
  // Le service worker doit être actif (c'est lui qui reçoit le partage).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  // Comme Android : une navigation POST multipart vers ./partager, depuis une autre page.
  await page.goto('about:blank');
  await page.setContent(
    `<form method="post" enctype="multipart/form-data" action="${new URL('partager', baseURL).href}">` +
      '<input type="file" name="sons" multiple><button type="submit">Partager</button></form>',
  );
  await page.locator('input[name="sons"]').setInputFiles([
    fichier(testInfo, 'meme.wav', wav(900, 0.4)),
    fichier(testInfo, 'lot.zip', zip([{ nom: 'cri.wav', donnees: wav(600, 0.3) }])),
  ]);
  await page.locator('button[type="submit"]').click();

  await expect(page.getByTestId('dialogue-sons-recus')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('dialogue-sons-recus')).toContainText('2 sons reçus');
  await expect(page.getByTestId('dialogue-sons-recus')).toContainText('sous ta responsabilité');
  await expect(page.getByTestId('recus-etiquette')).toHaveValue('Memes');
  expect(new URL(page.url()).search).toBe('');
  await page.getByTestId('recus-garder').click();
  await expect(page.getByTestId('toast')).toContainText('2 sons gardés dans Mes sons', { timeout: 20_000 });

  // Ils sont dans Mes sons, pour n'importe quel montage.
  await versSons(page);
  await expect(page.locator('[data-testid^="mon-son-ecouter-"]')).toHaveCount(2);
  await expect(page.getByTestId('liste-mes-sons')).toContainText('meme');
  await expect(page.getByTestId('liste-mes-sons')).toContainText('cri');
});
