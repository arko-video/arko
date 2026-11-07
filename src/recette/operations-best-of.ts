// Best-of (intégrateur) : « Sous-titres pour : <personne> ». Mêmes règles que operations.ts : NOUVELLE recette
// normalisée ; la recette d'origine si rien ne change ; une opération = un seul Annuler.

import { normaliser } from './normaliser';
import type { Recette } from './types';

/**
 * Sous-titre toutes les phrases de la personne `p` (en plus des punchlines), ou plus personne avec null.
 * Sans sous-titres en mots, ou personne inconnue : rien ne change.
 */
export function sousTitresPour(recette: Recette, p: string | null): Recette {
  const st = recette.sousTitres;
  if (!st || st.mots === 'auto') return recette;
  if (p === null) {
    if (st.pour === undefined) return recette;
    const { pour: _p, ...reste } = st;
    void _p;
    return normaliser({ ...recette, sousTitres: reste }, { sources: recette.sources }).recette;
  }
  if (st.pour === p || !(recette.personnes ?? []).some((x) => x.id === p)) return recette;
  return normaliser({ ...recette, sousTitres: { ...st, pour: p } }, { sources: recette.sources }).recette;
}
