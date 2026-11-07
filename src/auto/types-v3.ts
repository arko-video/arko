// Types COMMUNS de la v3 « Best-of », partagés par les 3 devs et l'intégrateur (contrat : conception/contrat-wankil.md).
// Fichier GELÉ : un changement se demande à l'intégrateur. Temps = TEMPS SOURCE sauf mention contraire.

import type { Mot, Sec, TourDeParole } from '../recette/types';
import type { PlageTemps, SignauxSource } from './types';

/** Niveau (dBFS) d'une voix ou d'une piste toutes les `pas` secondes. Produit par le dev 1, lu par le dev 3 (bouche). */
export interface EnveloppeDb {
  pas: Sec;
  db: Float32Array;
}

/** Empreintes de voix (dev 1) : niveau + timbre (8 bandes entre 300 et 3400 Hz, en dB, n × 8 valeurs). */
export interface EmpreintesVoix extends EnveloppeDb {
  duree: Sec;
  bandes: Float32Array;
  /** Piste audio mesurée (absent = la piste principale, ou le mélange). */
  piste?: number;
}

/** Une voix trouvée par « Qui parle ? ». `id` devient l'id de la personne (« p1 »…). */
export interface VoixTrouvee {
  id: string;
  /** Niveau habituel (médiane des trames de voix, dBFS). */
  niveauDb: number;
  /** Part du temps de parole total (0 à 1). */
  part: number;
  /** Pistes séparées : la piste qui porte cette voix. */
  piste?: number;
}

/** Résultat de « Qui parle ? » (dev 1), avant que l'utilisateur nomme les voix. */
export interface VoixDetectees {
  src: string;
  /** Comment les voix ont été séparées : pistes séparées (exact), niveau + timbre, timbre seul, ou une seule voix. */
  methode: 'pistes' | 'niveau+timbre' | 'timbre' | 'une';
  voix: VoixTrouvee[];
  /** Tours (p = id de la voix), triés ; `sur: false` = incertain. */
  tours: TourDeParole[];
  /** Part des trames de voix attribuées avec certitude (0 à 1). */
  sure: number;
}

/** Une phrase et la personne qui la dit (écran « Qui parle ? », correction d'un toucher). */
export interface PhraseVoix {
  /** Indices des mots [k0, k1[ dans la liste donnée. */
  k0: number;
  k1: number;
  ts: Sec;
  fin: Sec;
  /** Id de la personne (null = personne ne parle à ce moment d'après les tours). */
  p: string | null;
  texte: string;
}

/** Ce que le derush compte dans une plage (dev 1) : sert à la note et à la raison affichée. */
export interface IndicesScene {
  /** Durée gardée estimée APRÈS Couper les blancs (s). */
  duree: Sec;
  rires: number;
  /** Fous rires : rire de force ≥ 0,7 ou de 3 s au moins. */
  fousRires: number;
  cris: number;
  pics: number;
  /** Pics de son juste après un calme (« calme puis pic »). */
  picsApresCalme: number;
  jurons: number;
  motsForts: number;
  /** Changements de personne en moins de 1,5 s (échanges rapides). */
  echanges: number;
  /** Rire ou cri dans les 3 s qui suivent un pic (réaction). */
  reactions: number;
  mots: number;
}

/** Une scène notée par le derush (dev 1). */
export interface SceneNotee extends PlageTemps {
  note: number;
  raison: string;
  titre: string;
  indices: IndicesScene;
  /** Scène drôle mais longue : les morceaux gardés après « resserrer » (sinon toute la scène). */
  morceaux?: PlageTemps[];
  /** Protégée : fou rire ou échanges rapides ; jamais jetée pour sa longueur (resserrée). */
  protegee: boolean;
}

/** Ce que reçoit le derush (dev 1). Les mots peuvent être des « mots » vides (voix détectée au son). */
export interface EntreeDerush {
  mots: readonly Mot[];
  signaux: SignauxSource | null;
  paroles?: readonly TourDeParole[];
}
