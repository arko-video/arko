// A. Fondus du son aux coupes (dev 1). D'habitude 5 ms ; quand les plans viennent de « Couper les blancs »,
// 20 ms à l'entrée et 40 ms à la sortie de chaque plan (pas de clic sur ~300 coupes).
// Lu par rendre.ts et passé au mixeur (mixeur.ts, dev 3) : aperçu et export pareils. Fichier du dev 1.

import type { Recette, Sec } from '../../recette/types';

export interface FondusCoupes {
  entree: Sec;
  sortie: Sec;
}

/** Fondus habituels (5 ms), ceux de tous les anciens montages. */
export const FONDUS_HABITUELS: FondusCoupes = { entree: 0.005, sortie: 0.005 };

/** Fondus à appliquer aux coupes de cette recette (pure) : ceux de `recette.blancs`, sinon les habituels. */
export function fondusDesCoupes(recette: Pick<Recette, 'blancs'>): FondusCoupes {
  const b = recette.blancs;
  return b ? { entree: b.fonduEntree, sortie: b.fonduSortie } : FONDUS_HABITUELS;
}
