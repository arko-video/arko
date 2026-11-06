// Point de branchement UNIQUE des champs de recette du Montage auto dans le normaliseur (normaliser.ts).
// Fichier GELÉ (architecte / intégrateur) : chaque dev modifie seulement SON fichier normaliser-auto-<partie>.ts.
// Règle : un champ absent n'est jamais ajouté → un ancien montage s'ouvre exactement pareil.

import { normaliserBlancs, normaliserRognages } from './normaliser-auto-coupes';
import { normaliserSections } from './normaliser-auto-habillage';
import { normaliserMusique, normaliserVolumeFinal, sourcesDeLaMusique } from './normaliser-auto-son';
import type { Journal, Objet } from './normaliser-outils';
import type { Recette, Sec, Source } from './types';

/** Clés de premier niveau de la recette ajoutées par le Montage auto. */
export const CLES_RECETTE_AUTO = ['blancs', 'rognages', 'musique', 'volumeFinal', 'sections'] as const;

/**
 * Lit les champs auto de `obj` et les ajoute à `recette` (seulement s'ils sont présents et valides).
 * À appeler AVANT le retrait des sources audio inutiles (la musique utilise des sources audio).
 */
export function ajouterChampsAuto(recette: Recette, obj: Objet, sources: readonly Source[], duree: Sec, journal: Journal): void {
  const blancs = normaliserBlancs(obj.blancs, journal);
  if (blancs) recette.blancs = blancs;
  const rognages = normaliserRognages(obj.rognages, sources.filter((s) => s.type === 'video'), journal);
  if (rognages) recette.rognages = rognages;
  const audios = sources.filter((s) => s.type === 'audio').map((s) => s.id);
  const musique = normaliserMusique(obj.musique, audios, duree, journal);
  if (musique) recette.musique = musique;
  const volumeFinal = normaliserVolumeFinal(obj.volumeFinal, journal);
  if (volumeFinal) recette.volumeFinal = volumeFinal;
  const sections = normaliserSections(obj.sections, journal);
  if (sections) recette.sections = sections;
}

/** Sources audio utilisées par les champs auto (musique) : à garder comme « utilisées ». */
export function sourcesAudioAuto(r: Pick<Recette, 'musique'>): string[] {
  return sourcesDeLaMusique(r.musique);
}
