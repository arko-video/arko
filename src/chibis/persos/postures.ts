// D. Postures des 6 styles « Persos » : pour chaque émotion, la place des mains, la pose des jambes, la penche du
// corps et de la tête, le saut et l'étirement (le corps parle autant que le visage). Table pure, lue par
// squelette.ts. Les chibis d'origine gardent leur propre table (expressions.ts), inchangée.

import type { Emotion } from '../catalogue';

/** Où va une main (côté droit ; le gauche est son reflet). */
export type PoseMain =
  | 'repos' | 'pendant' | 'hanche' | 'geste' | 'ventre' | 'haut' | 'poingHaut' | 'poing' | 'tete' | 'joue'
  | 'ecarte' | 'epaules' | 'menton' | 'pointe' | 'pouce' | 'yeux' | 'nuque' | 'coeur' | 'bouche' | 'porteVoix'
  | 'oreiller'
  // Situations de jeu (objet en main).
  | 'brandit' | 'arme' | 'tient' | 'tendu' | 'tire' | 'trophee' | 'lance' | 'aLaBouche' | 'micro' | 'devant' | 'canne'
  | 'courtAvant' | 'courtArriere'
  // Papier découpé seulement (situations.ts, SITUATIONS_PAPIER) : micro tenu sur le côté, mains sur le coffre.
  | 'microCote' | 'coffre';

export type FormeMain = 'ouverte' | 'poing' | 'doigt' | 'pouce';

export type PoseJambes = 'droites' | 'ecartees' | 'saut' | 'flechies' | 'genoux' | 'croisees' | 'pointe';

export interface Posture {
  d: PoseMain;
  g: PoseMain;
  jambes: PoseJambes;
  /** Penche du haut du corps et de la tête (degrés, + = vers la droite du perso). */
  corps: number;
  tete: number;
  /** Saut (unités) et étirement (+ = étiré en hauteur, − = tassé). */
  saut: number;
  etire: number;
  /** Tassement des jambes (unités, accroupi). */
  plie: number;
}

const P = (d: PoseMain, g: PoseMain, jambes: PoseJambes, corps = 0, tete = 0, saut = 0, etire = 0, plie = 0): Posture => ({ d, g, jambes, corps, tete, saut, etire, plie });

export const POSTURES: Record<Emotion, Posture> = {
  parle: P('geste', 'repos', 'droites', 0, 3),
  rit: P('ventre', 'ventre', 'flechies', -3, -9, 0, -0.04, 3),
  mortDeRire: P('ventre', 'ventre', 'flechies', -10, -16, 0, -0.08, 8),
  crie: P('porteVoix', 'poing', 'ecartees', 0, -5, 0, 0.05),
  hurle: P('poing', 'poing', 'ecartees', 0, -8, 0, 0.06),
  enerve: P('poing', 'hanche', 'ecartees', 2, 0),
  rage: P('poingHaut', 'poingHaut', 'ecartees', 0, 3, 2, 0.05),
  choque: P('joue', 'joue', 'genoux', 0, 0, 0, 0.07),
  surpris: P('ecarte', 'ecarte', 'saut', 0, 4, 6, 0.08),
  frime: P('pouce', 'hanche', 'croisees', 3, 7),
  moqueur: P('pointe', 'ventre', 'droites', -4, -8),
  panique: P('tete', 'tete', 'genoux', 0, 0, 3, 0.03),
  triste: P('pendant', 'pendant', 'droites', 4, 11, 0, -0.03),
  pleure: P('yeux', 'pendant', 'genoux', 0, 6, 0, -0.02),
  gene: P('nuque', 'repos', 'genoux', 3, 9),
  reflechit: P('menton', 'coeur', 'croisees', 2, 9),
  confus: P('epaules', 'epaules', 'droites', 0, -13),
  dort: P('pendant', 'pendant', 'droites', 5, 20, 0, -0.03),
  content: P('hanche', 'hanche', 'droites', 0, 5),
  amoureux: P('coeur', 'coeur', 'pointe', -3, -7, 0, 0.03),
  malade: P('bouche', 'ventre', 'genoux', 5, 9, 0, -0.04, 3),
  determine: P('poingHaut', 'poing', 'ecartees', 0, 0, 0, 0.03),
  victoire: P('haut', 'haut', 'saut', 0, 0, 10, 0.07),
  defaite: P('pendant', 'pendant', 'flechies', 7, 24, 0, -0.07, 7),
};

