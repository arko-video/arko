// @ts-nocheck — outils Node (child_process, fs) : @types/node n'est pas installé dans le projet.
// Outils communs aux scénarios de QA de la phase 2 (Habiller).
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allerAEtape, CAPTURES, cleCourante, importer, projetSauve, repartirDeZero, rouvrirDernier } from './outils';

export const GRIS = 'tests/qa/fixtures/p2-gris-10s.mp4';
export const JEUCAM = 'tests/qa/fixtures/p2-jeucam.mp4';
export const CHARGE = 'tests/qa/fixtures/p2-charge-10s.mp4';
export const PAROLE = 'tests/fixtures/parole-fr.mp4';
export const MODELES = 'tests/fixtures/modeles';
export const CITRON = [200, 255, 77];

/** Repart de zéro, importe la vidéo et va jusqu'à Habiller (étape 4 sur 5). */
export async function allerAHabiller(page: Page, fichier: string) {
  await repartirDeZero(page);
  await importer(page, fichier);
  await allerAEtape(page, 4);
  await expect(page.getByTestId('barre-outils')).toBeVisible();
}

/**
 * Modifie la recette sauvegardée (IndexedDB) puis reprend le projet à Habiller avec le même fichier.
 * `patch` est fusionné dans projet.recette (ex. { sousTitres: {...} }).
 */
export async function injecter(page: Page, fichier: string, patch: Record<string, unknown>) {
  await expect.poll(async () => !!(await projetSauve(page)), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(1200); // dernière sauvegarde écrite
  const cle = await cleCourante(page);
  await page.evaluate(async ({ patch, cle }) => {
    const db = await new Promise<IDBDatabase>((ok, ko) => {
      const req = indexedDB.open('keyval-store');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error);
    });
    const store = () => db.transaction('keyval', 'readwrite').objectStore('keyval');
    const projet = await new Promise<any>((ok) => {
      const req = store().get(cle);
      req.onsuccess = () => ok(req.result);
    });
    projet.etape = 'habiller';
    Object.assign(projet.recette, patch);
    await new Promise((ok) => {
      const req = store().put(projet, cle);
      req.onsuccess = ok;
    });
  }, { patch, cle });
  await page.reload();
  // Phase 4 : la carte « Reprendre » est remplacée par « Mes montages ».
  // (le résumé de l'index garde l'ancienne étape : seule la sauvegarde du projet est modifiée)
  await expect(page.getByTestId('montage-0')).toBeVisible();
  await rouvrirDernier(page, fichier);
  await expect(page.getByTestId('etape')).toHaveText('Étape 4 sur 5', { timeout: 30_000 });
}

/** Attend que la recette sauvegardée vérifie `cond` (la sauvegarde auto écrit 1 s après chaque action). */
export async function recetteQuand(page: Page, cond: (r: any) => boolean, timeout = 6000): Promise<any> {
  let derniere: any = null;
  await expect
    .poll(
      async () => {
        derniere = (await projetSauve(page))?.recette ?? null;
        return derniere ? cond(derniere) : false;
      },
      { timeout, intervals: [200] },
    )
    .toBe(true);
  return derniere;
}

/** Dimensions d'une vidéo (ffprobe). */
export function dimensions(chemin: string): { l: number; h: number } {
  const s = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', chemin]).toString().trim();
  const [l, h] = s.split(',').map(Number);
  return { l, h };
}

/** Image complète au temps t (RGB 24 bits). `n` = numéro d'image (prioritaire sur t) pour l'image exacte. */
export function imageRgb(chemin: string, t: number, n?: number): { l: number; h: number; d: Uint8Array } {
  const { l, h } = dimensions(chemin);
  const args =
    n !== undefined
      ? ['-v', 'error', '-i', chemin, '-vf', `select=eq(n\\,${n})`, '-vsync', '0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
      : ['-v', 'error', '-ss', String(t), '-i', chemin, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
  const d = execFileSync('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });
  return { l, h, d: new Uint8Array(d) };
}

/** Enregistre une image de la vidéo en PNG dans les captures (pour la regarder). */
export function capturerImage(chemin: string, t: number, nom: string, n?: number): string {
  const sortie = CAPTURES + nom + '.png';
  const args =
    n !== undefined
      ? ['-v', 'error', '-y', '-i', chemin, '-vf', `select=eq(n\\,${n}),scale=540:-1`, '-vsync', '0', '-frames:v', '1', sortie]
      : ['-v', 'error', '-y', '-ss', String(t), '-i', chemin, '-vf', 'scale=540:-1', '-frames:v', '1', sortie];
  execFileSync('ffmpeg', args);
  return sortie;
}

export interface Cadre {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  n: number;
}

/** Boîte (en fractions 0–1) des pixels proches de la couleur `c` (écart max `tol` par canal). */
export function boiteCouleur(img: { l: number; h: number; d: Uint8Array | Uint8ClampedArray | number[] }, c: number[], tol = 40, pas = 4): Cadre | null {
  const { l, h, d } = img;
  const canaux = d.length / (l * h);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
  for (let y = 0; y < h; y += pas) {
    for (let x = 0; x < l; x += pas) {
      const i = (y * l + x) * canaux;
      if (Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol && Math.abs(d[i + 2] - c[2]) <= tol) {
        n++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (n < 3) return null;
  return { x0: x0 / l, y0: y0 / h, x1: (x1 + pas) / l, y1: (y1 + pas) / h, n };
}

/** Énergie des contours (|∇ luminance| moyen) dans la bande [y0, y1] (fractions) d'une image RGB. */
export function energie(img: { l: number; h: number; d: Uint8Array | number[] }, y0: number, y1: number, x0 = 0.1, x1 = 0.9): number {
  const { l, h, d } = img;
  const c = d.length / (l * h);
  const lum = (x: number, y: number) => {
    const i = (y * l + x) * c;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };
  let s = 0, n = 0;
  for (let y = Math.round(y0 * h); y < Math.round(y1 * h) - 1; y += 2) {
    for (let x = Math.round(x0 * l); x < Math.round(x1 * l) - 1; x += 2) {
      s += Math.abs(lum(x, y) - lum(x + 1, y)) + Math.abs(lum(x, y) - lum(x, y + 1));
      n++;
    }
  }
  return s / Math.max(1, n);
}

/** Pixels RGBA du canevas d'aperçu (540 × 960). */
export async function apercuRgba(page: Page): Promise<{ l: number; h: number; d: number[] }> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    return { l: c.width, h: c.height, d: Array.from(d) };
  });
}

/** Attend que l'aperçu ne change plus (3 lectures identiques). */
export async function apercuStable(page: Page) {
  let prec = '';
  let same = 0;
  for (let i = 0; i < 60; i++) {
    const e = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="apercu"] canvas')!;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let s = 0;
      for (let k = 0; k < d.length; k += 4 * 499) s += d[k]! * 3 + d[k + 1]! * 5 + d[k + 2]!;
      return s;
    });
    if (e > 0 && String(e) === prec) same++;
    else same = 0;
    if (same >= 2) return;
    prec = String(e);
    await page.waitForTimeout(150);
  }
}

