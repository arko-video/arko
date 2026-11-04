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
  /** Transcrit les plages du fichier. langue : "fr", "en"… ou "auto" (détection). */
  | { type: 'transcrire'; fichier: File; plages: Plage[]; langue: string };

export type DepuisWorker =
  /** p de 0 à 1, etape = message français. */
  | { type: 'progression'; p: number; etape: string }
  | { type: 'fini'; mots: MotBrut[] }
  | { type: 'erreur'; message: string; code: string };
