// Textes de la v3 « Best-of » (novembre 2026), réunis : on écrit toujours TV.<partie>.…
// Chaque dev ne modifie QUE son fichier : ui/auto/derush/textes.ts et ui/auto/voix/textes.ts (dev 1),
// ui/auto/insertion/textes.ts (dev 2), ui/auto/chibis/textes.ts (dev 3), ui/auto/express/textes-best-of.ts
// (intégrateur). Ce fichier-ci est GELÉ.

import { TEXTES_CHIBIS } from './ui/auto/chibis/textes';
import { TEXTES_SITUATIONS } from './ui/auto/chibis/textes-situations';
import { TEXTES_DERUSH } from './ui/auto/derush/textes';
import { TEXTES_BEST_OF } from './ui/auto/express/textes-best-of';
import { TEXTES_INSERTION } from './ui/auto/insertion/textes';
import { TEXTES_VOIX } from './ui/auto/voix/textes';

export const TV = {
  commun: {
    bientot: 'Bientôt disponible.',
    badge: 'Bientôt',
  },
  derush: TEXTES_DERUSH,
  voix: TEXTES_VOIX,
  insertion: TEXTES_INSERTION,
  chibis: TEXTES_CHIBIS,
  situations: TEXTES_SITUATIONS,
  bestOf: TEXTES_BEST_OF,
} as const;
