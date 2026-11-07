// B. Insérer un élément entre deux parties (dev 2), fonction PURE : OÙ insérer quand on touche « Insérer ici ».
// La tête de lecture coupe le plan en deux ; à moins de 0,15 s d'une coupe (ou dans un arrêt sur image, dans un
// élément déjà inséré, ou trop près du bord d'un plan pour le couper), on se cale sur la coupe la plus proche
// (même règle que insererMeme). Contrat : contrat-wankil.md §4.1.

import { compiler, dansArret, sourceA } from '../../recette/chronologie';
import { arrondir, DUREE_MIN_PLAN, dureePlan } from '../../recette/temps';
import type { Recette, Sec } from '../../recette/types';

export const AIMANT_INSERTION: Sec = 0.15;

/** Temps de sortie de chaque coupe : début de chaque plan, plus la fin (longueur = plans.length + 1). */
export function coupesDe(r: Recette): Sec[] {
  const res: Sec[] = [0];
  for (const p of r.plans) res.push(res[res.length - 1]! + dureePlan(p));
  return res.map(arrondir);
}

/**
 * `i` = indice du futur plan inséré (0 = tout au début, n = à la fin) ; `t` = temps de sortie exact où il commence ;
 * `coupe` = true s'il faut d'abord scinder le plan sous la tête (sinon on se cale sur une coupe existante).
 */
export function pointInsertion(
  r: Recette,
  t: Sec,
  aimant: Sec = AIMANT_INSERTION,
): { i: number; t: Sec; coupe: boolean; ts?: Sec } {
  const coupes = coupesDe(r);
  const tb = Number.isFinite(t) ? Math.min(Math.max(0, t), coupes[coupes.length - 1]!) : 0;
  let k = 0;
  coupes.forEach((c, j) => {
    if (Math.abs(c - tb) < Math.abs(coupes[k]! - tb)) k = j;
  });
  const surCoupe = { i: k, t: coupes[k]!, coupe: false };
  if (r.plans.length === 0 || Math.abs(coupes[k]! - tb) < aimant) return surCoupe;
  const pos = sourceA(compiler(r), tb);
  if (!pos || dansArret(pos.plan, tb) || r.plans[pos.plan.i]?.ins) return surCoupe;
  const ts = arrondir(pos.ts);
  const p = pos.plan;
  if (ts - p.de < DUREE_MIN_PLAN - 1e-6 || p.a - ts < DUREE_MIN_PLAN - 1e-6) return surCoupe;
  // Même calcul que scinder : la coupe tombe sur le temps source arrondi au 1/100.
  // `ts` (en plus) : temps source de la coupe dans le plan p.i.
  return { i: p.i + 1, t: arrondir(p.t0 + (ts - p.de) / p.vit), coupe: true, ts };
}
