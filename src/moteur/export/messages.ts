// Messages échangés entre la page (client.ts) et le Worker d'export (worker.ts).

import type { Recette } from '../../recette/types';
import type { BilanSonie } from '../audio/sonie';

export interface DemandeExport {
  type: 'exporter';
  recette: Recette;
  /** Fichier de chaque source, par id. */
  fichiers: Record<string, File>;
  /** Rang de cascade déjà validé sur cet appareil (mémorisé par la page), ou null. */
  rangConnu: number | null;
  /** Nom du fichier OPFS (choisi par la page, pour pouvoir l'effacer elle-même après une annulation). */
  nom: string;
}

export interface DemandeAnnulation {
  type: 'annuler';
}

export type VersWorker = DemandeExport | DemandeAnnulation;

export type DepuisWorker =
  | { type: 'progression'; p: number; resteS: number | null }
  | { type: 'encodage'; rang: number }
  | { type: 'fini'; fichier: File; largeur: number; hauteur: number; qualite: '1080p' | '720p' | '1440p'; rang: number; avertissement?: string; sonie?: BilanSonie }
  | { type: 'erreur'; message: string; code: string };
