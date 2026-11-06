// Icônes des outils YouTube (chapitres, intro / outro), dans le même style en traits que Icones.tsx.

import { Svg } from './Icones';

type P = { taille?: number };

/** Liste avec des repères : l'outil Chapitres. */
export const IconeChapitres = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h2M4 12h2M4 18h2M10 6h10M10 12h10M10 18h10" />
  </Svg>
);
/** Clap de cinéma : l'outil Intro / outro. */
export const IconeGenerique = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="9" width="18" height="12" rx="2" />
    <path d="m3 9 2-5 16 2-1 3M8 4.6 9.5 8.6M14 5.3l1.5 3.9" />
  </Svg>
);
