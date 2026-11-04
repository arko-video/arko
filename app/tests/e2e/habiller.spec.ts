// Étape Habiller (phase 2) au format téléphone (360 × 740), dans Chrome headless : accroche et texte glissé,
// annuler, export (pixels du MP4 lus dans un <video>) ; placement sans chevauchement et clavier ; sous-titres
// (accord, liste, corrections, mots retenus) ; éditeur Jeu + webcam. Captures facultatives : ARKO_CAPTURES=/dossier.

import { expect, test, type Page } from '@playwright/test';

const VIDEO = 'tests/fixtures/test-1920x1080.mp4';
const CAPTURES = process.env.ARKO_CAPTURES;

test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });

async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  await page.waitForTimeout(800); // l'aperçu finit de dessiner
  await page.screenshot({ path: `${CAPTURES}/${nom}.png` });
}

/** Touche les éléments dans l'ordre. */
async function toucher(page: Page, ...ids: string[]) {
  for (const id of ids) await page.getByTestId(id).click();
}

/** Glissé à la souris de `de` vers `vers` (positions en pixels de la page). */
async function glisser(page: Page, de: [number, number], vers: [number, number], steps = 6) {
  await page.mouse.move(...de);
  await page.mouse.down();
  await page.mouse.move(...vers, { steps });
  await page.mouse.up();
}

/** Tête de lecture à n secondes (clavier : Début puis n × « +1 s »), puis un texte écrit dans l'outil Texte. */
async function texteA(page: Page, n: number, txt: string) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < n; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(n));
  await page.getByTestId('outil-texte').click();
  await page.getByTestId('champ-texte').fill(txt);
  await page.getByTestId('champ-texte').press('Enter');
}

async function importer(page: Page) {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto('./');
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
}

async function allerAHabiller(page: Page) {
  await importer(page);
  await toucher(page, 'suivant', 'suivant');
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
}

/**
 * Énergie des contours (moyenne de |∇ luminance|) dans une bande horizontale (x 15 à 85 %)
 * de l'image du MP4 au temps t, lue sur le canevas d'un <video>. Un fond flou donne une valeur faible,
 * un texte avec contour une valeur forte.
 */
async function energieTexte(page: Page, t: number, bande: [number, number]): Promise<number> {
  return page.evaluate(async ([t, haut, bas]) => {
    const v = document.querySelector<HTMLVideoElement>('[data-testid="video-finale"]')!;
    v.pause();
    if (v.readyState < 1) await new Promise((ok) => v.addEventListener('loadedmetadata', ok, { once: true }));
    const vu = new Promise((ok) => v.addEventListener('seeked', ok, { once: true }));
    v.currentTime = t;
    await vu;
    const [L, H] = [270, 480];
    const c = Object.assign(document.createElement('canvas'), { width: L, height: H });
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0, L, H);
    const [x0, y0] = [Math.round(L * 0.15), Math.round(H * haut)];
    const d = ctx.getImageData(x0, y0, Math.round(L * 0.85) - x0, Math.round(H * bas) - y0);
    const w = d.width;
    const lum = (i: number) => 0.299 * d.data[i]! + 0.587 * d.data[i + 1]! + 0.114 * d.data[i + 2]!;
    let somme = 0;
    for (let y = 0; y < d.height - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        somme += Math.abs(lum(i) - lum(i + 4)) + Math.abs(lum(i) - lum(i + 4 * w));
      }
    }
    return somme / ((d.height - 1) * (w - 1));
  }, [t, bande[0], bande[1]] as const);
}

