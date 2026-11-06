// Réglages « Serré / Normal / Large » de Couper les blancs (dev 1). À part de blancs.ts pour que l'opération de la
// recette (recette/operations-coupes-auto.ts) les lise sans boucle d'imports. Réexportés par blancs.ts.

import type { NiveauBlancs, Sec } from '../../recette/types';

export interface ReglagesBlancs {
  /** Marge gardée avant et après chaque mot (s). */
  avant: Sec;
  apres: Sec;
  /** Deux morceaux séparés de moins de `fusion` s n'en font qu'un. */
  fusion: Sec;
  /** Son fort hors parole : RMS sur `fortFenetre` s au-dessus de `fortDb` dBFS, gardé de −fortAvant à +fortApres. */
  fortDb: number;
  fortFenetre: Sec;
  fortAvant: Sec;
  fortApres: Sec;
  /** Un morceau plus court que ça est retiré. */
  morceauMin: Sec;
  /** Fondus du son à chaque coupe (écrits dans recette.blancs). */
  fonduEntree: Sec;
  fonduSortie: Sec;
}

/** Normal = valeurs vérifiées sur une vraie vidéo. Serré et Large : à régler sur une vraie vidéo (proposition). */
export const REGLAGES_BLANCS: Readonly<Record<NiveauBlancs, ReglagesBlancs>> = {
  serre: { avant: 0.15, apres: 0.2, fusion: 0.3, fortDb: -14, fortFenetre: 0.1, fortAvant: 0.3, fortApres: 0.4, morceauMin: 0.3, fonduEntree: 0.02, fonduSortie: 0.04 },
  normal: { avant: 0.25, apres: 0.35, fusion: 0.5, fortDb: -16, fortFenetre: 0.1, fortAvant: 0.4, fortApres: 0.6, morceauMin: 0.35, fonduEntree: 0.02, fonduSortie: 0.04 },
  large: { avant: 0.4, apres: 0.6, fusion: 0.8, fortDb: -18, fortFenetre: 0.1, fortAvant: 0.6, fortApres: 0.9, morceauMin: 0.5, fonduEntree: 0.02, fonduSortie: 0.04 },
};