/**
 * Cible d'une main : `base` = point de départ (épaule, tête ou torse), (dx, dy) en part de la longueur du bras
 * (épaule), du rayon de la tête (tête) ou de la demi-largeur / hauteur du torse (torse). `coude` = direction où plier
 * le coude ; `devant` = dessinée devant la tête.
 */
export interface CibleMain {
  base: 'epaule' | 'tete' | 'torse';
  dx: number;
  dy: number;
  forme: FormeMain;
  coude: [number, number];
  devant?: boolean;
}

const C = (base: CibleMain['base'], dx: number, dy: number, forme: FormeMain, coude: [number, number] = [1, 0.4], devant = false): CibleMain => ({ base, dx, dy, forme, coude, devant });

export const MAINS: Record<PoseMain, CibleMain> = {
  repos: C('epaule', 0.22, 0.93, 'ouverte', [1, 0]),
  pendant: C('epaule', 0.04, 0.98, 'ouverte', [0.4, 0]),
  hanche: C('torse', 1.05, 0.9, 'poing', [1, -0.3]),
  geste: C('epaule', 0.62, 0.32, 'ouverte', [0.3, 1]),
  ventre: C('torse', 0.35, 0.72, 'ouverte', [1, 0.6]),
  haut: C('epaule', 0.5, -0.86, 'ouverte', [1, 0]),
  poingHaut: C('epaule', 0.42, -0.9, 'poing', [1, 0]),
  poing: C('epaule', 0.36, 0.86, 'poing', [1, 0.2]),
  tete: C('tete', 0.62, -0.72, 'ouverte', [1, -0.2], true),
  joue: C('tete', 1.0, 0.3, 'ouverte', [1, 0.6], true),
  ecarte: C('epaule', 0.96, -0.05, 'ouverte', [0, 1]),
  epaules: C('epaule', 0.6, -0.12, 'ouverte', [0.4, 1]),
  menton: C('tete', 0.18, 1.02, 'poing', [1, 0.8], true),
  pointe: C('epaule', 0.98, -0.12, 'doigt', [0, 1]),
  pouce: C('epaule', 0.55, 0.3, 'pouce', [0.5, 1]),
  yeux: C('tete', 0.72, 0.22, 'poing', [1, 0.8], true),
  nuque: C('tete', 0.95, -0.25, 'ouverte', [1, -0.4], true),
  coeur: C('torse', 0.12, 0.22, 'ouverte', [1, 0.8]),
  bouche: C('tete', 0.05, 0.62, 'ouverte', [1, 0.8], true),
  porteVoix: C('tete', 1.1, 0.68, 'ouverte', [1, 0.5], true),
  oreiller: C('tete', 0.95, 0.55, 'ouverte', [0.6, 1], true),
  brandit: C('epaule', 0.42, -0.9, 'poing', [1, 0]),
  arme: C('epaule', 0.12, -0.82, 'poing', [1, 0.2]),
  tient: C('torse', 0.75, 0.38, 'poing', [1, 0.6]),
  tendu: C('epaule', 0.92, 0.12, 'poing', [0, 1]),
  tire: C('torse', 0.15, 0.12, 'poing', [1, 0.4]),
  trophee: C('tete', 1.3, -1.3, 'ouverte', [1, 0]),
  lance: C('epaule', 0.72, -0.75, 'poing', [1, 0.3]),
  aLaBouche: C('tete', 0.55, 0.78, 'poing', [1, 0.8], true),
  micro: C('tete', 0.3, 1.05, 'poing', [1, 0.8], true),
  devant: C('torse', 0.3, 0.78, 'poing', [1, 0.6]),
  canne: C('epaule', 0.6, 0.38, 'poing', [0.5, 1]),
  courtAvant: C('epaule', 0.42, 0.3, 'poing', [0.3, 1]),
  courtArriere: C('epaule', 0.3, 0.98, 'poing', [1, 0]),
  microCote: C('tete', 0.85, 1.0, 'poing', [1, 0.8], true),
  coffre: C('torse', 1.15, 0.9, 'ouverte', [1, -0.2]),
};