/** Réduit une image RGB(A) l×h en niveaux de gris 270×480 (moyenne par blocs) pour comparer aperçu et export. */
export function grisReduit(img: { l: number; h: number; d: ArrayLike<number> }, L = 270, H = 480): Float64Array {
  const { l, h, d } = img;
  const c = d.length / (l * h);
  const res = new Float64Array(L * H);
  const nb = new Float64Array(L * H);
  for (let y = 0; y < h; y++) {
    const Y = Math.min(H - 1, Math.floor((y * H) / h));
    for (let x = 0; x < l; x++) {
      const X = Math.min(L - 1, Math.floor((x * L) / l));
      const i = (y * l + x) * c;
      res[Y * L + X] += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      nb[Y * L + X]++;
    }
  }
  for (let k = 0; k < res.length; k++) res[k] /= nb[k] || 1;
  return res;
}

export function psnr(a: Float64Array, b: Float64Array, masque?: (k: number) => boolean): number {
  let s = 0, n = 0;
  for (let k = 0; k < a.length; k++) {
    if (masque && !masque(k)) continue;
    s += (a[k] - b[k]) ** 2;
    n++;
  }
  const mse = s / Math.max(1, n);
  return mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
}

/** Sert le vrai modèle Whisper depuis tests/fixtures/modeles/ à la place de huggingface.co ; bloque les CDN de code. */
export async function servirModele(contexte: BrowserContext | Page, journal: { hf: string[]; cdn: string[]; horsLigne?: boolean }) {
  await contexte.route(/^https:\/\/([a-z0-9-]+\.)*(huggingface\.co|hf\.co)\//, async (route) => {
    const url = new URL(route.request().url());
    const plage = route.request().headers()['range'];
    journal.hf.push(`${plage ? 'RANGE' : route.request().method()} ${url.pathname}`);
    if (journal.horsLigne) return route.abort('internetdisconnected');
    const m = /^\/(.+?)\/resolve\/[^/]+\/(.+)$/.exec(url.pathname);
    const chemin = m ? join(MODELES, m[1], m[2]) : '';
    const entetes = {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'Content-Range, Content-Length',
      'content-type': 'application/octet-stream',
    };
    if (!chemin || !existsSync(chemin)) return route.fulfill({ status: 404, headers: entetes, body: 'absent' });
    const corps = readFileSync(chemin);
    if (plage === 'bytes=0-0') {
      return route.fulfill({ status: 206, headers: { ...entetes, 'content-range': `bytes 0-0/${corps.length}` }, body: corps.subarray(0, 1) });
    }
    return route.fulfill({ status: 200, headers: entetes, body: corps });
  });
  await contexte.route(/jsdelivr|unpkg\.com|cdnjs|esm\.sh|skypack|jspm/, (route) => {
    journal.cdn.push(route.request().url());
    return route.abort();
  });
}

/** Relève les violations de CSP (page et Workers). */
export async function surveillerCsp(page: Page): Promise<string[]> {
  const csp: string[] = [];
  const noter = (t: string) => {
    if (/Content Security Policy|\[CSP\]/i.test(t)) csp.push(t);
  };
  page.on('console', (m) => noter(m.text()));
  page.on('worker', (w) => w.on('console', (m) => noter(m.text())));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`[CSP] ${e.violatedDirective} ${e.blockedURI}`));
  });
  return csp;
}

/** Ajoute un texte à la tête de lecture avec l'outil Texte, et choisit son style. */
export async function ajouterTexte(page: Page, txt: string, style?: string) {
  await page.getByTestId('outil-texte').click();
  await page.getByTestId('champ-texte').fill(txt);
  await page.getByTestId('champ-texte').press('Enter');
  if (style) {
    await page.getByTestId(`style-texte-${style}`).click();
    await expect(page.getByTestId(`style-texte-${style}`)).toHaveAttribute('aria-checked', 'true');
  }
}

/** Ferme le panneau ouvert (retour à la barre d'outils). */
export async function fermerPanneau(page: Page) {
  await page.getByTestId('panneau-fermer').click();
  await expect(page.getByTestId('barre-outils')).toBeVisible();
}
