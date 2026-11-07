// Types de la recette ajoutés pour le « Montage auto » (novembre 2026). TOUS FACULTATIFS : un ancien montage
// n'en a aucun et s'ouvre exactement pareil (même format "arko.recette/1", aucune migration).
// Ils sont branchés dans types.ts (champs `blancs`, `rognages`, `musique`, `volumeFinal`, `sections` de la recette,
// `zoomFixe` d'un plan, champs en plus des sous-titres et des sons). Contrat : conception/contrat-montage-auto.md.

import type { Sec } from './types';

/* ------------------------------------------------------------------ A. Couper les blancs (dev 1) */

/** Réglage « Serré / Normal / Large » de Couper les blancs. */
export type NiveauBlancs = 'serre' | 'normal' | 'large';

/**
 * Présent quand les plans viennent de « Couper les blancs » : le réglage utilisé, et les fondus du son
 * appliqués à CHAQUE coupe (au lieu des 5 ms habituels) pour ne jamais entendre de clic.
 */
export interface ReglagesBlancsRecette {
  niveau: NiveauBlancs;
  /** Fondu d'entrée du son de chaque plan (défaut 0,02 s). */
  fonduEntree: Sec;
  /** Fondu de sortie du son de chaque plan (défaut 0,04 s). */
  fonduSortie: Sec;
}

/* ------------------------------------------------------------------ D. Rogner une capture d'écran (dev 1) */

/**
 * Partie GARDÉE d'une source vidéo (coordonnées 0 à 1 de l'image source, après rotation) : on enlève les bords
 * fixes (barre de titre, barre des tâches). Le moteur recadre puis agrandit : toutes les mises en page marchent pareil.
 * Ex. 1280 × 720 → { x: 53/1280, y: 20/720, l: 1173/1280, h: 660/720 }.
 */
export interface Rognage {
  /** Id de la source vidéo rognée. */
  src: string;
  x: number;
  y: number;
  l: number;
  h: number;
}

/* ------------------------------------------------------------------ B, C, G. Habillage auto (dev 2) */

/** Ce que montrent les sous-titres : toutes les phrases, ou seulement les punchlines. */
export type ModeSousTitres = 'tout' | 'punchlines';

/** Une punchline gardée : les mots dont le MILIEU tombe dans [ts, fin] (temps source) s'affichent. */
export interface PlagePunchline {
  ts: Sec;
  fin: Sec;
}

/** Zoom fixe d'un plan entier (C, « punch-in » des jump cuts) : pas d'animation, tenu tout le plan. */
export interface ZoomFixe {
  /** 1 à 2,5 (×1,32 sur un moment fort, ×1,12 pour le rythme). */
  force: number;
  /** Point visé dans l'image finale (0 à 1). Défaut x 0,5 ; y 0,45 (un peu au-dessus du milieu). */
  x?: number;
  y?: number;
}

/** Titres de section à l'écran (G) : d'où viennent les titres, et si un whoosh les accompagne. */
export interface ReglagesSections {
  /** 'chapitres' = les chapitres YouTube ; 'main' = des titres posés à la main (textes de rôle « section »). */
  source: 'chapitres' | 'main';
  /** Son whoosh à l'apparition (défaut oui). */
  son?: boolean;
  /** Durée d'affichage (défaut 2,2 s). */
  dur?: Sec;
}

/* ------------------------------------------------------------------ E, F. Son (dev 3) */

/** Qui a posé un son : un bruitage automatique (E) ou un titre de section (G). Absent = posé à la main. */
export type RoleSon = 'bruitage' | 'section';

/** Un morceau de la musique de fond, posé en TEMPS DE SORTIE (la musique ne suit pas les coupes). */
export interface MorceauMusique {
  /** Id de la source audio (type 'audio') du morceau. */
  src: string;
  /** Début dans la vidéo finale (temps de sortie, sans compter l'intro). */
  t: Sec;
  /** Fin dans la vidéo finale (défaut : début du morceau suivant, sinon fin de la vidéo). */
  fin?: Sec;
  /** Où commencer dans le fichier (défaut 0). */
  debut?: Sec;
  /** Rejouer le morceau quand il se termine avant `fin` (défaut oui). */
  boucle?: boolean;
}

/** Piste « Musique » : morceaux qui se suivent, fondus, niveau bas, baisse automatique quand on parle. */
export interface PisteMusique {
  morceaux: MorceauMusique[];
  /** Volume (linéaire) : défaut 0,14 ≈ −17 dB. */
  vol?: number;
  /** Baisse automatique quand on parle (défaut oui). */
  baisse?: boolean;
  /**
   * v4 (facultatif) : 'parole' = la musique baisse pendant la PAROLE (tours de `paroles`, sinon les mots des sous-titres),
   * d'≈ 8 dB même si la voix est faible ; absent = comme avant (la voix des plans au-delà du seuil de −30,5 dBFS).
   */
  baisseSur?: 'parole';
  /** Fondus d'entrée et de sortie de chaque morceau (défaut 1,2 s et 1,5 s). */
  fonduEntree?: Sec;
  fonduSortie?: Sec;
}

/** Volume final visé à l'export (YouTube et TikTok) : −14 LUFS intégrés, crête vraie ≤ −1,5 dBTP. */
export interface VolumeFinal {
  lufs: number;
  crete: number;
}
