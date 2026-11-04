// État du monteur IA (phase 6), en signals : la longue vidéo, les réglages de la Demande,
// l'avancement de l'Analyse et les brouillons de la Revue. Les actions sont dans analyse-monteur.ts
// et revue-monteur.ts ; la navigation (Retour Android) dans navigation-monteur.ts.

import { signal } from '@preact/signals';
import type { IdFournisseur, ResultatAnalyse, SourceOuverte } from '../../moteur/api';
import type { Probleme, Recette, Source } from '../../recette/types';

export type EcranMonteur = 'demande' | 'analyse' | 'revue';
export const ECRANS_MONTEUR: EcranMonteur[] = ['demande', 'analyse', 'revue'];

/** Écran du monteur affiché (null : parcours normal). Changé par navigation-monteur.ts. */
export const ecranMonteur = signal<EcranMonteur | null>(null);

/** Au-delà de 5 min, Importer propose le monteur IA. */
export const SEUIL_LONGUE = 300;

/** La longue vidéo ouverte pour le monteur (null : aucune). */
export const sourceMonteur = signal<SourceOuverte | null>(null);
/** Le choix « Je monte moi-même / Monteur IA » est affiché sur Importer. */
export const choixVisible = signal(false);

export interface DemandeMonteur {
  /** 1 à 30. */
  nombre: number;
  duree: 'court' | 'long';
  consigne: string;
  transcrire: boolean;
  mode: 'sansIA' | 'ia';
  fournisseur: IdFournisseur;
  /** '' = modèle conseillé du fournisseur. */
  modele: string;
}

export const demande = signal<DemandeMonteur>({
  nombre: 10,
  duree: 'court',
  consigne: '',
  transcrire: false,
  mode: 'sansIA',
  fournisseur: 'anthropic',
  modele: '',
});

export function regler(p: Partial<DemandeMonteur>) {
  demande.value = { ...demande.peek(), ...p };
}

/** Durées visées (secondes) pour chaque choix. */
export const DUREES = { court: { min: 15, max: 25 }, long: { min: 25, max: 45 } } as const;

export type EtatAnalyse =
  | { phase: 'avant' }
  | { phase: 'encours'; p: number; message: string; debut: number }
  | { phase: 'ia'; fournisseur: string; debut: number }
  | { phase: 'interrompue'; p: number }
  | { phase: 'erreur'; message: string }
  | { phase: 'erreurIA'; message: string }
  /** coupee : la réponse de l'IA était coupée (clips récupérés sur clips demandés). */
  | { phase: 'fini'; corrections: number; coupee?: { recuperes: number; demandes: number } };

export const etatAnalyse = signal<EtatAnalyse>({ phase: 'avant' });
/** Résultat de la dernière analyse (moments, résumé envoyé à l'IA). */
export const resultat = signal<ResultatAnalyse | null>(null);
/** Texte exact envoyé à l'IA (« Voir ce qui est envoyé »), une fois l'analyse finie. */
export const requeteEnvoyee = signal<string | null>(null);

/** Un clip proposé, pas encore trié. */
export interface Brouillon {
  /** Identifiant stable du brouillon (pour le retrouver après un rechargement). */
  uid: string;
  recette: Recette;
  raison: string;
  problemes?: Probleme[];
}

/** La revue en cours (gardée dans IndexedDB pour la reprendre plus tard). */
export interface Revue {
  /** La vidéo analysée (pour la re-choisir après un rechargement). */
  source: Source;
  /** Brouillons pas encore vus ; le premier est affiché. */
  restants: Brouillon[];
  total: number;
  /** Clips gardés, dans l'ordre (id du projet dans Mes montages, '' tant qu'il s'écrit). */
  gardes: { uid: string; id: string; titre: string }[];
  /**
   * Clips gardés pas encore écrits dans « Mes montages » (écrits au prochain lancement sinon).
   * `quand` = date d'enregistrement (modifieLe) choisie AVANT l'écriture : elle retrouve le projet s'il a été écrit.
   */
  aEcrire?: { uid: string; quand: number; brouillon: Brouillon }[];
}

export const revue = signal<Revue | null>(null);

/** Un identifiant unique (brouillon). */
export function nouvelUid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
