// Outil « Couper » de Habiller au format téléphone (360 × 800), dans Chrome headless : un texte et un son posés,
// puis on scinde, on supprime le passage du milieu et on coupe la fin SANS revenir à l'étape Couper ;
// Annuler / Rétablir ; export. Dans le MP4 : la durée est la bonne et le texte est toujours à son moment.
// Le son posé dans le passage supprimé n'est plus dans la vidéo. Captures facultatives : ARKO_CAPTURES=/dossier.

import { expect, test, type Page } from '@playwright/test';

const VIDEO = 'tests/fixtures/test-1920x1080.mp4'; // 5 s
const CAPTURES = process.env.ARKO_CAPTURES;

test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 });

async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  await page.waitForTimeout(800); // l'aperçu finit de dessiner
  await page.screenshot({ path: `${CAPTURES}/${nom}.png` });
}

/** Tête de lecture à n secondes, au clavier (Début puis n × « +1 s »). */
async function teteA(page: Page, n: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  for (let i = 0; i < n; i++) await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', String(n));
}

/** Énergie des contours (moyenne de |∇ luminance|) dans une bande horizontale de l'image du MP4 au temps t. */
async function energie(page: Page, t: number, bande: [number, number]): Promise<number> {
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

test('Habiller → Couper : scinder, supprimer un passage, couper la fin, annuler, export', async ({ page }) => {
  page.on('pageerror', (e) => console.log('[page]', e.message));
  await page.goto('./');
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });
  await page.getByTestId('suivant').click();
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');

  // Un texte à 1 s (de 1 à 4 s), et un son à 3 s, dans le passage qu'on va supprimer.
  await teteA(page, 1);
  await page.getByTestId('outil-texte').click();
  await page.getByTestId('champ-texte').fill('GG les gars');
  await page.getByTestId('champ-texte').press('Enter');
  await page.getByTestId('panneau-fermer').click();
  const boite = page.getByTestId('texte-boite-0');
  await expect(boite).toBeVisible();
  const [b, ap] = [(await boite.boundingBox())!, (await page.getByTestId('apercu').boundingBox())!];
  const bande: [number, number] = [(b.y - ap.y) / ap.height, (b.y + b.height - ap.y) / ap.height];
  await teteA(page, 3);
  await page.getByTestId('outil-sons').click();
  await page.getByTestId('famille-impact').click();
  await page.getByTestId('son-ajouter-impact.boom').click();
  await expect(page.locator('[data-testid^="calque-son-"]')).toHaveCount(1);
  await page.getByTestId('panneau-fermer').click();

  // L'outil Couper : premier de la barre, l'aperçu reste visible au-dessus du panneau.
  await expect(page.getByTestId('barre-outils').locator('button').first()).toHaveAttribute('data-testid', 'outil-couper');
  if (CAPTURES) await page.waitForTimeout(2600); // le message « Boom ajouté » s'efface
  await capture(page, 'habiller-couper-barre');
  await page.getByTestId('outil-couper').click();
  await expect(page.getByTestId('panneau-couper')).toBeVisible();
  await expect(page.getByTestId('apercu')).toBeInViewport();
  await expect(page.getByTestId('calque-plan-0')).toBeVisible();
  await expect(page.getByTestId('coupe-supprimer')).toBeDisabled(); // un seul plan
  for (const id of ['coupe-scinder', 'coupe-supprimer', 'coupe-debut', 'coupe-fin', 'calque-plan-0', 'panneau-fermer']) {
    const t = (await page.getByTestId(id).boundingBox())!;
    expect(Math.min(t.width, t.height), `${id} : cible d'au moins 44 px`).toBeGreaterThanOrEqual(44);
  }
  await capture(page, 'habiller-couper-panneau');

  // Scinder à 2 s et 4 s : 3 plans, limites visibles sur la mini-frise.
  for (const n of [2, 4]) {
    await teteA(page, n);
    await page.getByTestId('coupe-scinder').click();
  }
  await expect(page.getByTestId('calque-plan-2')).toBeVisible();
  const [p0, p1] = [(await page.getByTestId('calque-plan-0').boundingBox())!, (await page.getByTestId('calque-plan-1').boundingBox())!];
  expect(p1.x, 'les plans ne se recouvrent pas').toBeGreaterThanOrEqual(p0.x + p0.width);

  // Toucher le plan du milieu le choisit (la tête ne bouge pas), puis Supprimer.
  await page.getByTestId('calque-plan-1').click();
  await expect(page.getByTestId('calque-plan-1')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('coupe-plan')).toContainText('Plan 2 sur 3');
  await expect(page.getByTestId('tete-lecture')).toHaveAttribute('aria-valuenow', '4');
  await capture(page, 'habiller-couper-selection');
  await page.getByTestId('coupe-supprimer').click();
  await expect(page.getByTestId('calque-plan-2')).toHaveCount(0);
  await expect(page.getByTestId('coupe-duree')).toContainText('3,0');
  // La tête se pose sur la jointure, et le plan visé est celui qui suit.
  await expect(page.getByTestId('tete-lecture')).toHaveAttribute('aria-valuenow', '2');
  await expect(page.getByTestId('calque-plan-1')).toHaveAttribute('aria-pressed', 'true');

  // Annuler / Rétablir.
  await page.getByTestId('annuler').click();
  await expect(page.getByTestId('calque-plan-2')).toBeVisible();
  await expect(page.getByTestId('coupe-duree')).toContainText('5,0');
  await page.getByTestId('retablir').click();
  await expect(page.getByTestId('calque-plan-2')).toHaveCount(0);
  await expect(page.getByTestId('coupe-duree')).toContainText('3,0');

  // Couper la fin du 2ᵉ plan à 2,2 s (tête à 2 s + 6 images).
  await teteA(page, 2);
  for (let i = 0; i < 6; i++) await page.getByTestId('image-plus').click();
  await expect(page.getByTestId('coupe-plan')).toContainText('Plan 2 sur 2');
  await page.getByTestId('coupe-fin').click();
  await expect(page.getByTestId('coupe-duree')).toContainText('2,2');
  await capture(page, 'habiller-couper-apres');
  await page.getByTestId('panneau-fermer').click();

  // Le son du passage supprimé n'est plus sur la frise ; le texte, lui, est toujours là, à 1 s.
  await page.getByTestId('outil-sons').click();
  await expect(page.locator('[data-testid^="calque-son-"]')).toHaveCount(0);
  await page.getByTestId('panneau-fermer').click();
  await page.getByTestId('outil-texte').click();
  await expect(page.locator('[data-testid^="calque-texte-"]')).toHaveCount(1);
  await expect(page.getByTestId('calque-texte-0')).toHaveAttribute('aria-label', /0:01/);
  await page.getByTestId('panneau-fermer').click();

  // Export : durée 2,2 s ; le texte est dans l'image à 1,5 s, pas à 0,5 s.
  await page.getByTestId('suivant').click();
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 180_000 });
  const duree = await page.getByTestId('video-finale').evaluate(async (v: HTMLVideoElement) => {
    if (v.readyState < 1) await new Promise((ok) => v.addEventListener('loadedmetadata', ok, { once: true }));
    return v.duration;
  });
  console.log(`durée exportée : ${duree.toFixed(3)} s`);
  expect(Math.abs(duree - 2.2)).toBeLessThan(0.08);
  const [sans, avec] = [await energie(page, 0.5, bande), await energie(page, 1.5, bande)];
  console.log(`énergie des contours (bande du texte) : ${sans.toFixed(1)} sans texte, ${avec.toFixed(1)} avec`);
  expect(avec).toBeGreaterThan(Math.max(4, sans * 2));
});
