// Actions de coupe PARTAGÉES par l'étape Couper et l'outil « Couper » de Habiller : mêmes opérations
// de la recette (scinder, supprimer, rognerDebut, rognerFin), même historique (modifier → Annuler / Rétablir),
// même aimant au rythme du son guide. Textes, sons, zooms et sous-titres suivent donc les coupes
// exactement de la même façon depuis les deux écrans.

import { estElementInsere, scinder, supprimer, supprimerElement } from '../recette/operations';
import type { Recette } from '../recette/types';
import { debutDuPlan, rognerDebutA, rognerFinA } from './coupe-tete';
import { modifier, recette, selection, teteLecture } from './etat';
import { aimanterRythme, vibrer } from './guide';
import { chercher, mettreEnPause } from './lecture';

/**
 * Applique une opération puis place la tête de lecture : par défaut là où elle était,
 * ou au temps donné, ou au temps calculé sur la recette d'après. Renvoie false si rien n'a changé.
 */
export function agirCoupe(op: (r: Recette) => Recette, teteApres?: number | ((r: Recette) => number)): boolean {
  mettreEnPause();
  const avant = teteLecture.peek();
  if (!modifier(op)) return false;
  const r = recette.peek();
  chercher(typeof teteApres === 'function' ? (r ? teteApres(r) : avant) : (teteApres ?? avant));
  return true;
}

/** Scinde à la tête de lecture. « Caler les coupes sur le rythme » : la coupe se pose sur le temps fort proche (±0,12 s). */
export function scinderIci(): boolean {
  mettreEnPause();
  const cale = aimanterRythme(teteLecture.peek());
  const t = cale ?? teteLecture.peek();
  if (!modifier((r) => scinder(r, t))) return false;
  selection.value = null;
  if (cale !== null) {
    vibrer();
    chercher(t);
  }
  return true;
}

/**
 * Supprime le plan i. La tête reste où elle était, ou (`aLaJointure`) se pose sur la jointure
 * laissée par le plan supprimé : on voit tout de suite ce qui vient après.
 */
export function supprimerPlan(i: number, aLaJointure = false): boolean {
  mettreEnPause();
  // v3 (B) : supprimer un élément inséré recolle la suite (décalage inverse de l'habillage).
  if (!modifier((r) => (estElementInsere(r, i) ? supprimerElement(r, i) : supprimer(r, i)))) return false;
  selection.value = null;
  const r = recette.peek();
  chercher(aLaJointure && r ? debutDuPlan(r, i) : teteLecture.peek());
  return true;
}

/** Le plan i commence à la tête de lecture ; la tête reste sur la même image (devenue le début du plan). */
export function rognerDebutIci(i: number): boolean {
  const t = teteLecture.peek();
  return agirCoupe((r) => rognerDebutA(r, i, t), (r) => debutDuPlan(r, i));
}

/** Le plan i finit à la tête de lecture ; la tête reste sur la nouvelle fin du plan. */
export function rognerFinIci(i: number): boolean {
  const t = teteLecture.peek();
  return agirCoupe((r) => rognerFinA(r, i, t), (r) => debutDuPlan(r, i + 1));
}
