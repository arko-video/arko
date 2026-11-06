// Opérations du Montage auto « Coupes » (dev 1) : A (couper les blancs) et D (rogner une capture d'écran).
// Mêmes règles que operations.ts : NOUVELLE recette normalisée, la recette d'origine si sans effet ;
// une opération = un seul Annuler. Réexportées par operations.ts.

import { decouperPlans, ranger } from '../auto/coupes/decoupe';
import { REGLAGES_BLANCS } from '../auto/coupes/reglages';
import type { Morceau, PlageTemps } from '../auto/types';
import { normaliser } from './normaliser';
import type { NiveauBlancs, Recette, Rognage } from './types';

export interface OptionsCouperBlancs {
  /**
   * Travailler sur la VIDÉO D'ORIGINE (temps source de la 1ʳᵉ vidéo) au lieu des plans actuels : les plans sont
   * REMPLACÉS par les morceaux de cette plage (« de 0:20:00 à 1:10:00 », ou toute la source). Une longue vidéo
   * importée ne garde que ses 60 premières secondes : c'est le cas habituel.
   */
  plage?: PlageTemps;
}

function finir(r: Recette): Recette {
  return normaliser(r, { sources: r.sources }).recette;
}

/**
 * Sans `plage` : garde, dans chaque plan, seulement les `morceaux` (temps source de la même source) ; un plan devient
 * plusieurs plans (mêmes réglages : mise, vitesse, zoom fixe ; la transition reste sur le 1er morceau, l'arrêt sur
 * image sur le dernier) ; un plan sans morceau est retiré (jamais tous : sans effet si plus rien ne resterait).
 * Avec `plage` : les plans deviennent les morceaux de la plage. Écrit `recette.blancs` (niveau et fondus du son).
 */
export function couperLesBlancs(recette: Recette, morceaux: readonly Morceau[], niveau: NiveauBlancs, options: OptionsCouperBlancs = {}): Recette {
  const reglages = REGLAGES_BLANCS[niveau] ?? REGLAGES_BLANCS.normal;
  const { plans } = decouperPlans(recette, ranger(morceaux), reglages.morceauMin, options.plage);
  if (plans.length === 0) return recette;
  return finir({
    ...recette,
    plans,
    blancs: { niveau: REGLAGES_BLANCS[niveau] ? niveau : 'normal', fonduEntree: reglages.fonduEntree, fonduSortie: reglages.fonduSortie },
  });
}

/** Rogne (ou, avec null, ne rogne plus) la source vidéo `src`. Cadre en coordonnées 0 à 1 (voir cadreRognage). */
export function rognerSource(recette: Recette, src: string, cadre: Omit<Rognage, 'src'> | null): Recette {
  const video = recette.sources.find((s) => s.id === src && s.type === 'video');
  if (!video) return recette;
  const autres = (recette.rognages ?? []).filter((r) => r.src !== src);
  const rognages = cadre ? [...autres, { src, x: cadre.x, y: cadre.y, l: cadre.l, h: cadre.h }] : autres;
  if (!cadre && autres.length === (recette.rognages ?? []).length) return recette;
  const r: Recette = { ...recette, rognages };
  if (rognages.length === 0) delete r.rognages;
  const res = finir(r);
  return JSON.stringify(res.rognages) === JSON.stringify(recette.rognages) ? recette : res;
}