test('Habiller : accroche, texte glissé, annuler, export avec les textes dans le MP4', async ({ page }) => {
  await allerAHabiller(page);
  await expect(page.getByTestId('barre-outils')).toBeVisible();
  for (const o of ['accroche', 'texte', 'sousTitres']) await expect(page.getByTestId(`outil-${o}`)).toBeVisible();
  await capture(page, 'habiller-barre');

  // Accroche : une suggestion touchée devient le texte de 0 à 2,5 s.
  await toucher(page, 'outil-accroche');
  await expect(page.getByTestId('suggestion-0')).toHaveText(/^1v4 avec 8\sPV$/);
  await toucher(page, 'suggestion-0');
  await expect(page.getByTestId('champ-accroche')).toHaveValue(/^1v4 avec 8\sPV$/);
  await expect(page.getByTestId('calque-accroche-0')).toBeVisible();
  await capture(page, 'habiller-accroche');
  await page.getByTestId('panneau-fermer').click();
  await expect(page.getByTestId('barre-outils')).toBeVisible();

  await texteA(page, 3, 'GG les gars');
  await toucher(page, 'style-texte-alerte');
  await expect(page.getByTestId('style-texte-alerte')).toHaveAttribute('aria-checked', 'true');
  await capture(page, 'habiller-texte');
  await page.getByTestId('panneau-fermer').click();

  // Glisser le texte vers le bas : la zone sûre s'affiche pendant le geste, puis disparaît.
  const boite = page.locator('[data-testid^="texte-boite-"]').first();
  await expect(boite).toBeVisible();
  const avant = (await boite.boundingBox())!;
  await expect(page.getByTestId('zone-sure')).toHaveCount(0);
  await page.mouse.move(avant.x + avant.width / 2, avant.y + avant.height / 2);
  await page.mouse.down();
  await page.mouse.move(avant.x + avant.width / 2 + 3, avant.y + avant.height / 2 + 40, { steps: 8 });
  await expect(page.getByTestId('zone-sure')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('zone-sure')).toHaveCount(0);
  const apres = (await boite.boundingBox())!;
  expect(apres.y - avant.y).toBeGreaterThan(20);
  expect(Math.abs(apres.x + apres.width / 2 - (avant.x + avant.width / 2)), 'aimant au centre').toBeLessThan(2);

  // Annuler ramène le texte à sa place.
  await toucher(page, 'annuler');
  await expect.poll(async () => (await boite.boundingBox())!.y).toBeLessThan(avant.y + 3);

  // L'icône du coin de l'aperçu affiche la zone sûre à la main.
  await page.getByTestId('zone-sure-bouton').click();
  await expect(page.getByTestId('zone-sure')).toBeVisible();

  // Export, puis les pixels du MP4 : accroche à 1 s, rien à 2,8 s, texte à 3,5 s.
  await toucher(page, 'suivant', 'creer-video');
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 180_000 });
  // L'accroche est à y = 0,2 ; le nouveau texte se pose plus bas (y = 0,35), jamais sur elle.
  const ACC: [number, number] = [0.12, 0.28];
  const TXT: [number, number] = [0.28, 0.42];
  for (const [bande, t] of [[ACC, 1.0], [TXT, 3.5]] as const) {
    const [sans, avec] = [await energieTexte(page, 2.8, bande), await energieTexte(page, t, bande)];
    console.log(`énergie des contours à y ${bande.join('–')} : ${sans.toFixed(1)} sans texte, ${avec.toFixed(1)} avec`);
    expect(avec).toBeGreaterThan(Math.max(4, sans * 2));
  }
});

test('Nouveau texte : jamais sur l\'accroche, déplacé au clavier sans sortir de la zone sûre', async ({ page }) => {
  await allerAHabiller(page);
  await toucher(page, 'outil-accroche', 'suggestion-2', 'panneau-fermer');
  await texteA(page, 1, 'Il était à 1 PV et il a tout retourné');
  await page.getByTestId('panneau-fermer').click();

  const boites = page.locator('[data-testid^="texte-boite-"]');
  await expect(boites).toHaveCount(2);
  const [a, b] = [(await boites.nth(0).boundingBox())!, (await boites.nth(1).boundingBox())!];
  // Zones de toucher agrandies à 48 px : on tolère 2 px de contact entre elles.
  const chevauche = a.x < b.x + b.width && b.x < a.x + a.width && a.y + 2 < b.y + b.height && b.y + 2 < a.y + a.height;
  expect(chevauche, 'le nouveau texte ne cache pas l\'accroche').toBe(false);

  // Maj + flèche bas, 12 fois : la boîte entière reste au-dessus de la zone basse de TikTok.
  const texte = page.getByTestId('texte-boite-1');
  await texte.focus();
  for (let i = 0; i < 12; i++) await texte.press('Shift+ArrowDown');
  const apercu = (await page.getByTestId('apercu').boundingBox())!;
  await expect.poll(async () => (await texte.boundingBox())!.y).toBeGreaterThan(b.y + 20);
  const fin = (await texte.boundingBox())!;
  await texte.press('Shift+ArrowDown');
  expect((await texte.boundingBox())!.y, 'bloqué au bord de la zone sûre').toBeCloseTo(fin.y, 0);
  expect(fin.y + fin.height / 2).toBeLessThan(apercu.y + apercu.height * 0.65625);
  // Le moteur n'a rien eu à remonter : aucun avertissement de zone.
  await expect(page.getByTestId('avertissements-zone')).toHaveCount(0);
  await capture(page, 'habiller-placement');
});

