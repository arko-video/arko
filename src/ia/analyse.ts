// Analyse d'une longue source pour trouver les moments forts : ancien point d'entrée de la phase 1,
// gardé pour compatibilité. Le vrai travail est dans client-analyse.ts (analyserSource, conseillé)
// et dans les fonctions pures de signaux.ts, rires.ts, images.ts et candidats.ts.

import { calculerEmpreinte } from '../stockage/fichiers';
import type { Sec } from '../recette/types';
import { analyserFichier } from './client-analyse';
import type { Moment } from './moments';
import { Enveloppe } from './signaux';

export interface OptionsAnalyse {
  /** Nombre maximal de moments renvoyés (les meilleurs scores). */
  max?: number;
  /** Progression de 0 à 1. */
  surProgression?: (p: number) => void;
  signal?: AbortSignal;
}

/** Énergie sonore (RMS) par fenêtre de `pas` secondes, à partir de PCM mono (pur). */
export function enveloppeSonore(pcm: Float32Array, frequence: number, pas: Sec): Float32Array {
  const e = new Enveloppe(pcm.length / frequence, pas);
  e.ajouter(pcm, frequence, 0);
  return e.valeurs();
}

/** Cherche les moments forts d'un fichier, sans transcription. Préférer analyserSource (api-ia.ts). */
export async function analyserMoments(fichier: File, options: OptionsAnalyse = {}): Promise<Moment[]> {
  const empreinte = await calculerEmpreinte(fichier);
  const res = await analyserFichier(fichier, empreinte, {
    max: options.max,
    signal: options.signal,
    surProgression: (p) => options.surProgression?.(p),
  });
  return res.moments;
}
