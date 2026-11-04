// Historique annuler / rétablir immuable : chaque action renvoie un nouvel historique.
// Au plus 50 états en arrière (les plus anciens sont oubliés).

import type { Recette } from './types';

export const TAILLE_HISTORIQUE = 50;

/** Historique annuler / rétablir (50 états). */
export interface Historique {
  readonly present: Recette;
  readonly peutAnnuler: boolean;
  readonly peutRetablir: boolean;
}

interface HistoriqueInterne extends Historique {
  readonly passe: readonly Recette[];
  readonly futur: readonly Recette[];
}

function creer(passe: readonly Recette[], present: Recette, futur: readonly Recette[]): HistoriqueInterne {
  return Object.freeze({ passe, present, futur, peutAnnuler: passe.length > 0, peutRetablir: futur.length > 0 });
}

function interne(h: Historique): HistoriqueInterne {
  const x = h as Partial<HistoriqueInterne>;
  return creer(x.passe ?? [], h.present, x.futur ?? []);
}

export function nouvelHistorique(recette: Recette): Historique {
  return creer([], recette, []);
}

/** Ajoute un nouvel état (efface ce qui pouvait être rétabli). Sans effet si la recette est la même. */
export function pousser(h: Historique, recette: Recette): Historique {
  if (recette === h.present) return h;
  const x = interne(h);
  const passe = [...x.passe, x.present].slice(-TAILLE_HISTORIQUE);
  return creer(passe, recette, []);
}

export function annuler(h: Historique): Historique {
  const x = interne(h);
  if (x.passe.length === 0) return h;
  return creer(x.passe.slice(0, -1), x.passe[x.passe.length - 1]!, [x.present, ...x.futur]);
}

export function retablir(h: Historique): Historique {
  const x = interne(h);
  if (x.futur.length === 0) return h;
  return creer([...x.passe, x.present], x.futur[0]!, x.futur.slice(1));
}
