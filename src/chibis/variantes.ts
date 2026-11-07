// D. Les variantes d'un chibi (dev 3) : chaque émotion, bouche fermée puis ouverte (24 × 2 = 48 images par style).
// Contrat : conception/contrat-wankil.md §5. FIGÉ (l'ordre sert à la grille de l'atelier et aux tests).

import { EMOTIONS } from './catalogue';
import type { PoseChibi } from './dessin';

export function variantes(): PoseChibi[] {
  return EMOTIONS.flatMap((emo) => [
    { emo, bouche: false },
    { emo, bouche: true },
  ]);
}
