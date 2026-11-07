// D. Mesures du chibi (dev 3), dans le repère du dessin : 100 unités = sa hauteur, pieds en (0, 0), y vers le haut
// négatif. Grosse tête (≈ 60 % de la hauteur), petit corps, bras et jambes courts ; largeur ≈ 0,8 × hauteur.

import type { Pt } from './pinceau';

/** Tête : ovale de centre (cx, cy), rayons rx, ry (du haut −95 au menton −37). */
export const TETE = { cx: 0, cy: -66, rx: 33, ry: 29 } as const;

/** Point de rotation de la tête (le cou) et des épaules. */
export const COU: Pt = [0, -38];
/** Point de rotation du haut du corps (les hanches). */
export const HANCHES: Pt = [0, -13];

/** Torse en forme de poire (points de contrôle d'une courbe lisse). */
export const TORSE: readonly Pt[] = [[-11, -39], [11, -39], [15, -27], [16.5, -16], [11, -11], [-11, -11], [-16.5, -16], [-15, -27]];

/** Épaule droite (côté x positif) ; la gauche est son reflet. */
export const EPAULE: Pt = [12, -35];

/** Yeux, sourcils, bouche, joues (côté droit pour les paires). */
export const VISAGE = { yeuxX: 12.5, yeuxY: -64, sourcilsY: -75, boucheY: -50, jouesX: 21, jouesY: -55 } as const;

/** Haut des cheveux selon la coiffure (pour poser chapeaux et signes au-dessus). */
export const HAUT_CHEVEUX: Record<string, number> = {
  courts: -98, herisses: -106, meche: -100, longs: -98, queue: -98, chignon: -108, afro: -112, rase: -96, bol: -99, crete: -110,
};
