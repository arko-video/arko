// Bug B-1 (rapport de QA) : l'aperçu reste noir à l'arrivée sur Couper et sur Vertical.
// On importe la vidéo de test SANS toucher à rien d'autre (pas de flèche, pas de lecture :
// un geste ferait réapparaître l'image et cacherait le bug).
// 1,5 s après l'arrivée sur l'écran, le centre du canevas d'aperçu ne doit pas être noir.
// Le bug est intermittent (5 cas sur 6) : on répète le parcours 3 fois.

import { expect, test, type Page } from '@playwright/test';

const VIDEO = 'tests/fixtures/test-1920x1080.mp4';
const ATTENTE_MS = 1500;
const REPETITIONS = 3;

/** Couleur moyenne (R, V, B) d'un carré de 20 × 20 px au centre du canevas d'aperçu (540 × 960). */
async function couleurCentre(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return [-1, -1, -1];
    const cote = 20;
    const x = Math.round(canvas.width / 2 - cote / 2);
    const y = Math.round(canvas.height / 2 - cote / 2);
    const d = ctx.getImageData(x, y, cote, cote).data;
    const somme = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      somme[0]! += d[i]!;
      somme[1]! += d[i + 1]!;
      somme[2]! += d[i + 2]!;
    }
    const n = d.length / 4;
    return somme.map((s) => Math.round(s / n));
  });
}

/** « Noir » = les trois composantes sous 10 / 255. */
function estNoir(rvb: number[]): boolean {
  return rvb.every((c) => c < 10);
}

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

for (let essai = 1; essai <= REPETITIONS; essai++) {
  test(`aperçu affiché à l'arrivée sur Couper et sur Vertical (essai ${essai}/${REPETITIONS})`, async ({ page }) => {
    const erreursCsp = await surveillerCsp(page);

    await page.goto('./');
    await expect(page.getByTestId('etape')).toContainText('Étape 1 sur 5');

    // Importer : choisir la vidéo fait passer tout seul à Couper.
    await page.getByTestId('fichier').setInputFiles(VIDEO);
    await expect(page.getByTestId('etape')).toHaveText('Étape 2 sur 5', { timeout: 30_000 });

    // Couper : on attend 1,5 s sans rien toucher, puis on lit le centre de l'aperçu.
    await page.waitForTimeout(ATTENTE_MS);
    const couper = await couleurCentre(page);
    // expect.soft : on continue même si ça échoue, pour tester aussi Vertical.
    expect.soft(estNoir(couper), `centre de l'aperçu sur Couper : rvb(${couper.join(', ')})`).toBe(false);

    // Vertical : on garde Fond flou (choix par défaut), toujours sans toucher à l'aperçu.
    await page.getByTestId('suivant').click();
    await expect(page.getByTestId('etape')).toHaveText('Étape 3 sur 5');
    await expect(page.getByTestId('mise-flou')).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(ATTENTE_MS);
    const vertical = await couleurCentre(page);
    expect.soft(estNoir(vertical), `centre de l'aperçu sur Vertical : rvb(${vertical.join(', ')})`).toBe(false);

    expect(erreursCsp, 'erreurs de Content-Security-Policy').toEqual([]);
  });
}
