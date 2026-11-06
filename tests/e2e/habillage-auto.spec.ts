// Montage auto « Habillage » (dev 2) dans Chrome headless, au format téléphone : punchlines (B), zooms
// automatiques (C) et titres de section (G), puis export. Un test en YouTube 16:9, un en TikTok vertical.
// Les mots des sous-titres sont posés dans la sauvegarde (pas de modèle Whisper à télécharger), puis on reprend
// le projet. On vérifie dans le MP4 exporté : taille, durée, titre et punchline présents au bon moment (pixels noirs).
// Captures facultatives : ARKO_CAPTURES=/dossier.

import { expect, test, type Page } from '@playwright/test';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';

const VIDEO = 'tests/fixtures/youtube-32s-640x360.mp4';
const CAPTURES = process.env.ARKO_CAPTURES;

test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });

async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${CAPTURES}/${nom}.png` });
}

/** Mots (temps source) : « bon on y va » (rien), « putain le creeper » (juron), « gg les gars » (mot fort),
 *  « on continue tranquille » (rien), « non ! » (exclamation). */
const MOTS = [
  ['bon', 1, 1.3], ['on', 1.3, 1.5], ['y', 1.5, 1.6], ['va.', 1.6, 2],
  ['putain', 3, 3.4], ['le', 3.4, 3.55], ['creeper', 3.55, 4.1],
  ['gg', 11, 11.4], ['les', 11.4, 11.6], ['gars', 11.6, 12.1],
  ['on', 14, 14.2], ['continue', 14.2, 14.7], ['tranquille', 14.7, 15.3],
  ['non!', 22, 22.6],
];

/** Pose plans, mots, un bruitage et (en 16:9) des chapitres dans la sauvegarde, puis rouvre le projet. */
async function preparerProjet(page: Page, chapitres: boolean) {
  await expect(page.getByTestId('enregistre')).toHaveAttribute('data-etat', 'enregistre', { timeout: 10_000 });
  await page.evaluate(
    async ([mots, avecChapitres]) => {
      const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
      const db = await attendre(indexedDB.open('keyval-store'));
      const store = () => db.transaction('keyval', 'readwrite').objectStore('keyval');
      const index = await attendre(store().get('arko.projets'));
      const cle = `arko.projet.${index.courant}`;
      for (const p of index.projets) if (p.id === index.courant) p.etape = 'habiller';
      await attendre(store().put(index, 'arko.projets'));
      const projet = await attendre(store().get(cle));
      projet.etape = 'habiller';
      const r = projet.recette;
      r.plans = [{ de: 0, a: 9 }, { de: 10, a: 19 }, { de: 20, a: 29 }]; // 27 s, 3 passages
      r.sousTitres = { style: 'karaoke', mots };
      r.sons = [{ id: 'impact.boom', ts: 12 }]; // un bruitage posé : moment fort du 2e passage
      if (avecChapitres) r.chapitres = [{ t: 0, nom: 'Intro' }, { t: 9, nom: 'Le château' }, { t: 18, nom: 'La fin' }];
      await attendre(store().put(projet, cle));
    },
    [MOTS, chapitres] as const,
  );
  await page.reload();
  await expect(page.getByTestId('montage-0')).toContainText('Habiller');
  const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await selecteur.setFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 30_000 });
}

async function teteA(page: Page, s: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < s; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(s));
}

/** Sous-titres → Punchlines seulement : 3 punchlines trouvées ; l'étoile ajoute « on continue tranquille ». */
async function punchlines(page: Page) {
  await page.getByTestId('outil-sousTitres').click();
  await page.getByTestId('mode-sous-titres-punchlines').click();
  await expect(page.getByTestId('punchlines-compte')).toContainText('3 punchlines');
  await expect(page.getByTestId('ligne-0')).toHaveAttribute('data-punchline', '0');
  await page.getByTestId('punchline-3').click(); // « on continue tranquille »
  await expect(page.getByTestId('punchlines-compte')).toContainText('4 punchlines');
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('punchlines-compte')).toContainText('3 punchlines');
  await capture(page, `${page.viewportSize()!.width}-punchlines`);
  await page.getByTestId('panneau-fermer').click();
}

/** Zoom → Zooms automatiques (Normal) : le passage avec le bruitage est zoomé, le 3e aussi (rythme). */
async function zooms(page: Page) {
  await page.getByTestId('outil-zoom').click();
  await page.getByTestId('force-zooms-auto-normal').click();
  await page.getByTestId('auto-zooms').click();
  await expect(page.getByTestId('zooms-auto-compte')).toContainText('passages zoomés');
  await capture(page, `${page.viewportSize()!.width}-zooms`);
  await page.getByTestId('panneau-fermer').click();
}

/**
 * Image du MP4 exporté au temps t : part de pixels presque noirs dans la bande [haut, bas] de l'image.
 * La mire de test n'en a pas là ; le contour noir des punchlines et le texte du bandeau, si.
 */
async function partNoire(page: Page, t: number, bande: [number, number]): Promise<number> {
  return page.evaluate(async ([t, haut, bas]) => {
    const v = document.querySelector<HTMLVideoElement>('[data-testid="video-finale"]')!;
    v.pause();
    if (v.readyState < 1) await new Promise((ok) => v.addEventListener('loadedmetadata', ok, { once: true }));
    const vu = new Promise((ok) => v.addEventListener('seeked', ok, { once: true }));
    v.currentTime = t;
    await vu;
    const [L, H] = [v.videoWidth / 4, v.videoHeight / 4];
    const c = Object.assign(document.createElement('canvas'), { width: L, height: H });
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, L, H);
    const y0 = Math.round(H * haut);
    const d = ctx.getImageData(0, y0, L, Math.round(H * bas) - y0).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! < 45 && d[i + 1]! < 45 && d[i + 2]! < 45) n++;
    return n / (d.length / 4);
  }, [t, bande[0], bande[1]] as const);
}

async function exporter(page: Page, testInfo: { outputPath(n: string): string }, nom: string) {
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 360_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('telecharger').click()]);
  const mp4 = testInfo.outputPath(nom);
  await dl.saveAs(mp4);
  const input = new Input({ source: new FilePathSource(mp4), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    return { l: v!.displayWidth, h: v!.displayHeight, duree: await input.computeDuration() };
  } finally {
    input.dispose();
  }
}

/** Le texte (contour noir) est bien là quand il doit l'être, et absent quand il ne doit pas l'être. */
async function verifierTexte(page: Page, quoi: string, bande: [number, number], avec: number, sans: number) {
  const [a, s] = [await partNoire(page, avec, bande), await partNoire(page, sans, bande)];
  console.log(`[${quoi}] pixels noirs : ${(a * 100).toFixed(2)} % à ${avec} s, ${(s * 100).toFixed(2)} % à ${sans} s`);
  expect(a).toBeGreaterThan(Math.max(0.004, s * 3));
}

test('YouTube 16:9 : punchlines + zooms auto + titres des chapitres, export 1920 × 1080', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('arko.destination', 'youtube'));
  await page.reload();
  await expect(page.getByTestId('changer-destination')).toContainText('YouTube 16:9');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await preparerProjet(page, true);

  await punchlines(page);
  await zooms(page);
  // Chapitres → titres de section : « Intro » (0:00) est sauté (accroche), 2 titres posés.
  await page.getByTestId('outil-chapitres').click();
  await page.getByTestId('auto-sections-chapitres').click();
  await expect(page.getByTestId('toast')).toContainText('2 titres de section posés');
  // Renommer un chapitre : le titre suit.
  await page.getByTestId('chapitre-nom-1').fill('Le donjon');
  await page.getByTestId('chapitre-nom-1').press('Enter');
  await capture(page, '16x9-sections');
  await page.getByTestId('panneau-fermer').click();
  await teteA(page, 10); // titre « LE DONJON » (9 → 11,2 s) + punchline « GG LES GARS » (source 11 s = sortie 10 s)
  await capture(page, '16x9-apercu');

  const info = await exporter(page, testInfo, 'habillage-16x9.mp4');
  expect(info.l).toBe(1920);
  expect([1080, 1072]).toContain(info.h);
  expect(Math.abs(info.duree - 27)).toBeLessThanOrEqual(0.1);
  await verifierTexte(page, 'titre 16:9', [0.1, 0.3], 10.2, 8.5);
  await verifierTexte(page, 'punchline 16:9', [0.66, 0.82], 10.6, 8.5);
});

test('TikTok vertical : punchlines + zooms auto + titre de section à la main, export 1080 × 1920', async ({ page }, testInfo) => {
  test.setTimeout(420_000);
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
  await preparerProjet(page, false);

  await punchlines(page);
  await zooms(page);
  // Texte → « Titre de section ici » à 5 s, renommé.
  await teteA(page, 5);
  await page.getByTestId('outil-texte').click();
  await page.getByTestId('auto-sections-texte').click();
  await expect(page.getByTestId('champ-texte')).toHaveValue('Nouvelle partie');
  await page.getByTestId('champ-texte').fill('Le boss');
  await page.getByTestId('champ-texte').press('Enter');
  await expect(page.getByTestId('style-texte-bandeau')).toHaveAttribute('aria-checked', 'true');
  await capture(page, 'vertical-section');
  await page.getByTestId('panneau-fermer').click();
  await teteA(page, 4); // « P*TAIN LE CREEPER » (3 → 4,35 s)
  await capture(page, 'vertical-apercu');

  const info = await exporter(page, testInfo, 'habillage-vertical.mp4');
  expect([info.l, info.h]).toEqual([1080, 1920]);
  expect(Math.abs(info.duree - 27)).toBeLessThanOrEqual(0.1);
  await verifierTexte(page, 'titre vertical', [0.12, 0.28], 5.4, 4.5);
  await verifierTexte(page, 'punchline vertical', [0.55, 0.71], 3.5, 1.2);
});
