// Protocole du Worker « arko-regard » (worker-vision.ts).
import type { Sec } from '../../recette/types';
import type { ImageRegardee } from './regard';

export interface DemandeRegard {
  fichier: Blob;
  duree: Sec;
}

export type DepuisWorkerRegard =
  | { type: 'progression'; p: number }
  | { type: 'erreur'; message: string; code: string }
  | { type: 'fini'; images: ImageRegardee[] };