test('Sous-titres : accord demandé avant de télécharger le module', async ({ page }) => {
  const requetes: string[] = [];
  page.on('request', (r) => void (r.url().startsWith('http://localhost') || requetes.push(r.url())));
  await allerAHabiller(page);
  await toucher(page, 'outil-sousTitres', 'creer-sous-titres');
  const dialogue = page.getByTestId('dialogue-module');
  await expect(dialogue).toBeVisible();
  await expect(dialogue).toContainText('Télécharger le module sous-titres (environ 90 Mo, une seule fois). Ensuite il marche sans internet.');
  await capture(page, 'habiller-sous-titres-accord');
  await page.getByTestId('module-refuser').click();
  await expect(dialogue).toHaveCount(0);
  await expect(page.getByTestId('creer-sous-titres')).toBeVisible();
  expect(requetes, 'aucun appel réseau sans accord').toEqual([]);
  // Retour (Android) ferme le panneau sans quitter Habiller.
  await page.goBack();
  await expect(page.getByTestId('barre-outils')).toBeVisible();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');
});

test('Sous-titres : liste des lignes, corriger partout, style, retirer et annuler', async ({ page }) => {
  // Sans télécharger le modèle : on pose des mots dans la sauvegarde, puis on reprend le projet.
  await allerAHabiller(page);
  await expect(page.getByTestId('enregistre')).toHaveAttribute('data-etat', 'enregistre', { timeout: 10_000 });
  await page.evaluate(async () => {
    const attendre = <T,>(req: IDBRequest<T>) => new Promise<T>((ok, ko) => ((req.onsuccess = () => ok(req.result)), (req.onerror = ko)));
    const db = await attendre(indexedDB.open('keyval-store'));
    const store = () => db.transaction('keyval', 'readwrite').objectStore('keyval');
    // « Mes montages » : l'index (arko.projets) donne le projet courant, rangé sous arko.projet.<id>.
    const index = await attendre(store().get('arko.projets'));
    const cle = `arko.projet.${index.courant}`;
    for (const p of index.projets) if (p.id === index.courant) p.etape = 'habiller';
    await attendre(store().put(index, 'arko.projets'));
    const projet = await attendre(store().get(cle));
    projet.etape = 'habiller';
    projet.recette.sousTitres = {
      style: 'karaoke',
      mots: [['jlb', 0.2, 0.5], ['est', 0.5, 0.7], ['là', 0.7, 1.0], ['gg', 1.2, 1.5], ['jlb,', 1.6, 1.9], ['incroyable', 2.0, 2.5, 1]],
    };
    await attendre(store().put(projet, cle));
  });
  await page.reload();
  await expect(page.getByTestId('montage-0')).toContainText('Habiller');
  const [selecteur] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('montage-ouvrir-0').click()]);
  await selecteur.setFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 30_000 });

  await toucher(page, 'outil-sousTitres');
  await expect(page.getByTestId('mot-5')).toHaveAttribute('data-fort', '1');
  await expect(page.getByTestId('calque-ligne-0')).toBeVisible();

  // Corriger partout : « jlb » → « JLB » pour les deux mots, ponctuation gardée, correction mémorisée.
  await toucher(page, 'mot-0');
  await capture(page, 'habiller-sous-titres-mot');
  await page.getByTestId('champ-mot').fill('JLB');
  await toucher(page, 'corriger-identiques', 'corriger-retenir', 'mot-corriger');
  await expect(page.getByTestId('mot-0')).toHaveText('JLB');
  await expect(page.getByTestId('mot-4')).toHaveText('JLB,');
  expect(await page.evaluate(() => localStorage.getItem('arko.corrections'))).toContain('JLB');
  // « Mots retenus » : la correction est listée, et Oublier l'efface.
  await expect(page.getByTestId('mots-retenus')).toContainText('JLB');
  await page.getByTestId('oublier-jlb').click();
  await expect(page.getByTestId('mots-retenus')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('arko.corrections') ?? '')).not.toContain('JLB');
  // Sans « mots identiques » : un seul mot change.
  await page.getByTestId('mot-0').click();
  await page.getByTestId('champ-mot').fill('Jlb');
  await toucher(page, 'mot-corriger');
  await expect(page.getByTestId('mot-0')).toHaveText('Jlb');
  await expect(page.getByTestId('mot-4')).toHaveText('JLB,');

  // Mettre en valeur, puis supprimer un mot.
  await toucher(page, 'mot-3', 'mot-en-valeur', 'mot-retour');
  await expect(page.getByTestId('mot-3')).toHaveAttribute('data-fort', '1');
  await toucher(page, 'mot-1', 'mot-supprimer');
  await expect(page.getByTestId('mot-1')).toHaveText('là');

  // Style, puis retirer et remettre avec Annuler.
  await page.getByTestId('style-sous-titres-boite').click();
  await expect(page.getByTestId('style-sous-titres-boite')).toHaveAttribute('aria-checked', 'true');
  await capture(page, 'habiller-sous-titres');
  await toucher(page, 'sous-titres-retirer');
  await expect(page.getByTestId('creer-sous-titres')).toBeVisible();
  await toucher(page, 'annuler');
  await expect(page.getByTestId('lignes-sous-titres')).toBeVisible();
});

