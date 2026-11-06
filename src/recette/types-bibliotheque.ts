// Types de la recette pour « Ma bibliothèque » (novembre 2026) : fonds verts et mèmes posés sur la vidéo.
// Tous FACULTATIFS : un ancien montage n'en a aucun et s'ouvre exactement pareil.
// Un clip de la bibliothèque est une source vidéo de la recette avec `bib` (son identifiant dans Ma bibliothèque) :
// le fichier reste sur l'appareil, rien n'est copié dans le montage.
// - Mème « Coupure » : un PLAN ordinaire dont la source est le mème (mise en page fond flou, son du mème).
// - Fond vert, mème « Incrustation » : une `Incrustation`, posée par-dessus la vidéo en temps de SORTIE.

import type { Sec } from './types';

/** Détourage d'un fond vert (ou bleu) : voir moteur/incrustation/chroma.ts. */
export interface CleChroma {
  /** Couleur du fond, de 0 à 255 (trouvée sur les bords du clip). */
  couleur: [number, number, number];
  /** 0 à 0,9 (défaut 0,42). */
  tolerance: number;
  /** Douceur des bords : 0,02 à 0,6 (défaut 0,25). */
  douceur: number;
  /** Anti-débordement (reflet vert retiré) : 0 à 1 (défaut 0,7). */
  debordement: number;
}

export interface Incrustation {
  /** Source vidéo de la recette (un clip de Ma bibliothèque). */
  src: string;
  /** Temps de SORTIE où le clip commence (comme les textes : il ne suit pas les coupes). */
  t: Sec;
  /** Début et fin gardés DANS le clip (« couper le début / la fin »). */
  de: Sec;
  a: Sec;
  /** Centre du clip, en part de l'image finale (0 à 1). Défaut 0,5. */
  x?: number;
  y?: number;
  /** Largeur du clip en part de la largeur de l'image finale (0,1 à 1,5). Défaut 1. */
  taille?: number;
  /** Plein écran : le clip recouvre toute l'image (centré, recadré). */
  plein?: boolean;
  /** Détourage : absent = le clip est posé tel quel (mème en incrustation). */
  cle?: CleChroma;
  /** Son du clip (défaut oui) et son volume (0 à 1,5, défaut 1). */
  son?: boolean;
  vol?: number;
  /** Outil qui l'a posé (pour la mini-frise et les panneaux). Défaut 'fondVert'. */
  genre?: 'fondVert' | 'meme';
}
