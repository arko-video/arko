// « ARKO REGARDE L'IMAGE » (10/11/2026, vidéo CS2 de Romain : bureau, menus d'achat, vote de carte, chargements
// gardés dans le montage). Une image toutes les 3 s environ (images clés), recadrée au centre en 224 × 224, passe
// dans CLIP (partie vision, modèle « vision » du catalogue) ; on la compare à des phrases de référence calculées une
// fois (phrases-vision.json : « un jeu à la première personne », « un menu de jeu », « un bureau d'ordinateur »…).
// Une ZONE MORTE = plusieurs images de suite où le jeu n'est pas assez sûr : elle est traitée comme un passage muet
// (jamais proposée, retirée des coupes, des scènes, de l'accroche). Pur.

import type { Sec } from '../../recette/types';
import type { PlageMuette } from '../types';
import PHRASES from './phrases-vision.json';

export type GenreImage = 'jeu' | 'menu' | 'chargement' | 'bureau';

export const REGARD = {
  /** Écart visé entre deux images regardées (s) : images clés, au moins 3 s d'écart. */
  ecart: 3,
  /** Taille d'entrée de CLIP. */
  taille: 224,
  /**
   * Sous ce score de « jeu », l'image n'est pas du jeu. Essai sur la vidéo CS2 : jeu ≥ 0,63, morts ≤ 0,54 ; mais le
   * 10/11 chez Romain (image décodée par le navigateur) presque toute la vidéo est passée sous 0,58 → montage de 19 s.
   * Donc on ne coupe que ce qui est NETTEMENT pas du jeu, et on ignore tout si c'est trop (voir `partMax`).
   */
  seuilJeu: 0.4,
  /** Si plus de 35 % de la vidéo serait coupée, le regard n'est pas fiable sur cette vidéo : on n'en tient pas compte. */
  partMax: 0.35,
  /** Une zone morte dure au moins 6 s (2 images de suite au moins) : on ne coupe jamais sur une seule image. */
  dureeMin: 6,
  /** Échelle des scores (CLIP : 100). */
  echelle: 100,
} as const;

/** Moyenne et écart-type des pixels de CLIP. */
const MOYENNE = [0.48145466, 0.4578275, 0.40821073];
const ECART = [0.26862954, 0.26130258, 0.27577711];

/** Pixels RGBA (taille × taille) → entrée de CLIP [1, 3, taille, taille] (float32). */
export function entreeClip(rgba: Uint8ClampedArray | Uint8Array, taille: number = REGARD.taille): Float32Array {
  const n = taille * taille;
  const res = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) res[c * n + i] = (rgba[i * 4 + c]! / 255 - MOYENNE[c]!) / ECART[c]!;
  }
  return res;
}

/** Probabilités par genre d'une image (son empreinte CLIP, pas forcément normée). */
export function genresImage(emb: ArrayLike<number>): Record<GenreImage, number> {
  let norme = 0;
  for (let i = 0; i < emb.length; i++) norme += emb[i]! * emb[i]!;
  norme = Math.sqrt(norme) || 1;
  const meilleur: Record<GenreImage, number> = { jeu: -Infinity, menu: -Infinity, chargement: -Infinity, bureau: -Infinity };
  for (const p of PHRASES as { genre: GenreImage; v: number[] }[]) {
    let s = 0;
    for (let i = 0; i < p.v.length; i++) s += (emb[i]! / norme) * p.v[i]!;
    meilleur[p.genre] = Math.max(meilleur[p.genre], s * REGARD.echelle);
  }
  const max = Math.max(...Object.values(meilleur));
  const e = Object.fromEntries(Object.entries(meilleur).map(([k, v]) => [k, Math.exp(v - max)])) as Record<GenreImage, number>;
  const somme = Object.values(e).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, Math.round((v / somme) * 1000) / 1000])) as Record<GenreImage, number>;
}

export interface ImageRegardee {
  t: Sec;
  /** Probabilité que ce soit du jeu (0 à 1). */
  jeu: number;
  /** Le genre le plus probable. */
  genre: GenreImage;
}

/**
 * Zones mortes (temps source) : suites d'au moins 2 images « pas jeu » couvrant `dureeMin` s ; une zone va de la
 * première image morte à mi-chemin de l'image de jeu suivante (et commence à 0 si la vidéo commence par elle).
 */
export function zonesMortes(images: readonly ImageRegardee[], duree: Sec, o: { seuil?: number; dureeMin?: Sec } = {}): PlageMuette[] {
  const seuil = o.seuil ?? REGARD.seuilJeu;
  const min = o.dureeMin ?? REGARD.dureeMin;
  const l = [...images].sort((a, b) => a.t - b.t);
  const res: PlageMuette[] = [];
  let i = 0;
  while (i < l.length) {
    if (l[i]!.jeu >= seuil) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < l.length && l[j + 1]!.jeu < seuil) j++;
    const de = i === 0 ? 0 : (l[i - 1]!.t + l[i]!.t) / 2;
    const a = j === l.length - 1 ? duree : (l[j]!.t + l[j + 1]!.t) / 2;
    if (j > i && a - de >= min) {
      // Genre le plus fréquent de la zone (menu, chargement ou bureau).
      const n = new Map<GenreImage, number>();
      for (let k = i; k <= j; k++) n.set(l[k]!.genre, (n.get(l[k]!.genre) ?? 0) + 1);
      const vu = ([...n].filter(([g]) => g !== 'jeu').sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'menu') as Exclude<GenreImage, 'jeu'>;
      res.push({ de: Math.round(de * 100) / 100, a: Math.round(a * 100) / 100, vu });
    }
    i = j + 1;
  }
  return res;
}
