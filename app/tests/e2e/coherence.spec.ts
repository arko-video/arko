// Cohérence aperçu = export (architecture.md §5 : « Aperçu ≠ export → rendre() unique, test PSNR > 30 dB »).
// 1. On importe la vidéo de test, on garde Fond flou, on met la tête de lecture à 1,0 s au clavier
//    (l'aperçu reste en pause) et on lit les pixels du canevas d'aperçu (540 × 960).
// 2. On exporte, puis on décode DANS LA PAGE l'image du MP4 exporté au même temps :
//    un <video> sur l'URL blob du fichier, un seek, puis drawImage sur un canevas 540 × 960.
// 3. On compare les deux images avec le PSNR calculé sur la luminance.
// Pas de ffmpeg : tout se fait dans Chrome (Romain lance les tests sous Windows sans ffmpeg).

import { expect, test, type Page } from '@playwright/test';

const VIDEO = 'tests/fixtures/test-1920x1080.mp4';
const L = 540;
const H = 960;
const IMAGES_PAR_SECONDE = 30;
const PSNR_MIN_DB = 30;

/** Relève les erreurs de Content-Security-Policy (page et Workers) pour vérifier la CSP (M-14). */
async function surveillerCsp(page: Page): Promise<string[]> {
  const erreurs: string[] = [];
  const noter = (texte: string) => {
    if (/Content Security Policy|Content-Security-Policy|\[CSP\]/i.test(texte)) erreurs.push(texte);
  };
  page.on('console', (m) => noter(m.text()));
  page.on('pageerror', (e) => noter(e.message));
  page.on('worker', (w) => w.on('console', (m) => noter(m.text())));
  // Le navigateur prévient aussi la page par un événement à chaque blocage.
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`[CSP] ${e.violatedDirective} a bloqué ${e.blockedURI || '(code en ligne)'}`);
    });
  });
  return erreurs;
}

/**
 * Attend que l'aperçu ait fini de dessiner : l'image n'est pas noire et ne change plus
 * pendant 3 lectures de suite (toutes les 150 ms).
 */
async function attendreApercuStable(page: Page) {
  let precedente = '';
  let identiques = 0;
  for (let i = 0; i < 60; i++) {
    const empreinte = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas')!;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      // Somme d'un pixel sur 997 : assez pour voir si l'image change.
      let somme = 0;
      for (let k = 0; k < d.length; k += 4 * 997) somme += d[k]! + d[k + 1]! + d[k + 2]!;
      return somme;
    });
    const texte = String(empreinte);
    if (empreinte > 0 && texte === precedente) identiques++;
    else identiques = 0;
    if (identiques >= 2) return;
    precedente = texte;
    await page.waitForTimeout(150);
  }
  throw new Error("L'aperçu ne s'est pas stabilisé (image noire ou qui change encore).");
}

/** Luminance (0 à 255, arrondie) de chaque pixel du canevas d'aperçu. Coefficients BT.709 (vidéo HD). */
async function luminanceApercu(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const lum: number[] = new Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      lum[j] = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
    }
    return lum;
  });
}

