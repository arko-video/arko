// Messages échangés entre la page (pilote.ts) et le Worker Whisper (worker.ts).

import type { Sec } from '../recette/types';

/** Un morceau de la source à écouter, en temps source. */
export interface Plage {
  de: Sec;
  a: Sec;
}

/** Un mot tel que Whisper le donne, déjà remis en temps source. `niveau` = volume du son (0 à 1) pendant le mot. */
export interface MotBrut {
  txt: string;
  ts: Sec;
  fin: Sec;
  niveau: number;
}

export type VersWorker =
  /** Télécharge le modèle (et le met en cache) sans rien transcrire. */
  | { type: 'telecharger' }
  /**
   * Transcrit les plages du fichier. langue : "fr", "en"… ou "auto" (détection). gain (v4, Best-of) : chaque plage
   * (zone de parole) est remontée vers −20 dBFS avant Whisper (pcm.ts → normaliserPieces) ; absent = comme avant.
   */
  | { type: 'transcrire'; fichier: File; plages: Plage[]; langue: string; gain?: boolean };

/** Une fenêtre de 28 s où Whisper a planté deux fois : sautée (ses mots manquent), jamais un échec de toute l'écoute. */
export interface FenetreSautee {
  de: Sec;
  a: Sec;
  message: string;
}

export type DepuisWorker =
  /** p de 0 à 1, etape = message français. */
  | { type: 'progression'; p: number; etape: string }
  | { type: 'fini'; mots: MotBrut[]; sautees?: FenetreSautee[] }
  | { type: 'erreur'; message: string; code: string };
