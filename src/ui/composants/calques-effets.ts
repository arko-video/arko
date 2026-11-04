// Calques de la mini-frise pour les outils de la phase 3 : repères des sons et des zooms
// (reperesEffets, en temps de sortie), pastilles des coupes (transitions).

import { reperesEffets } from '../../recette/operations';
import { TRANSITIONS } from '../../recette/defauts';
import type { Recette } from '../../recette/types';
import { T } from '../../textes-fr';
import { coupes, nomSon, typeTransition } from '../effets';
import type { Outil } from '../habillage';
import type { Calque } from './MiniFrise';

/** Durée affichée minimale d'un repère (un son très court reste touchable). */
const DUREE_MIN_REPERE = 0.2;

function lireReperes(r: Recette): ReturnType<typeof reperesEffets> {
  try {
    return reperesEffets(r);
  } catch (e) {
    console.error(e);
    return { sons: [], zooms: [], coupes: [] };
  }
}

export function calquesEffets(r: Recette, outil: Outil, choisi: number | null): Calque[] {
  if (outil === 'transitions') {
    return coupes(r).map(([i, t]) => ({
      id: i,
      t0: t,
      t1: t,
      point: true,
      genre: 'coupe',
      label: `${T.transitions.coupeCourt(i)}, ${TRANSITIONS.find((x) => x.id === typeTransition(r.plans[i]))?.nom ?? ''}`,
      choisi: choisi === i,
    }));
  }
  const rep = lireReperes(r);
  if (outil === 'sons') {
    return rep.sons.map((x) => ({
      id: x.i,
      t0: x.t,
      t1: x.t + Math.max(DUREE_MIN_REPERE, x.dur),
      genre: 'son',
      label: nomSon(r.sons[x.i]?.id),
      choisi: choisi === x.i,
    }));
  }
  if (outil === 'zoom') {
    return rep.zooms.map((x) => ({
      id: x.i,
      t0: x.t,
      t1: x.t + Math.max(DUREE_MIN_REPERE, x.dur),
      genre: 'zoom',
      label: T.zoom.repere(x.i + 1),
      choisi: choisi === x.i,
    }));
  }
  return [];
}
