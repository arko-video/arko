// Fonctions PURES sur les petites images (32 × 18) tirées des images clés : niveaux de gris,
// différence entre deux images, et changements de scène.

import type { Sec } from '../recette/types';

/** Taille des petites images comparées : assez pour voir un changement de scène, presque rien à calculer. */
export const IMAGE_L = 32;
export const IMAGE_H = 18;

/** Une image clé analysée : son temps et sa différence avec la précédente (0 = identique, 1 = tout a changé). */
export interface Difference {
  t: Sec;
  d: number;
}

/** Passe une image RGBA (getImageData) en niveaux de gris, une valeur de 0 à 255 par pixel. */
export function enGris(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const n = Math.floor(rgba.length / 4);
  const res = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    res[i] = Math.round(0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!);
  }
  return res;
}

/** Différence moyenne entre deux images en gris de même taille, de 0 à 1. */
export function difference(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i]! - b[i]!);
  return s / (n * 255);
}

/** Médiane d'une liste de nombres (0 si vide). */
export function mediane(x: number[]): number {
  if (x.length === 0) return 0;
  const t = [...x].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
}

/**
 * Changements de scène : images clés très différentes de la précédente.
 * Il faut dépasser `seuil` ET être nettement au-dessus de la différence habituelle de la vidéo
 * (dans un jeu, l'image bouge tout le temps : on ne veut que les vrais sauts).
 */
export function changementsDeScene(diffs: Difference[], seuil = 0.2, facteur = 3): Difference[] {
  const habituelle = mediane(diffs.map((x) => x.d));
  const limite = Math.max(seuil, habituelle * facteur);
  return diffs.filter((x) => x.d >= limite);
}
