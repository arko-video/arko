// Les styles des textes (5) et des sous-titres (3), pour une vidéo de référence de 1080 px de large.
// Toutes les tailles sont en px de référence : le dessin applique ensuite ctx.scale(env.echelle).

import { GROTESK, INTER } from '../polices';

/** Couleur d'accent d'Arko. */
export const CITRON = '#C8FF4D';

export interface StyleTexte {
  famille: string;
  poids: number;
  /** Taille de la police (px de référence). */
  taille: number;
  /** Hauteur d'une ligne, en multiple de la taille. */
  interligne: number;
  couleur: string;
  /** Contour visible autour des lettres (épaisseur en px). */
  contour?: { couleur: string; epaisseur: number };
  /** Fond arrondi derrière le texte ; marge = espace intérieur [côtés, haut et bas]. */
  fond?: { couleur: string; rayon: number; marge: [number, number] };
  /** Ombre douce sous le texte. */
  ombre?: { couleur: string; flou: number; dy: number };
  /** Rotation en degrés (négatif = penché vers le haut à droite). */
  rotation?: number;
  /** Animation d'entrée (jamais pour un texte qui commence à 0 s). */
  entree: 'pop' | 'secousse' | 'fondu';
  /** Texte écrit en MAJUSCULES au dessin (le texte de la recette ne change pas). */
  majuscules?: boolean;
}

const CONTOUR_NOIR = { couleur: '#000000', epaisseur: 10 };

export const STYLES: Record<string, StyleTexte> = {
  accroche: { famille: GROTESK, poids: 700, taille: 84, interligne: 1.12, couleur: '#FFFFFF', contour: CONTOUR_NOIR, entree: 'pop' },
  bulle: {
    famille: INTER, poids: 800, taille: 64, interligne: 1.2, couleur: '#000000',
    fond: { couleur: '#FFFFFF', rayon: 28, marge: [36, 20] }, entree: 'pop',
  },
  citron: {
    famille: INTER, poids: 800, taille: 64, interligne: 1.2, couleur: '#0F1115',
    fond: { couleur: CITRON, rayon: 20, marge: [36, 20] }, entree: 'pop',
  },
  alerte: { famille: GROTESK, poids: 700, taille: 84, interligne: 1.12, couleur: '#FFE14D', contour: CONTOUR_NOIR, rotation: -3, entree: 'secousse' },
  discret: {
    famille: INTER, poids: 600, taille: 52, interligne: 1.2, couleur: '#FFFFFF',
    // Léger contour + ombre : reste lisible sur un fond clair ou chargé.
    contour: { couleur: 'rgba(0, 0, 0, 0.85)', epaisseur: 4 },
    ombre: { couleur: 'rgba(0, 0, 0, 0.75)', flou: 14, dy: 3 }, entree: 'fondu',
  },
  // Montage auto (G) : titre de section, bandeau jaune penché, texte noir gras en majuscules, entrée « pop ».
  bandeau: {
    famille: INTER, poids: 800, taille: 84, interligne: 1.15, couleur: '#0F1115',
    fond: { couleur: '#FFE500', rayon: 10, marge: [44, 20] }, rotation: -2, entree: 'pop', majuscules: true,
  },
};

/** Style d'un texte (style inconnu → accroche). */
export function styleTexte(id: string | undefined): StyleTexte {
  return STYLES[id ?? 'accroche'] ?? STYLES.accroche!;
}

export interface StyleSousTitres {
  famille: string;
  poids: number;
  taille: number;
  interligne: number;
  couleur: string;
  contour?: { couleur: string; epaisseur: number };
  fond?: { couleur: string; rayon: number; marge: [number, number] };
  /** Mot en cours : couleur et agrandissement (karaoké). */
  actif?: { couleur: string; echelle: number };
  /** Un seul mot à la fois, en majuscules (pop). */
  unMot?: boolean;
  /** Montage auto (B, style « punchline ») : toute la ligne en MAJUSCULES, ombre, mot clé coloré, entrée « pop ». */
  majuscules?: boolean;
  ombre?: { couleur: string; flou: number; dy: number };
  cle?: boolean;
  pop?: boolean;
}

/** Mots forts : en citron, légèrement plus gros. */
export const MOT_FORT = { couleur: CITRON, echelle: 1.08 };

export const STYLES_ST: Record<string, StyleSousTitres> = {
  karaoke: {
    famille: INTER, poids: 800, taille: 70, interligne: 1.18, couleur: '#FFFFFF',
    contour: { couleur: '#000000', epaisseur: 8 }, actif: { couleur: CITRON, echelle: 1.1 },
  },
  pop: { famille: INTER, poids: 800, taille: 112, interligne: 1.1, couleur: '#FFFFFF', contour: { couleur: '#000000', epaisseur: 10 }, unMot: true },
  boite: {
    famille: INTER, poids: 700, taille: 60, interligne: 1.22, couleur: '#FFFFFF',
    fond: { couleur: 'rgba(0, 0, 0, 0.8)', rayon: 18, marge: [28, 14] },
  },
  // Montage auto (B) : 70 px en 720p = 105 px de référence (petit côté 1080), contour noir 5 px en 720p = 7,5.
  punchline: {
    famille: INTER, poids: 800, taille: 105, interligne: 1.08, couleur: '#FFFFFF',
    contour: { couleur: '#000000', epaisseur: 7.5 }, ombre: { couleur: 'rgba(0, 0, 0, 0.6)', flou: 16, dy: 6 },
    majuscules: true, cle: true, pop: true,
  },
};

/** Style de sous-titres (style inconnu → karaoké). */
export function styleSousTitres(id: string | undefined): StyleSousTitres {
  return STYLES_ST[id ?? 'karaoke'] ?? STYLES_ST.karaoke!;
}

/** Police CSS pour le canevas, ex. '800 64px "Arko Inter", sans-serif'. */
export function police(poids: number, taille: number, famille: string): string {
  return `${poids} ${Math.round(taille * 10) / 10}px ${famille}`;
}
