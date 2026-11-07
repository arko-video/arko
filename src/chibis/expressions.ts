// D. Les 24 expressions des chibis (dev 3) : pour chaque émotion, la forme des yeux, des sourcils, de la bouche
// (fermée / ouverte), la pose des bras, l'inclinaison de la tête et les petits signes (sueur, veine, « zzz »…).
// Table pure : le dessin la lit (visage.ts, corps.ts, signes.ts). Contrat : conception/contrat-wankil.md §5.

import type { Emotion } from './catalogue';

/** Forme des yeux. `normaux` = la forme choisie pour le chibi (ronds, points, fatigués, grands). */
export type FormeYeux =
  | 'normaux' | 'heureux' | 'plisses' | 'ecarquilles' | 'croix' | 'spirales' | 'coeurs' | 'etoiles'
  | 'fermes' | 'larmes' | 'miClos' | 'cote' | 'vides' | 'determines' | 'tristes';

export type Sourcils = 'aucun' | 'neutres' | 'hauts' | 'fronces' | 'tristes' | 'unHaut' | 'inquiets';

export type FormeBouche =
  | 'sourire' | 'parle' | 'grandSourire' | 'rire' | 'sourireDents' | 'fouRire' | 'grimace' | 'cri' | 'dents'
  | 'hurlement' | 'colere' | 'grogne' | 'vague' | 'o' | 'petitO' | 'sourireCoin' | 'parleCoin' | 'langue' | 'triste'
  | 'gemit' | 'tremble' | 'pleurs' | 'cote' | 'coteOuverte' | 'moue' | 'chat' | 'nausee' | 'plate' | 'soupir';

export type PoseBras =
  | 'bas' | 'leves' | 'poings' | 'menton' | 'ventre' | 'tete' | 'pointe' | 'pouce' | 'joues' | 'ecartes' | 'unLeve';

export type Signe =
  | 'sueur' | 'veine' | 'zzz' | 'rougeur' | 'larmesQuiCoulent' | 'etoiles' | 'coeurs' | 'exclamation' | 'questions'
  | 'vapeur' | 'traitsCri' | 'bleu' | 'gouttes' | 'nuage' | 'eclat' | 'points' | 'bulle' | 'traitsVitesse' | 'larme'
  | 'vert' | 'rouge' | 'cernes' | 'feu' | 'larmesVolent';

export interface Expression {
  yeux: FormeYeux;
  sourcils: Sourcils;
  /** Bouche fermée, puis ouverte (animation façon PNGtuber). */
  bouche: [FormeBouche, FormeBouche];
  bras: PoseBras;
  /** Inclinaison de la tête (degrés, + = vers la droite du chibi). */
  tete: number;
  /** Inclinaison du haut du corps (degrés). */
  corps?: number;
  signes: Signe[];
}

const E = (
  yeux: FormeYeux, sourcils: Sourcils, fermee: FormeBouche, ouverte: FormeBouche, bras: PoseBras, tete: number,
  signes: Signe[] = [], corps = 0,
): Expression => ({ yeux, sourcils, bouche: [fermee, ouverte], bras, tete, corps, signes });

export const EXPRESSIONS: Record<Emotion, Expression> = {
  parle: E('normaux', 'neutres', 'sourire', 'parle', 'bas', 0),
  rit: E('heureux', 'hauts', 'grandSourire', 'rire', 'ventre', -6, ['rougeur']),
  mortDeRire: E('plisses', 'hauts', 'sourireDents', 'fouRire', 'ventre', -10, ['larmesVolent', 'traitsVitesse', 'rougeur'], -5),
  crie: E('ecarquilles', 'hauts', 'grimace', 'cri', 'poings', 0, ['traitsCri']),
  hurle: E('plisses', 'fronces', 'dents', 'hurlement', 'leves', -4, ['traitsCri', 'veine'], -4),
  enerve: E('normaux', 'fronces', 'colere', 'grogne', 'poings', 0, ['veine']),
  rage: E('vides', 'fronces', 'dents', 'hurlement', 'poings', 3, ['veine', 'vapeur', 'rouge']),
  choque: E('ecarquilles', 'hauts', 'vague', 'o', 'joues', 0, ['bleu', 'sueur']),
  surpris: E('ecarquilles', 'hauts', 'petitO', 'o', 'ecartes', 5, ['exclamation']),
  frime: E('miClos', 'unHaut', 'sourireCoin', 'parleCoin', 'pouce', 6, ['eclat']),
  moqueur: E('miClos', 'unHaut', 'langue', 'rire', 'pointe', -7, ['traitsVitesse']),
  panique: E('spirales', 'inquiets', 'vague', 'cri', 'leves', 0, ['gouttes', 'sueur']),
  triste: E('tristes', 'tristes', 'triste', 'gemit', 'bas', 8, ['bleu', 'larme']),
  pleure: E('larmes', 'tristes', 'tremble', 'pleurs', 'bas', 0, ['larmesQuiCoulent']),
  gene: E('cote', 'inquiets', 'vague', 'petitO', 'tete', 7, ['rougeur', 'sueur']),
  reflechit: E('cote', 'unHaut', 'cote', 'coteOuverte', 'menton', 8, ['points']),
  confus: E('spirales', 'inquiets', 'vague', 'petitO', 'ecartes', -12, ['questions']),
  dort: E('fermes', 'aucun', 'moue', 'petitO', 'bas', 12, ['zzz', 'bulle']),
  content: E('heureux', 'neutres', 'grandSourire', 'parle', 'bas', 5, ['rougeur']),
  amoureux: E('coeurs', 'hauts', 'chat', 'parle', 'joues', -5, ['coeurs', 'rougeur']),
  malade: E('miClos', 'tristes', 'vague', 'nausee', 'ventre', 9, ['vert', 'cernes', 'sueur']),
  determine: E('determines', 'fronces', 'plate', 'grogne', 'unLeve', 0, ['feu']),
  victoire: E('etoiles', 'hauts', 'grandSourire', 'rire', 'leves', 0, ['etoiles']),
  defaite: E('croix', 'tristes', 'plate', 'soupir', 'bas', 14, ['nuage'], 3),
};

/** Émotions dont les signes bougent avec le temps (larmes, « zzz », cœurs, vapeur…) : 6 images par seconde. */
export const SIGNES_ANIMES: ReadonlySet<Signe> = new Set(['zzz', 'larmesQuiCoulent', 'larmesVolent', 'coeurs', 'vapeur', 'gouttes', 'etoiles', 'nuage', 'bulle', 'feu']);

/** Images par seconde des signes animés (dessin « fait main », sur une boucle d'une seconde). */
export const IMAGES_SIGNES = 6;

/** Phase de l'animation des signes (0 à 1) au temps t, ou 0 si l'émotion ne bouge pas. */
export function phaseSignes(emo: Emotion, t: number | undefined): number {
  if (!t || !EXPRESSIONS[emo].signes.some((s) => SIGNES_ANIMES.has(s))) return 0;
  const i = Math.floor(t * IMAGES_SIGNES + 1e-6);
  return (((i % IMAGES_SIGNES) + IMAGES_SIGNES) % IMAGES_SIGNES) / IMAGES_SIGNES;
}
