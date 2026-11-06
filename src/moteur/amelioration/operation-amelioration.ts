// Améliorer l'image — opération sur la recette (règles de recette/operations.ts : NOUVELLE recette normalisée, la
// recette d'origine si rien ne change ; un seul Annuler via modifier() de ui/etat.ts).

import { normaliser } from '../../recette/normaliser';
import type { Recette } from '../../recette/types';
import type { ReglagesAmelioration } from './reglages';

/** Pose (ou retire, avec null = « Non ») le réglage « Améliorer l'image » du montage. */
export function choisirAmelioration(r: Recette, reglages: ReglagesAmelioration | null): Recette {
  const avant = r.amelioration;
  if (!reglages && !avant) return r;
  if (
    reglages &&
    avant &&
    avant.niveau === reglages.niveau &&
    avant.nettoyer === reglages.nettoyer &&
    avant.agrandir === reglages.agrandir
  ) {
    return r;
  }
  const { amelioration: _ancien, ...reste } = r;
  const brut: Recette = reglages ? { ...reste, amelioration: { ...reglages } } : reste;
  return normaliser(brut, { sources: r.sources }).recette;
}
