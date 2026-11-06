// D. Rogner une capture OBS (dev 1), fonctions PURES : trouver les bandes FIXES en haut, en bas et sur les côtés
// (lignes quasi identiques sur 20 images réparties dans la vidéo : barre de titre Windows ≈ 20 px, barre des tâches
// ≈ 40 px en 720p), puis le cadre gardé au format de sortie (on recadre en 16:9 puis on agrandit).
// Exemple vérifié : 1280 × 720, haut 20, bas 40 → recadrage 1173 × 660 à (53, 20).

import type { Rognage } from '../../recette/types';

/** Une image réduite en niveaux de gris (luma 0 à 255), ligne par ligne. */
export interface ImageGrise {
  l: number;
  h: number;
  px: Uint8Array;
}

/** Épaisseur des bandes fixes, en pixels DE LA SOURCE. */
export interface Bords {
  haut: number;
  bas: number;
  gauche: number;
  droite: number;
}

export interface OptionsBords {
  /** Écart de luma toléré pour dire qu'une ligne « ne bouge pas » (défaut 6). */
  tolerance?: number;
  /** Une bande ne dépasse jamais cette part de l'image (défaut 0,15). */
  partMax?: number;
}

export const AUCUN_BORD: Bords = { haut: 0, bas: 0, gauche: 0, droite: 0 };

/** Marge de sécurité ajoutée à chaque bande trouvée (pixels source). */
export const MARGE_PX = 2;

/** Écart (plus clair − plus sombre) de chaque pixel sur toutes les images. */
function ecarts(images: readonly ImageGrise[]): Uint8Array {
  const { l, h } = images[0]!;
  const n = l * h;
  const min = new Uint8Array(n).fill(255);
  const max = new Uint8Array(n);
  for (const im of images) {
    for (let i = 0; i < n; i++) {
      const v = im.px[i]!;
      if (v < min[i]!) min[i] = v;
      if (v > max[i]!) max[i] = v;
    }
  }
  const res = new Uint8Array(n);
  for (let i = 0; i < n; i++) res[i] = max[i]! - min[i]!;
  return res;
}

/**
 * Une ligne (ou colonne) est FIXE si la moitié de ses pixels bougent de moins de 2 × tolérance et 90 % de moins de
 * 6 × tolérance. Ainsi l'horloge et les icônes de la barre des tâches (quelques % des pixels) ne comptent pas, ni
 * le léger « bavé » de la compression vidéo au ras de la barre ; une image de jeu, elle, bouge presque partout.
 */
function estFixe(valeurs: (k: number) => number, n: number, tolerance: number, souple = false): boolean {
  const histo = new Uint32Array(256);
  for (let k = 0; k < n; k++) histo[valeurs(k)]!++;
  const rang = (part: number) => {
    let cumul = 0;
    for (let v = 0; v < 256; v++) {
      cumul += histo[v]!;
      if (cumul >= part * n) return v;
    }
    return 255;
  };
  // Ligne « souple » : celle juste après une bande, à moitié dans la barre (bavé plus fort) : on l'enlève aussi.
  return souple ? rang(0.5) <= 4 * tolerance : rang(0.5) <= 2 * tolerance && rang(0.9) <= 6 * tolerance;
}

/**
 * Nombre de lignes (ou colonnes) fixes contiguës depuis un bord, plus la ligne de frontière si elle est presque
 * fixe ; 0 si la bande dépasse `max` (ce n'est pas une barre).
 */
function bande(fixe: (i: number, souple?: boolean) => boolean, ordre: number[], max: number): number {
  let n = 0;
  for (const i of ordre) {
    if (!fixe(i)) break;
    n++;
  }
  if (n > 0 && n < ordre.length && fixe(ordre[n]!, true)) n++;
  return n > max ? 0 : n;
}

/**
 * Bandes fixes communes à toutes les images (≥ 2 images). `lSource`, `hSource` = taille de la vraie source,
 * pour rendre les épaisseurs en pixels source. Aucune bande : tout à 0.
 */
export function detecterBords(images: readonly ImageGrise[], lSource: number, hSource: number, options: OptionsBords = {}): Bords {
  const premiere = images[0];
  if (images.length < 2 || !premiere || premiere.l < 2 || premiere.h < 2) return { ...AUCUN_BORD };
  const { l, h } = premiere;
  if (images.some((im) => im.l !== l || im.h !== h || im.px.length < l * h)) return { ...AUCUN_BORD };
  const e = ecarts(images);
  const tolerance = options.tolerance ?? 6;
  const partMax = options.partMax ?? 0.15;
  const ligneFixe = (y: number, souple?: boolean) => estFixe((x) => e[y * l + x]!, l, tolerance, souple);
  const colonneFixe = (x: number, souple?: boolean) => estFixe((y) => e[y * l + x]!, h, tolerance, souple);
  const lignes = [...Array(h).keys()];
  const colonnes = [...Array(l).keys()];
  const maxL = Math.floor(partMax * h);
  const maxC = Math.floor(partMax * l);
  // Une ligne à moitié dans la barre bouge : on arrondit vers le HAUT en pixels source, plus une marge de
  // MARGE_PX (mieux vaut 2 px de jeu en moins qu'un trait de barre des tâches qui reste visible).
  const enSourceH = (n: number) => (n > 0 ? Math.min(hSource, Math.ceil((n * hSource) / h - 1e-6) + MARGE_PX) : 0);
  const enSourceL = (n: number) => (n > 0 ? Math.min(lSource, Math.ceil((n * lSource) / l - 1e-6) + MARGE_PX) : 0);
  return {
    haut: enSourceH(bande(ligneFixe, lignes, maxL)),
    bas: enSourceH(bande(ligneFixe, lignes.reverse(), maxL)),
    gauche: enSourceL(bande(colonneFixe, colonnes, maxC)),
    droite: enSourceL(bande(colonneFixe, colonnes.reverse(), maxC)),
  };
}

/**
 * Cadre gardé (0 à 1) : la zone sans bords, réduite au rapport `format` (l / h de la sortie, ex. 16/9) et centrée,
 * en pixels entiers. null si rien à enlever. Ex. (20, 40, 0, 0) sur 1280 × 720 → x 53/1280, y 20/720, l 1173/1280, h 660/720.
 */
export function cadreRognage(bords: Bords, lSource: number, hSource: number, format: number): Omit<Rognage, 'src'> | null {
  const g = Math.max(0, Math.round(bords.gauche));
  const d = Math.max(0, Math.round(bords.droite));
  const ha = Math.max(0, Math.round(bords.haut));
  const b = Math.max(0, Math.round(bords.bas));
  if (g + d + ha + b === 0 || lSource <= 0 || hSource <= 0 || !(format > 0)) return null;
  const zl = lSource - g - d;
  const zh = hSource - ha - b;
  if (zl <= 0 || zh <= 0) return null;
  let l = zl;
  let h = zh;
  if (zl / zh > format) l = Math.floor(zh * format + 1e-6);
  else h = Math.floor(zl / format + 1e-6);
  // Le normaliseur garde au moins la moitié de l'image dans chaque sens : au-delà, ce n'est pas une barre.
  if (l < lSource / 2 || h < hSource / 2) return null;
  const x = g + Math.floor((zl - l) / 2);
  const y = ha + Math.floor((zh - h) / 2);
  return { x: x / lSource, y: y / hSource, l: l / lSource, h: h / hSource };
}
