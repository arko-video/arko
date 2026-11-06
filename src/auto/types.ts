// Types COMMUNS du Montage auto, partagés par les 3 devs et l'intégrateur (contrat : conception/contrat-montage-auto.md).
// Fichier GELÉ : un changement se demande à l'intégrateur (il prévient les 3 devs).
// Tous les temps sont des TEMPS SOURCE (secondes dans la vidéo d'origine), sauf mention contraire.

import type { Mot, Sec } from '../recette/types';

/** Une plage de temps [de, a[ (temps source). */
export interface PlageTemps {
  de: Sec;
  a: Sec;
}

/** Un pic de volume (début de la montée : c'est là que tombent zoom et bruitage). */
export interface PicSource {
  ts: Sec;
  /** Niveau du sommet (dBFS) et force par rapport au niveau habituel (écarts types). */
  db: number;
  z: number;
}

/** Une plage détectée (cri, rire), avec son sommet `t` et une force de 0 à 1. */
export interface PlageSignal extends PlageTemps {
  t: Sec;
  force: number;
}

/**
 * Ce qu'Arko sait du son d'une source, calculé UNE fois sur l'appareil (réutilise l'analyse du monteur IA et son
 * point de reprise IndexedDB) : volume toutes les 20 ms, pics, cris, rires, longs passages muets.
 * Produit par lireSignauxSource (dev 1) ; lu par les fonctions pures des 3 devs et par le Montage express.
 */
export interface SignauxSource {
  src: string;
  duree: Sec;
  /** Pas de l'enveloppe (0,02 s). */
  pas: Sec;
  /** Volume RMS linéaire (0 à 1), mono, une valeur par pas, sur toute la source. */
  rms: Float32Array;
  pics: PicSource[];
  cris: PlageSignal[];
  rires: PlageSignal[];
  /** Longs passages sans son (fin d'enregistrement AFK…) : à ne jamais proposer. */
  muets: PlageTemps[];
}

/** Un morceau gardé par « Couper les blancs » : parole, son fort hors parole, ou voix détectée sans transcription. */
export interface Morceau extends PlageTemps {
  raison: 'parole' | 'fort' | 'voix';
}

/** Mots transcrits d'une source (temps source), éventuellement sur une plage seulement. */
export interface Transcription {
  src: string;
  mots: Mot[];
  /** Plages déjà transcrites (une transcription reprise en a plusieurs). */
  plages: PlageTemps[];
  /** true si toute la plage demandée est transcrite. */
  complete: boolean;
}

/** p de 0 à 1, message en français (« J'écoute la voix… 12 min sur 120 »). */
export type Progression = (p: number, message: string) => void;

/** Options de toute tâche longue (analyse, transcription, import). */
export interface OptionsTache {
  surProgression?: Progression;
  signal?: AbortSignal;
}
