// Textes du Montage auto (novembre 2026), réunis : on écrit toujours TA.<partie>.…
// Chaque dev ne modifie QUE son fichier : ui/auto/coupes/textes.ts (dev 1), ui/auto/habillage/textes.ts (dev 2),
// ui/auto/son/textes.ts (dev 3), ui/auto/express/textes.ts (intégrateur). Ce fichier-ci est GELÉ.

import { TEXTES_COUPES_AUTO } from './ui/auto/coupes/textes';
import { TEXTES_EXPRESS } from './ui/auto/express/textes';
import { TEXTES_HABILLAGE_AUTO } from './ui/auto/habillage/textes';
import { TEXTES_SON_AUTO } from './ui/auto/son/textes';

export const TA = {
  commun: {
    bientot: 'Bientôt disponible.',
    badge: 'Bientôt',
    erreur: 'Quelque chose a coincé. Réessaie.',
  },
  coupes: TEXTES_COUPES_AUTO,
  habillage: TEXTES_HABILLAGE_AUTO,
  son: TEXTES_SON_AUTO,
  express: TEXTES_EXPRESS,
} as const;
