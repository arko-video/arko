// @ts-nocheck — outils Node (child_process, fs) : @types/node n'est pas installé dans le projet.
// Outils communs aux scénarios de QA de la phase 4 (vitesse, arrêt sur image, combos, modèles, Mes montages).
import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { boiteCouleur, imageRgb } from './p2-outils';
import { projetSauve } from './outils';

/**
 * 10 s, 720 × 1280 (vertical), 30 i/s, fond gris. Un carré ROUGE descend : y = 100 + 100·ts (px source),
 * donc la position du carré donne le temps source de l'image. Son : 440 Hz continu (0,1) + 3 « clics »
 * de 1 kHz très forts (0,8) à 2,0 / 5,0 / 7,5 s (pics connus pour l'aimant des combos).
 */
export const BOITE = 'tests/qa/fixtures/p4-boite-10s.mp4';
export const PICS_BOITE = [2.05, 5.05, 7.55];

/** Temps source estimé d'une image de l'export (1080 × 1920 = source × 1,5) d'après le carré rouge, ou null. */
export function tempsSourceImage(chemin: string, t: number, n?: number): number | null {
  const img = imageRgb(chemin, t, n);
  const b = boiteCouleur(img, [230, 20, 20], 60, 2);
  if (!b) return null;
  const ySource = (b.y0 * 1920) / 1.5;
  return Math.round(((ySource - 100) / 100) * 1000) / 1000;
}

/** Écart moyen (0–255) entre deux images d'une vidéo. */
export function ecartImages(chemin: string, t1: number, t2: number): number {
  const a = imageRgb(chemin, t1).d;
  const b = imageRgb(chemin, t2).d;
  let s = 0;
  for (let k = 0; k < a.length; k += 7) s += Math.abs(a[k] - b[k]);
  return s / (a.length / 7);
}

/** RMS du son entre t0 et t1 (mono 48 kHz). */
export function rms(x: Float32Array, t0: number, t1: number): number {
  const a = Math.max(0, Math.round(t0 * 48000));
  const b = Math.min(x.length, Math.round(t1 * 48000));
  let s = 0;
  for (let k = a; k < b; k++) s += x[k] * x[k];
  return Math.sqrt(s / Math.max(1, b - a));
}

/** Durée du conteneur (ffprobe). */
export function dureeMp4(chemin: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', chemin]).toString());
}

/** Avance la tête de `n` images (flèche droite) depuis sa position. */
export async function images(page: Page, n: number) {
  const tete = page.getByTestId('tete-lecture');
  await tete.focus();
  for (let i = 0; i < n; i++) await tete.press(n > 0 ? 'ArrowRight' : 'ArrowLeft');
}

export async function tete(page: Page): Promise<number> {
  return Number(await page.getByTestId('tete-lecture').getAttribute('aria-valuenow'));
}

/** Attend la sauvegarde de la recette telle que `cond`. */
export async function recetteSauvee(page: Page, cond: (r: any) => boolean, timeout = 8000): Promise<any> {
  let r: any = null;
  await expect
    .poll(async () => {
      r = (await projetSauve(page))?.recette ?? null;
      return !!r && cond(r);
    }, { timeout, intervals: [200] })
    .toBe(true);
  return r;
}

/** Clés de la base keyval-store. */
export async function clesIdb(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((ok) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const g = req.result.transaction('keyval').objectStore('keyval').getAllKeys();
          g.onsuccess = () => ok((g.result as IDBValidKey[]).map(String));
          g.onerror = () => ok([]);
        };
        req.onerror = () => ok([]);
      }),
  );
}