test('aperçu et export donnent la même image (PSNR luminance > 30 dB)', async ({ page }, testInfo) => {
  const erreursCsp = await surveillerCsp(page);
  page.on('pageerror', (e) => console.log('[page]', e.message));

  await page.goto('./');
  await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');

  // 1. Importer.
  await page.getByTestId('fichier').setInputFiles(VIDEO);
  await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });

  // 2. Couper : tête de lecture à 1,0 s (Début puis « +1 s » avec Page haut). L'aperçu reste en pause.
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  await tete.press('Home');
  await tete.press('PageUp');
  await expect(tete).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByTestId('apercu')).toHaveAttribute('data-lecture', '0');

  // La recette de départ est déjà en Fond flou : l'aperçu de Couper montre donc l'image finale.
  const taille = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas')!;
    return [c.width, c.height];
  });
  expect(taille, 'taille du canevas d’aperçu').toEqual([L, H]);
  await attendreApercuStable(page);
  const apercu = await luminanceApercu(page);

  // 3. Vertical : on vérifie que Fond flou est bien choisi, sans rien changer.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 3 sur 5');
  await expect(page.getByTestId('mise-flou')).toHaveAttribute('aria-checked', 'true');

  // 4. Habiller : on n'ajoute rien.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5');

  // 5. Exporter.
  await page.getByTestId('suivant').click();
  await expect(page.getByTestId('etape')).toHaveText('Étape 5 sur 5');
  await page.getByTestId('creer-video').click();
  await expect(page.getByTestId('video-prete')).toBeVisible({ timeout: 150_000 });
  const url = await page.getByTestId('video-finale').getAttribute('src');
  expect(url, 'URL blob du MP4 exporté').toMatch(/^blob:/);

  // 5. Décoder le MP4 exporté dans la page et comparer.
  // Pourquoi trois images ? L'aperçu est à t = 1,0 s, ce qui correspond à l'image n° 30 de l'export
  // (30 images par seconde : l'image n vit de n/30 à (n+1)/30). Un seek à 1,0 s pile peut tomber
  // sur l'image 29 ou 30 selon les arrondis des horodatages du MP4. On vise donc le MILIEU de chaque
  // image (n + 0,5)/30, et on compare aux images 29, 30 et 31 (soit ±1 image) : on garde le meilleur PSNR.
  // Mesuré le 3/11/2026 : image 30 = 46,6 dB ; images 29 et 31 ≈ 31,2 dB (la vidéo de test bouge peu,
  // donc ce test ne repère pas à coup sûr un décalage d'une seule image).
  const numeros = [29, 30, 31];
  const temps = numeros.map((n) => (n + 0.5) / IMAGES_PAR_SECONDE);

  const mesures = await page.evaluate(
    async ({ url, temps, reference, L, H }) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      // On l'ajoute (tout petit, dans un coin) pour que Chrome dessine bien les images après un seek.
      video.style.position = 'fixed';
      video.style.right = '0';
      video.style.bottom = '0';
      video.style.width = '54px';
      video.style.height = '96px';
      video.style.pointerEvents = 'none';
      document.body.appendChild(video);
      try {
        const pret = new Promise<void>((ok, ko) => {
          video.onloadeddata = () => ok();
          video.onerror = () => ko(new Error('Le MP4 exporté ne peut pas être lu par <video>.'));
        });
        video.src = url;
        await pret;

        const canevas = document.createElement('canvas');
        canevas.width = L;
        canevas.height = H;
        const ctx = canevas.getContext('2d', { willReadFrequently: true })!;
        ctx.imageSmoothingQuality = 'high';

        const resultats: { t: number; psnr: number; ecartMoyen: number }[] = [];
        for (const t of temps) {
          const fini = new Promise<void>((ok) => (video.onseeked = () => ok()));
          video.currentTime = t;
          await fini;
          // On attend que l'image soit vraiment affichée (au plus 500 ms).
          await new Promise<void>((ok) => {
            setTimeout(ok, 500);
            if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(() => ok());
          });
          ctx.drawImage(video, 0, 0, L, H);
          const d = ctx.getImageData(0, 0, L, H).data;
          // PSNR = 10 × log10(255² / EQM), EQM = moyenne des carrés des écarts de luminance.
          let sommeCarres = 0;
          let sommeEcarts = 0;
          for (let i = 0, j = 0; i < d.length; i += 4, j++) {
            const lum = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
            const ecart = lum - reference[j]!;
            sommeCarres += ecart * ecart;
            sommeEcarts += Math.abs(ecart);
          }
          const n = d.length / 4;
          const eqm = sommeCarres / n;
          const psnr = eqm === 0 ? Infinity : 10 * Math.log10((255 * 255) / eqm);
          resultats.push({ t, psnr, ecartMoyen: sommeEcarts / n });
        }
        return resultats;
      } finally {
        video.remove();
      }
    },
    { url: url!, temps, reference: apercu, L, H },
  );

  const texte = mesures
    .map((m, i) => `image ${numeros[i]} (t = ${m.t.toFixed(3)} s) : ${m.psnr.toFixed(2)} dB, écart moyen ${m.ecartMoyen.toFixed(2)}`)
    .join(' | ');
  console.log('[PSNR]', texte);
  testInfo.annotations.push({ type: 'PSNR aperçu / export', description: texte });

  const meilleur = Math.max(...mesures.map((m) => m.psnr));
  expect(meilleur, `meilleur PSNR (${texte})`).toBeGreaterThan(PSNR_MIN_DB);
  expect(erreursCsp, 'erreurs de Content-Security-Policy').toEqual([]);
});
