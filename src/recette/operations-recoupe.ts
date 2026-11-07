// Best-of v4 (intégrateur, relecture point 17) : Habiller → Couper « Rythme des coupes » est une OPÉRATION de la
// recette (l'interface ne modifie la recette que par src/recette/operations*.ts). Le calcul reste celui de
// dev-coupes (auto/coupes/recouper.ts : recoupe chaque plan comme le Best-of, sans réécouter, et fait suivre ce qui
// est posé en temps de sortie). Pure ; une nouvelle recette = un seul Annuler ; même niveau = même recette.

import { recouperMontage, type EntreeRecoupe } from '../auto/coupes/recouper';
import type { NiveauBlancs, Recette } from './types';

export type { EntreeRecoupe } from '../auto/coupes/recouper';

/** Recoupe tout le montage en Serré / Normal / Large, comme le Best-of (mesures gardées + mots des sous-titres). */
export function recouperLeMontage(r: Recette, e: EntreeRecoupe, niveau: NiveauBlancs): Recette {
  return recouperMontage(r, e, niveau);
}
