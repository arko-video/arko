// Outil « Couper » de Habiller : petits calculs purs autour de la tête de lecture.
// Les coupes elles-mêmes sont les opérations de l'étape Couper (scinder, supprimer, rognerDebut, rognerFin) :
// ici on ne fait que trouver le plan visé et le temps source à la tête, sans autre logique de coupe.

import { bornesDesPlans, planA, rognerDebut, rognerFin } from '../recette/operations';
import type { Recette, Sec } from '../recette/types';

/** Le plan i contient-il le temps de sortie t ? (début compris, fin exclue, sauf pour le dernier plan) */
export function teteDansPlan(r: Recette, i: number, t: Sec): boolean {
  const b = bornesDesPlans(r);
  if (i < 0 || i >= r.plans.length) return false;
  const fin = i === r.plans.length - 1 ? b[i + 1]! + 1e-6 : b[i + 1]! - 1e-6;
  return t >= b[i]! - 1e-6 && t < fin;
}

/** Plan visé par l'outil : le plan choisi s'il existe, sinon celui sous la tête de lecture (calcul léger, sans compiler). */
export function planVise(r: Recette, tete: Sec, choisi: number | null): number | null {
  if (choisi !== null && choisi >= 0 && choisi < r.plans.length) return choisi;
  if (r.plans.length === 0) return null;
  const b = bornesDesPlans(r);
  for (let i = 0; i < r.plans.length - 1; i++) if (tete < b[i + 1]! - 1e-6) return i;
  return r.plans.length - 1;
}

/** Temps source à la tête, seulement si la tête est dans le plan i (sinon null). */
function sourceDansPlan(r: Recette, i: number, t: Sec): Sec | null {
  const p = planA(r, t);
  return p && p.i === i ? p.ts : null;
}

/** « Couper le début » : le plan i commence à la tête de lecture (même opération que la poignée de début). */
export function rognerDebutA(r: Recette, i: number, t: Sec): Recette {
  const ts = sourceDansPlan(r, i, t);
  return ts === null ? r : rognerDebut(r, i, ts);
}

/** « Couper la fin » : le plan i finit à la tête de lecture (même opération que la poignée de fin). */
export function rognerFinA(r: Recette, i: number, t: Sec): Recette {
  const ts = sourceDansPlan(r, i, t);
  return ts === null ? r : rognerFin(r, i, ts);
}

/** Temps de sortie du début du plan i (ou la fin de la vidéo si i est après le dernier plan). */
export function debutDuPlan(r: Recette, i: number): Sec {
  const b = bornesDesPlans(r);
  return b[Math.max(0, Math.min(i, b.length - 1))]!;
}
