// Transcription locale de la voix d'un fichier en mots horodatés (temps source), sans recette.
// Sert aux outils qui écoutent une plage précise (ex. phase 6 : ±8 s autour d'un moment fort).

import type { Mot, Sec } from '../recette/types';
import { appliquerCorrections } from './corrections';
import { nettoyer } from './nettoyage';
import { executer } from './pilote';

export interface OptionsTranscription {
  langue?: string;
  /** Plage de temps source à transcrire. */
  de?: Sec;
  a?: Sec;
  surProgression?: (p: number) => void;
  signal?: AbortSignal;
}

/** Transcrit le son d'un fichier en mots [texte, début, fin, fort] (temps source). */
export async function transcrire(fichier: File, options: OptionsTranscription = {}): Promise<Mot[]> {
  const { surProgression, signal } = options;
  const plages = [{ de: options.de ?? 0, a: options.a ?? Infinity }];
  const langue = options.langue ?? 'fr';
  const bruts = await executer(
    { type: 'transcrire', fichier, plages, langue },
    { surProgression: surProgression ? (p) => surProgression(p) : undefined, signal },
  );
  return appliquerCorrections(nettoyer(bruts, langue));
}
