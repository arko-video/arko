// Icônes de la phase 4 (combos, modèles, mes montages), dans le même style en traits que Icones.tsx.

import { Svg } from './Icones';

type P = { taille?: number };

/** Flamme : l'outil Combos (l'éclair est déjà pris par l'Accroche). */
export const IconeCombos = (p: P) => (
  <Svg {...p}>
    <path d="M12 22c4 0 7-3 7-7 0-3-1.5-5-3-7-.5 2-1.5 3-3 3.5C13 8 12 5 9 2c0 4-4 7-4 13 0 4 3 7 7 7z" />
  </Svg>
);
/** Trois cartes : l'outil Modèles. */
export const IconeModeles = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="18" height="8" rx="2" />
  </Svg>
);
/** Explosion : Boom. */
export const IconeBoom = (p: P) => (
  <Svg {...p}>
    <path d="m12 2 2 6 6-3-3 6 5 2-6 2 2 6-6-3-3 5-1-6-6 1 4-5-4-4 6 0z" />
  </Svg>
);
/** Flocon : Figé. */
export const IconeFige = (p: P) => (
  <Svg {...p}>
    <path d="M12 2v20M4 7l16 10M20 7 4 17" />
    <path d="m9 3 3 2 3-2M9 21l3-2 3 2" />
  </Svg>
);
/** Visage déçu : Raté. */
export const IconeRate = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 16.5c2.5-2.5 5.5-2.5 8 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </Svg>
);
/** Trois points verticaux : menu d'actions. */
export const IconeMenu = (p: P) => (
  <Svg {...p}>
    <path d="M12 5h.01M12 12h.01M12 19h.01" />
  </Svg>
);
export const IconeCrayon = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
);
export const IconeCopie = (p: P) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
);
