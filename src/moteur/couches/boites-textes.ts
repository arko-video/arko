// Boîte de la ligne de sous-titres (ou de la punchline) à l'écran, en parts de l'image : les persos de qui parle
// s'en écartent (places-persos.ts). Même mise en page que le dessin (placerSousTitre, mesurée avec les mêmes polices,
// à la taille de référence) : aperçu = export.

import type { Gabarit } from '../../recette/destination';
import type { Sec } from '../../recette/types';
import type { SousTitreActif } from '../etat-image';
import type { Boite } from './places-persos';
import { POP_PUNCHLINE, placerSousTitre } from './sous-titres';

/** Boîtes des textes visibles et le temps où la ligne apparaît / disparaît (pour le fondu de l'évitement). */
export function boitesSousTitres(actif: SousTitreActif, gab: Gabarit): { boites: Boite[]; t0: Sec; t1: Sec } {
  const place = placerSousTitre(actif, gab);
  if (!place) return { boites: [], t0: actif.ligne.t0, t1: actif.ligne.t1 };
  // Taille la plus grande de l'entrée « pop » (108 %), et un petit jour autour du texte.
  const l = (place.dl.l * POP_PUNCHLINE.sommet) / 2 + 12;
  const h = (place.dl.h * POP_PUNCHLINE.sommet) / 2 + 12;
  const boite = { x0: (place.cx - l) / gab.l, x1: (place.cx + l) / gab.l, y0: (place.cy - h) / gab.h, y1: (place.cy + h) / gab.h };
  return { boites: [boite], t0: actif.ligne.t0, t1: actif.ligne.t1 };
}
