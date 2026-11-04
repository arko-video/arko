// Icônes en traits (SVG en ligne). Toujours décoratives (aria-hidden) : le bouton porte le texte ou l'aria-label.

import type { ComponentChildren } from 'preact';

export function Svg({ taille = 20, children, plein }: { taille?: number; children: ComponentChildren; plein?: boolean }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill={plein ? 'currentColor' : 'none'}
      stroke={plein ? 'none' : 'currentColor'}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type P = { taille?: number };

export const IconeRetour = (p: P) => (
  <Svg {...p}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);
export const IconeAnnuler = (p: P) => (
  <Svg {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);
export const IconeRetablir = (p: P) => (
  <Svg {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Svg>
);
export const IconeImporter = (p: P) => (
  <Svg {...p}>
    <path d="M12 16V4" />
    <path d="m6 10 6-6 6 6" />
    <path d="M4 20h16" />
  </Svg>
);
export const IconeTelecharger = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v12" />
    <path d="m6 10 6 6 6-6" />
    <path d="M4 20h16" />
  </Svg>
);
export const IconePartager = (p: P) => (
  <Svg {...p}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4" />
    <path d="m15.4 6.5-6.8 4" />
  </Svg>
);
export const IconeLecture = (p: P) => (
  <Svg {...p} plein>
    <path d="M8 5v14l11-7z" />
  </Svg>
);
export const IconePause = (p: P) => (
  <Svg {...p} plein>
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
  </Svg>
);
export const IconeCiseaux = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.1 15.9" />
    <path d="M14.5 14.5 20 20" />
    <path d="M8.1 8.1 12 12" />
  </Svg>
);
export const IconePoubelle = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 14h10l1-14" />
  </Svg>
);
export const IconeDebutIci = (p: P) => (
  <Svg {...p}>
    <path d="M6 4v16" />
    <path d="M10 12h10" />
    <path d="m16 8 4 4-4 4" />
  </Svg>
);
export const IconeFinIci = (p: P) => (
  <Svg {...p}>
    <path d="M18 4v16" />
    <path d="M4 12h10" />
    <path d="m10 8 4 4-4 4" />
  </Svg>
);
export const IconeImageMoins = (p: P) => (
  <Svg {...p}>
    <path d="m11 7-5 5 5 5" />
    <path d="M18 7v10" />
  </Svg>
);
export const IconeImagePlus = (p: P) => (
  <Svg {...p}>
    <path d="m13 7 5 5-5 5" />
    <path d="M6 7v10" />
  </Svg>
);
export const IconeMoins = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const IconePlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);
export const IconeCoche = (p: P) => (
  <Svg {...p}>
    <path d="m5 12 5 5 9-10" />
  </Svg>
);
export const IconeAlerte = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20L12 3z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </Svg>
);
export const IconeHorloge = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const IconeFleche = (p: P) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
export const IconeAmpoule = (p: P) => (
  <Svg {...p}>
    <path d="M9 18h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />
  </Svg>
);
export const IconeGlisser = (p: P) => (
  <Svg {...p}>
    <path d="m7 9-3 3 3 3" />
    <path d="m17 9 3 3-3 3" />
    <path d="M4 12h16" />
  </Svg>
);
export const IconeAccroche = (p: P) => (
  <Svg {...p}>
    <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z" />
  </Svg>
);
export const IconeTexte = (p: P) => (
  <Svg {...p}>
    <path d="M5 6V4h14v2" />
    <path d="M12 4v16" />
    <path d="M9 20h6" />
  </Svg>
);
export const IconeSousTitres = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M7 15h4" />
    <path d="M13 15h4" />
    <path d="M7 11h10" />
  </Svg>
);
export const IconeZoneSure = (p: P) => (
  <Svg {...p}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3" />
    <path d="M16 4h3a1 1 0 0 1 1 1v3" />
    <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
    <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
    <rect x="8" y="8" width="8" height="8" rx="1" />
  </Svg>
);
export const IconeSon = (p: P) => (
  <Svg {...p}>
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
    <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
);
export const IconeTransition = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="8" height="12" rx="2" />
    <rect x="13" y="6" width="8" height="12" rx="2" />
    <path d="M9 12h6" />
  </Svg>
);
export const IconeZoom = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.2-4.2" />
    <path d="M11 8.5v5M8.5 11h5" />
  </Svg>
);
export const IconeMicro = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
  </Svg>
);
export const IconeNote = (p: P) => (
  <Svg {...p}>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Svg>
);
export const IconeAide = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
    <path d="M12 17h.01" />
  </Svg>
);
