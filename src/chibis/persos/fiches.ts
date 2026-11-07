// D. Proportions des 6 styles « Persos » (7/11/2026) : une FICHE par style, dans le repère du dessin (100 unités =
// hauteur du perso debout, pieds en (0, 0), y vers le haut négatif). Les coiffures, visages, chapeaux et tenues des
// chibis sont reposés sur ces proportions par des sous-repères (voir reperes.ts) : rien n'est dupliqué.
// Ce sont NOS styles, dessinés par le code (CC0) : aucun personnage ni style connu n'est imité.

import type { StylePerso } from '../catalogue';

/** Façon de dessiner les bras et les jambes. */
export type Membres = 'effiles' | 'tuyaux' | 'batons' | 'moignons' | 'pieces';
/** Forme du torse. */
export type Torse = 'trapeze' | 'poire' | 'sac' | 'aucun' | 'bloc' | 'decoupe';

export interface Fiche {
  /** Tête (ovale) : centre en y, rayons. Pour la mascotte, c'est le corps entier. */
  tete: { cy: number; rx: number; ry: number };
  /** Visage : agrandissement des yeux / bouche par rapport à la tête, et décalage vertical (unités du chibi). */
  visage: { k: number; dy: number };
  /** Pivot de la tête (le cou), épaule et hanche droites. */
  cou: number;
  epaule: { x: number; y: number };
  hanche: { x: number; y: number };
  /** Longueurs des bras (haut, avant-bras) et des jambes (cuisse, mollet). */
  bras: [number, number];
  jambe: [number, number];
  /** Torse : haut, bas, demi-largeurs en haut et en bas. */
  torse: { forme: Torse; haut: number; bas: number; lh: number; lb: number };
  membres: Membres;
  /** Demi-largeurs d'un bras et d'une jambe ; rayon des mains ; pieds (demi-longueur, demi-hauteur). */
  larg: { bras: number; jambe: number };
  main: number;
  pied: { l: number; h: number };
  /** Exagération des poses (1 = normal). */
  exagere: number;
  /** Épaisseur des traits du visage et des cheveux par rapport à ceux du corps. */
  traitTete: number;
  /** Oreilles dessinées ? */
  oreilles: boolean;
  /**
   * Buste : le dessin s'arrête sous la ceinture (bord de papier déchiré), sans jambes. 100 unités = hauteur du
   * buste, bord du bas en y = 0.
   */
  buste?: boolean;
}

export const FICHES: Record<StylePerso, Fiche> = {
  // BD : tête ≈ 1/4,5 de la hauteur, épaules larges, vrai corps.
  bd: {
    tete: { cy: -88, rx: 9, ry: 11.5 }, visage: { k: 1.15, dy: 1 }, cou: -76,
    epaule: { x: 12.5, y: -72 }, hanche: { x: 5.6, y: -47 }, bras: [17, 16], jambe: [23.5, 23],
    torse: { forme: 'trapeze', haut: -75, bas: -46, lh: 14, lb: 9.5 }, membres: 'effiles',
    larg: { bras: 3.3, jambe: 4.4 }, main: 3.1, pied: { l: 6, h: 2.8 }, exagere: 1, traitTete: 0.7, oreilles: true,
  },
  // Dessin animé : tête ≈ 1/3, corps en poire, bras souples, grosses mains et grosses chaussures.
  cartoon: {
    tete: { cy: -83, rx: 15.5, ry: 16.5 }, visage: { k: 1.12, dy: 2 }, cou: -67,
    epaule: { x: 9.5, y: -63 }, hanche: { x: 5.5, y: -37 }, bras: [17, 16.5], jambe: [18.5, 18],
    torse: { forme: 'poire', haut: -66, bas: -35, lh: 10, lb: 14.5 }, membres: 'tuyaux',
    larg: { bras: 2.8, jambe: 3.2 }, main: 4.6, pied: { l: 9, h: 4.2 }, exagere: 1.6, traitTete: 0.8, oreilles: true,
  },
  // Bonhomme raté : tête en patate ≈ 1/3, corps et membres en traits simples.
  rate: {
    tete: { cy: -83, rx: 15, ry: 17 }, visage: { k: 1.15, dy: 0 }, cou: -66,
    epaule: { x: 6.5, y: -59 }, hanche: { x: 4, y: -39 }, bras: [19, 18], jambe: [20.5, 20],
    torse: { forme: 'sac', haut: -63, bas: -38, lh: 7.5, lb: 9 }, membres: 'batons',
    larg: { bras: 1, jambe: 1 }, main: 3, pied: { l: 5, h: 2.6 }, exagere: 1.3, traitTete: 0.85, oreilles: true,
  },
  // Mascotte ronde : le corps EST la tête (un seul rond), mini bras, petits pieds.
  mascotte: {
    tete: { cy: -45, rx: 37, ry: 40 }, visage: { k: 1.15, dy: -6.5 }, cou: -12,
    epaule: { x: 33, y: -32 }, hanche: { x: 17, y: -8 }, bras: [8, 8], jambe: [3, 2],
    torse: { forme: 'aucun', haut: -30, bas: -6, lh: 26, lb: 26 }, membres: 'moignons',
    larg: { bras: 4.6, jambe: 4 }, main: 5.2, pied: { l: 9.5, h: 5 }, exagere: 1.2, traitTete: 1.1, oreilles: false,
  },
  // Pixel : proportions normales (tête ≈ 1/3), dessiné sur une petite grille.
  pixel: {
    tete: { cy: -84, rx: 13.5, ry: 15 }, visage: { k: 1.25, dy: 3 }, cou: -69,
    epaule: { x: 10, y: -66 }, hanche: { x: 5, y: -40 }, bras: [14, 13], jambe: [20, 19.5],
    torse: { forme: 'bloc', haut: -69, bas: -38, lh: 11, lb: 10 }, membres: 'effiles',
    larg: { bras: 3.4, jambe: 4.4 }, main: 3.5, pied: { l: 6, h: 3.4 }, exagere: 1.1, traitTete: 1, oreilles: false,
  },
  // Papier découpé (style choisi par Romain le 7/11) : BUSTE coupé sous la ceinture (bord déchiré), tête ≈ 1/3 du
  // buste (comme un vrai corps vu jusqu'à la taille), pièces géométriques, bras articulés par pièces.
  papier: {
    tete: { cy: -75, rx: 16.5, ry: 17.5 }, visage: { k: 1.12, dy: 1 }, cou: -58,
    epaule: { x: 17, y: -55 }, hanche: { x: 9, y: -2.5 }, bras: [17.5, 16.5], jambe: [10, 10],
    torse: { forme: 'decoupe', haut: -58, bas: -9, lh: 18.5, lb: 15.5 }, membres: 'pieces',
    larg: { bras: 4.4, jambe: 5 }, main: 4.7, pied: { l: 6.5, h: 3 }, exagere: 1.2, traitTete: 0.9, oreilles: true, buste: true,
  },
};

/** Styles dessinés en buste (sans jambes, bord du bas déchiré). */
export function estBuste(style: string): boolean {
  return (FICHES as Record<string, Fiche>)[style]?.buste === true;
}

/** Part de la hauteur prise par la tête (sans les cheveux) : sert aux tests des proportions. */
export function partTete(style: StylePerso): number {
  return (FICHES[style].tete.ry * 2) / 100;
}
