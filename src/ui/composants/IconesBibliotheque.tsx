// Icônes de Ma bibliothèque (traits, comme Icones.tsx) : fond vert (personnage devant un écran) et mème (bulle « !? »).

import { Svg } from './Icones';

type P = { taille?: number };

export const IconeFondVert = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="12" cy="10" r="2.5" />
    <path d="M7.5 20c.6-3 2.3-4.5 4.5-4.5s3.9 1.5 4.5 4.5" />
  </Svg>
);

export const IconeMeme = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M10 8.5v3M10 13.5v.01M13.5 9.2c0-1 .8-1.7 1.7-1.7s1.7.7 1.7 1.6c0 1.2-1.7 1.3-1.7 2.4M15.2 13.5v.01" />
  </Svg>
);

export const IconeBibliotheque = (p: P) => (
  <Svg {...p}>
    <path d="M4 4h4v16H4zM10 4h4v16h-4z" />
    <path d="m16 5 3.5-1 3 15.5-3.5 1z" />
  </Svg>
);
