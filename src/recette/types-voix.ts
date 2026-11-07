// Types de la recette ajoutés par la v3 « Best-of » (novembre 2026) pour QUI PARLE, les AVATARS (chibis) et le
// DERUSH. TOUS FACULTATIFS : un ancien montage n'en a aucun et s'ouvre exactement pareil (même format
// "arko.recette/1", aucune migration). Contrat : conception/contrat-wankil.md.
// Propriétaires : Personne / TourDeParole / derush → dev 1 ; DefinitionChibi / PlaceAvatar / ReglagesAvatars,
// et les champs `chibi`, `bib`, `place`, `avatar` d'une personne, `emo` et `b` d'un tour → dev 3.

import type { Accessoire, Coiffure, Emotion, Situation, StyleChibi, Tenue, Yeux } from '../chibis/catalogue';
import type { Sec } from './types';

export type { Accessoire, Coiffure, Emotion, Situation, StyleChibi, Tenue, Yeux } from '../chibis/catalogue';

/* ------------------------------------------------------------------ D. Chibi (dev 3) */

/**
 * Un personnage original, entièrement décrit par ces quelques valeurs : le dessin est REFAIT par le code à chaque
 * image (aucun fichier). `graine` rend le trait tremblé et les petites irrégularités identiques partout (aperçu = export).
 */
export interface DefinitionChibi {
  style: StyleChibi;
  /** Entier de 0 à 2 147 483 647. */
  graine: number;
  /** Couleurs « #RRGGBB ». */
  peau: string;
  coiffure: Coiffure;
  cheveux: string;
  tenue: Tenue;
  accessoire: Accessoire;
  /** Couleur principale de la tenue. */
  couleur: string;
  /** Forme des yeux (défaut « ronds »). */
  yeux?: Yeux;
}

/** Place d'un avatar dans l'image finale : (x, y) = milieu du BAS du chibi (ses pieds), en part de l'image (0 à 1). */
export interface PlaceAvatar {
  x: number;
  y: number;
  /** Hauteur du chibi en part de la hauteur de l'image (0,1 à 0,6). */
  taille: number;
}

/** Avatars à l'écran (C) : le chibi de la personne qui parle apparaît, change selon l'émotion, bouche animée. */
export interface ReglagesAvatars {
  /** 'parle' (défaut) = visible seulement quand la personne parle ; 'toujours' = toujours là, bouche fermée sinon. */
  mode?: 'parle' | 'toujours';
  /** Petit rebond à chaque prise de parole et sur les syllabes fortes (défaut oui). */
  rebond?: boolean;
  /** Reste visible encore `tenue` s après la fin du tour (défaut 0,5 s ; 0 à 2). */
  tenue?: Sec;
  /** Style de dessin imposé à tous (absent = le style de chaque chibi). */
  style?: StyleChibi;
}

/* ------------------------------------------------------------------ C. Qui parle (dev 1) */

/** Une personne qui parle dans la vidéo (« p1 » à « p8 »). */
export interface Personne {
  id: string;
  /** Prénom ou pseudo (24 caractères au plus). */
  nom: string;
  /** Pastille de couleur dans les listes (« #RRGGBB »). */
  couleur?: string;
  /** Pistes séparées (E) : numéro de la piste audio de la vidéo principale qui porte SA voix (0 = la 1re). */
  piste?: number;
  /** Niveau habituel de sa voix (dBFS, information mesurée par Qui parle). */
  niveauDb?: number;
  /** Son chibi (dev 3) : une COPIE de la définition (le montage reste complet même si le chibi est retiré de Ma bibliothèque). */
  chibi?: DefinitionChibi;
  /** Id du chibi dans Ma bibliothèque (information). */
  bib?: string;
  /** Place et taille de son avatar (absent = place par défaut selon son rang). */
  place?: PlaceAvatar;
  /** false = pas d'avatar pour cette personne. */
  avatar?: boolean;
}

/** Un tour de parole : la personne `p` parle de `ts` à `fin` (TEMPS SOURCE : il suit les coupes, comme les mots). */
export interface TourDeParole {
  ts: Sec;
  fin: Sec;
  /** Id de la personne. */
  p: string;
  /** Source vidéo (défaut : la 1re). */
  src?: string;
  /** Émotion de l'avatar pendant ce tour (dev 3 ; défaut « parle »). */
  emo?: Emotion;
  /**
   * Situation de jeu de l'avatar pendant ce tour (7/11/2026, facultatif ; absent = aucune) : objet en main, pose
   * des bras ; avec l'émotion « parle », c'est l'émotion de la situation qui est montrée.
   */
  sit?: Situation;
  /**
   * Bouche ouverte / fermée toutes les 0,04 s depuis `ts` (dev 3) : bits en base64 (bit de poids fort d'abord).
   * Absent = la bouche suit les mots (ou bat à 6 fois par seconde sans mots).
   */
  b?: string;
  /** false = attribution incertaine (affichée en pointillés dans « Qui parle ? »). */
  sur?: boolean;
}

/* ------------------------------------------------------------------ C. Derush (dev 1) */

/** Un passage de la vidéo source noté par le derush, pas (encore) gardé dans le montage. */
export interface PassageNote {
  src?: string;
  /** Temps source. */
  de: Sec;
  a: Sec;
  /** 0 à 100. */
  note: number;
  /** « 3 rires · échanges rapides » (80 caractères au plus). */
  raison: string;
  /** Titre court (60 caractères au plus). */
  titre?: string;
}

/** Ce que le derush a noté mais pas gardé : l'écran « Passages pas retenus » le propose (« Ajouter »). */
export interface ReglagesDerush {
  passages: PassageNote[];
}
