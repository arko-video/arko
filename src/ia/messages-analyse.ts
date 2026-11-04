// Messages échangés entre la page (client-analyse.ts) et le Worker d'analyse (worker-analyse.ts),
// et forme du point de reprise gardé dans IndexedDB.

import type { Sec } from '../recette/types';
import type { OptionsCandidats } from './candidats';
import type { Difference } from './images';
import type { Moment } from './moments';

/** Version du point de reprise : on l'augmente si sa forme change (un ancien point est alors ignoré). */
export const VERSION_REPRISE = 1;
/** Un point de reprise est écrit toutes les 60 s de source traitée (QA M-6 : 2 min, c'était trop). */
export const INTERVALLE_REPRISE: Sec = 60;

/** Clé IndexedDB du point de reprise d'une source. */
export function cleReprise(empreinte: string): string {
  return `arko.analyse.${empreinte}`;
}

/** Ce qui est gardé pour reprendre une analyse interrompue (et pour la refaire en un instant). */
export interface PointReprise {
  version: number;
  duree: Sec;
  pas: Sec;
  /** Le son est analysé jusqu'à ce temps source. */
  tSon: Sec;
  /** Volumes (RMS) de 0 à tSon. */
  enveloppe: Float32Array;
  /** Les images clés sont analysées jusqu'à ce temps source. */
  tImage: Sec;
  diffs: Difference[];
  /** Dernière petite image en gris (pour la différence avec la suivante). */
  derniere: Uint8Array | null;
  /** true quand toute la source a été analysée. */
  fini: boolean;
}

export interface DemandeAnalyse {
  type: 'analyser';
  fichier: Blob;
  empreinte: string;
  /** false = on ignore (et on efface) un point de reprise existant. */
  reprendre: boolean;
  candidats: OptionsCandidats;
}

export type DepuisWorkerAnalyse =
  | { type: 'progression'; p: number; message: string }
  | { type: 'fini'; moments: Moment[]; stats: StatsAnalyse }
  | { type: 'erreur'; message: string; code: string };

/** Quelques mesures, pour l'écran et pour les tests. */
export interface StatsAnalyse {
  duree: Sec;
  /** true si l'analyse est repartie d'un point de reprise. */
  repris: boolean;
  /** D'où elle est repartie (temps source du son). */
  reprisA: Sec;
  /** Temps de calcul (ms). */
  ms: number;
  imagesCles: number;
  /** false si la vidéo n'a pas de son lisible (les moments ne viennent alors que des images). */
  son: boolean;
}
