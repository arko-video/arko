// A. Découpe des plans par les morceaux gardés (dev 1), fonction PURE partagée par l'opération couperLesBlancs
// (recette/operations-coupes-auto.ts) et par l'aperçu (blancs.ts) : l'aperçu annonce donc exactement le résultat.

import { arrondir, DUREE_MIN_PLAN } from '../../recette/temps';
import type { Plan, Recette, Sec } from '../../recette/types';
import type { PlageTemps } from '../types';

export interface Decoupe {
  /** Nouveaux plans (pas encore normalisés). */
  plans: Plan[];
  /** Nombre de passages enlevés (les « coupes » annoncées par l'aperçu). */
  enleves: number;
}

const EPS = 0.005;

/** Morceaux triés et fusionnés s'ils se touchent (l'opération accepte une liste dans n'importe quel ordre). */
export function ranger(morceaux: readonly PlageTemps[]): PlageTemps[] {
  const tries = [...morceaux].filter((m) => m.a > m.de).sort((x, y) => x.de - y.de);
  const res: PlageTemps[] = [];
  for (const m of tries) {
    const der = res[res.length - 1];
    if (der && m.de <= der.a) der.a = Math.max(der.a, m.a);
    else res.push({ de: m.de, a: m.a });
  }
  return res;
}

/** Première vidéo de la recette (celle des plans sans `src`). */
export function premiereVideo(r: Pick<Recette, 'sources'>): string | undefined {
  return r.sources.find((s) => s.type === 'video')?.id;
}

/** Premier indice de `morceaux` (triés) qui finit après `t` (dichotomie). */
function premierApres(morceaux: readonly PlageTemps[], t: Sec): number {
  let bas = 0;
  let haut = morceaux.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (morceaux[m]!.a <= t) bas = m + 1;
    else haut = m;
  }
  return bas;
}

/** Parties de [de, a] couvertes par les morceaux, arrondies au 1/100 s, d'au moins `min` s ; + passages enlevés. */
export function morceauxDans(de: Sec, a: Sec, morceaux: readonly PlageTemps[], min: Sec): { parts: PlageTemps[]; enleves: number } {
  const parts: PlageTemps[] = [];
  const minimum = Math.max(min, DUREE_MIN_PLAN);
  for (let i = premierApres(morceaux, de); i < morceaux.length && morceaux[i]!.de < a; i++) {
    const m = morceaux[i]!;
    const p = { de: arrondir(Math.max(de, m.de)), a: arrondir(Math.min(a, m.a)) };
    if (p.a - p.de >= minimum - 1e-9) parts.push(p);
  }
  if (parts.length === 0) return { parts, enleves: 1 };
  let enleves = parts.length - 1;
  if (parts[0]!.de - de > EPS) enleves++;
  if (a - parts[parts.length - 1]!.a > EPS) enleves++;
  return { parts, enleves };
}

/**
 * Sans `plage` : chaque plan de la 1ʳᵉ vidéo est remplacé par ses parties couvertes par les morceaux (mêmes
 * réglages ; transition sur la 1ʳᵉ partie, arrêt sur image sur la dernière). Les plans d'une autre vidéo restent.
 * Avec `plage` : les plans deviennent les morceaux de la plage (1ʳᵉ vidéo). `morceaux` triés, sans chevauchement.
 */
export function decouperPlans(recette: Recette, morceaux: readonly PlageTemps[], morceauMin: Sec, plage?: PlageTemps): Decoupe {
  const src = premiereVideo(recette);
  if (plage) {
    const duree = recette.sources.find((s) => s.id === src)?.duree ?? Infinity;
    const { parts, enleves } = morceauxDans(Math.max(0, plage.de), Math.min(plage.a, duree > 0 ? duree : Infinity), morceaux, morceauMin);
    return { plans: parts.map((p) => ({ de: p.de, a: p.a })), enleves };
  }
  const plans: Plan[] = [];
  let enleves = 0;
  for (const p of recette.plans) {
    if ((p.src ?? src) !== src) {
      plans.push(p);
      continue;
    }
    const r = morceauxDans(p.de, p.a, morceaux, morceauMin);
    enleves += r.enleves;
    r.parts.forEach((part, k) => {
      const nouveau: Plan = { ...p, de: part.de, a: part.a };
      if (k > 0) delete nouveau.trans;
      if (k < r.parts.length - 1) delete nouveau.fige;
      plans.push(nouveau);
    });
  }
  return { plans, enleves };
}