test('Vertical : éditeur Jeu + webcam, réglage mémorisé', async ({ page }) => {
  await importer(page);
  await toucher(page, 'suivant', 'mise-jeuCam');
  await expect(page.getByTestId('editeur-webcam')).toBeVisible();

  // Déplacer le cadre, puis l'agrandir par le coin en bas à droite (zone de toucher ≥ 48 px).
  const cadre = page.getByTestId('cadre-webcam');
  const c0 = (await cadre.boundingBox())!;
  const poignee = (await page.getByTestId('poignee-cam-bd').boundingBox())!;
  expect(Math.min(poignee.width, poignee.height)).toBeGreaterThanOrEqual(48);
  await glisser(page, [c0.x + c0.width / 2, c0.y + c0.height / 2], [c0.x + c0.width / 2 + 60, c0.y + c0.height / 2 - 20], 6);
  const c1 = (await cadre.boundingBox())!;
  expect(c1.x).toBeGreaterThan(c0.x + 30);
  const p1 = (await page.getByTestId('poignee-cam-bd').boundingBox())!;
  await glisser(page, [p1.x + p1.width / 2, p1.y + p1.height / 2], [p1.x + p1.width / 2 + 20, p1.y + p1.height / 2 + 10], 5);
  expect((await cadre.boundingBox())!.width).toBeGreaterThan(c1.width + 10);

  // Au clavier : flèche droite = 1 %, Maj + flèche = 5 %.
  const avantClavier = (await cadre.boundingBox())!;
  await cadre.focus();
  await cadre.press('Shift+ArrowLeft');
  await expect.poll(async () => (await cadre.boundingBox())!.x).toBeLessThan(avantClavier.x - 10);
  await page.getByTestId('poignee-cam-bd').press('Shift+ArrowDown');
  await expect.poll(async () => (await cadre.boundingBox())!.height).toBeGreaterThan(avantClavier.height + 5);

  // Zone de jeu glissée, webcam en bas, taille 0,5.
  const jeu0 = (await page.getByTestId('zone-jeu').boundingBox())!;
  const src = (await page.getByTestId('cam-source').boundingBox())!;
  await glisser(page, [src.x + src.width * 0.8, src.y + src.height * 0.12], [src.x + src.width * 0.8 - 40, src.y + src.height * 0.12], 5);
  expect((await page.getByTestId('zone-jeu').boundingBox())!.x).toBeLessThan(jeu0.x - 20);
  await page.getByTestId('cam-en-bas').click();
  await expect(page.getByTestId('cam-en-bas')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('taille-webcam').fill('0.5');
  await capture(page, 'vertical-webcam');

  const memoire = await page.evaluate(() => JSON.parse(localStorage.getItem('arko.cam') ?? 'null'));
  expect(memoire).toMatchObject({ camEnHaut: false, partCam: 0.5, cam: { x: expect.any(Number) } });

  await toucher(page, 'webcam-ok');
  await expect(page.getByTestId('regler-webcam')).toBeVisible();
  await toucher(page, 'annuler'); // revient aux réglages précédents, pas à zéro
  await expect(page.getByTestId('mise-jeuCam')).toHaveAttribute('aria-checked', 'true');
});
