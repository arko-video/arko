// D. Les situations de jeu (7/11/2026) : pour chacune, l'émotion par défaut, la pose des bras (qui remplace celle
// de l'émotion), l'objet en main ou le décor (devant / derrière le perso) et un effet sur tout le perso (lag,
// chute). Chaque situation se combine avec les 24 émotions × bouche ouverte / fermée.

import type { Emotion, Situation } from '../catalogue';
import * as A from './objets-armes';
import type { Scene } from './objets-armes';
import * as V from './objets-vie';
import type { PoseMain } from './postures';

export interface DefSituation {
  /** Émotion par défaut (prise quand l'émotion est « parle », le défaut d'un tour de parole). */
  emo: Emotion;
  d?: PoseMain;
  g?: PoseMain;
  /** Mains qui tiennent l'objet : redessinées par-dessus lui. */
  tenu?: ('d' | 'g')[];
  devant?: (sc: Scene) => void;
  derriere?: (sc: Scene) => void;
  /** Effet sur tout le perso. */
  effet?: 'lag' | 'chute';
  /** Lunettes de soleil sur les yeux, quel que soit l'accessoire. */
  lunettes?: boolean;
}

export const DEF_SITUATIONS: Record<Situation, DefSituation> = {
  aucune: { emo: 'parle' },
  epee: { emo: 'determine', d: 'brandit', g: 'poing', tenu: ['d'], devant: A.epee },
  arc: { emo: 'determine', d: 'tire', g: 'tendu', tenu: ['d', 'g'], devant: A.arc },
  bouclier: { emo: 'choque', d: 'poing', g: 'devant', devant: A.bouclier },
  pioche: { emo: 'determine', d: 'arme', g: 'tient', tenu: ['d'], devant: A.pioche },
  marteau: { emo: 'determine', d: 'brandit', g: 'poing', tenu: ['d'], devant: A.marteau },
  bombe: { emo: 'panique', d: 'tient', g: 'joue', devant: A.bombe },
  feu: { emo: 'panique', d: 'haut', g: 'haut', derriere: (sc) => V.flammes(sc, false), devant: (sc) => V.flammes(sc, true) },
  peche: { emo: 'content', d: 'canne', g: 'tient', tenu: ['d'], devant: (sc) => A.canne(sc, sc.f) },
  mange: { emo: 'content', d: 'aLaBouche', g: 'ventre', tenu: ['d'], devant: V.cuisse },
  potion: { emo: 'surpris', d: 'aLaBouche', g: 'hanche', tenu: ['d'], devant: V.potion },
  mort: { emo: 'defaite', d: 'pendant', g: 'pendant', devant: V.fantome },
  trophee: { emo: 'victoire', d: 'trophee', g: 'trophee', tenu: ['d', 'g'], devant: V.trophee },
  coffre: { emo: 'amoureux', d: 'ecarte', g: 'ecarte', devant: V.coffre },
  gemme: { emo: 'victoire', d: 'brandit', g: 'hanche', devant: V.gemmeBrandie },
  manette: { emo: 'rage', d: 'lance', g: 'poingHaut', devant: A.manette },
  lag: { emo: 'confus', effet: 'lag' },
  peur: { emo: 'panique', d: 'joue', g: 'joue', derriere: V.monstre },
  afk: { emo: 'dort', d: 'pendant', g: 'pendant', devant: V.afk },
  micro: { emo: 'parle', d: 'micro', g: 'geste', tenu: ['d'], devant: A.micro },
  soin: { emo: 'content', d: 'tient', g: 'coeur', devant: V.soin },
  chute: { emo: 'panique', d: 'haut', g: 'haut', effet: 'chute', derriere: (sc) => V.traits(sc, 'haut') },
  court: { emo: 'determine', d: 'courtAvant', g: 'courtArriere', derriere: (sc) => V.traits(sc, 'cote') },
  frime: { emo: 'frime', d: 'pouce', g: 'hanche', lunettes: true },
};

/**
 * Papier découpé (retours des agents persos, 7/11) : le micro tenu passe sur le côté (il ne se pose plus sur le
 * micro du casque) et les mains tiennent le coffre. Les autres styles gardent DEF_SITUATIONS tel quel.
 */
export const SITUATIONS_PAPIER: Partial<Record<Situation, Partial<DefSituation>>> = {
  micro: { d: 'microCote' },
  coffre: { d: 'coffre', g: 'coffre', tenu: ['d', 'g'] },
};

/** La situation telle que la dessine ce style. */
export function situationDe(sit: Situation | undefined, style: string): DefSituation | undefined {
  if (!sit || sit === 'aucune') return undefined;
  const base = DEF_SITUATIONS[sit];
  const papier = style === 'papier' ? SITUATIONS_PAPIER[sit] : undefined;
  return base && papier ? { ...base, ...papier } : base;
}

/** Émotion montrée : celle choisie, sauf « parle » (le défaut) qui laisse la situation choisir. */
export function emotionAvecSituation(emo: Emotion | undefined, sit: Situation | undefined): Emotion {
  if (sit && sit !== 'aucune' && (!emo || emo === 'parle')) return DEF_SITUATIONS[sit]?.emo ?? 'parle';
  return emo ?? 'parle';
}
