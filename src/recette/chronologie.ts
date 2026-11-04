// Compilation (pure) d'une recette en « scénario » : les plans placés en temps de sortie,
// et les conversions temps de sortie ↔ temps source. Le moteur de rendu ne lit que le scénario.

import { TRANSITION } from './defauts';
import { placerSousTitres, type SousTitresPlaces } from './sous-titres-places';
import { arrondir, dureePlan } from './temps';
import type { MiseEnPage, Recette, Sec, Son, SonGuide, Texte, Transition, Zoom } from './types';

/** Un plan placé sur la frise de sortie. */
export interface PlanPlace {
  i: number;
  src: string;
  /** Temps source du morceau gardé. */
  de: Sec;
  a: Sec;
  vit: number;
  /** Temps de sortie du début et de la fin (non arrondis). */
  t0: Sec;
  t1: Sec;
  /** Début de l'arrêt sur image (= t1 s'il n'y en a pas). De tFige à t1, l'image est figée et muette. */
  tFige: Sec;
  /** Mise en page effective (globale fusionnée avec celle du plan). */
  mise: MiseEnPage;
  /** Transition d'entrée (null = coupe franche). */
  trans: Required<Pick<Transition, 'type' | 'dur'>> & Pick<Transition, 'son'> | null;
}

/** Un élément posé à un temps de sortie précis (sons, zooms). */
export interface Pose<T> {
  t: Sec;
  element: T;
}

export interface Scenario {
  duree: Sec;
  plans: PlanPlace[];
  textes: Texte[];
  sons: Pose<Son>[];
  zooms: Pose<Zoom>[];
  /** Sous-titres convertis en temps de sortie et découpés en lignes (null si aucun). */
  sousTitres: SousTitresPlaces | null;
  guide: SonGuide | null;
}

/** Mise en page effective d'un plan : même type que la globale → fusion ; autre type → remplace. */
export function miseDuPlan(globale: MiseEnPage, plan?: Recette['plans'][number]['mise']): MiseEnPage {
  if (!plan) return globale;
  if (plan.type === globale.type) return { ...globale, ...plan } as MiseEnPage;
  if (plan.type === 'jeuCam' && !plan.cam) return globale;
  return { ...plan } as MiseEnPage;
}

function lireTrans(t: Recette['plans'][number]['trans']): PlanPlace['trans'] {
  if (!t) return null;
  const obj = typeof t === 'string' ? { type: t } : t;
  if (obj.type === 'coupe') return null;
  const res: NonNullable<PlanPlace['trans']> = { type: obj.type, dur: obj.dur ?? TRANSITION.dur };
  if (obj.son !== undefined) res.son = obj.son;
  return res;
}

/** Compile une recette (déjà normalisée) en scénario. */
export function compiler(recette: Recette): Scenario {
  const premiere = recette.sources.find((s) => s.type === 'video')?.id ?? '';
  const plans: PlanPlace[] = [];
  let t = 0;
  recette.plans.forEach((p, i) => {
    const vit = p.vit ?? 1;
    const dur = dureePlan(p);
    plans.push({
      i,
      src: p.src ?? premiere,
      de: p.de,
      a: p.a,
      vit,
      t0: t,
      t1: t + dur,
      tFige: t + dur - (p.fige ?? 0),
      mise: miseDuPlan(recette.mise, p.mise),
      trans: i === 0 ? null : lireTrans(p.trans),
    });
    t += dur;
  });
  const sousTitres = placerSousTitres(recette.sousTitres, plans, recette.mise, premiere);
  const scenario: Scenario = { duree: t, plans, textes: recette.textes, sons: [], zooms: [], sousTitres, guide: recette.guide };
  scenario.sons = poser(scenario, recette.sons, premiere);
  scenario.zooms = poser(scenario, recette.zooms, premiere);
  return scenario;
}

/** Convertit les éléments en `ts` (temps source) en temps de sortie ; un passage réutilisé les fait réapparaître. */
function poser<T extends { t?: Sec; ts?: Sec; src?: string }>(s: Scenario, liste: T[], premiere: string): Pose<T>[] {
  const res: Pose<T>[] = [];
  for (const e of liste) {
    if (e.ts !== undefined) for (const t of sortiesDe(s, e.src ?? premiere, e.ts)) res.push({ t, element: e });
    else if (e.t !== undefined && e.t <= s.duree) res.push({ t: e.t, element: e });
  }
  return res.sort((a, b) => a.t - b.t);
}

/** Plan affiché au temps de sortie t (le dernier plan inclut sa fin). null si hors vidéo. */
export function planAuTemps(s: Scenario, t: Sec): PlanPlace | null {
  if (s.plans.length === 0 || t < 0 || t > s.duree + 1e-9) return null;
  // Recherche dichotomique : premier plan dont la fin est après t.
  let bas = 0;
  let haut = s.plans.length - 1;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (s.plans[m]!.t1 > t + 1e-9) haut = m;
    else bas = m + 1;
  }
  return s.plans[bas]!;
}

/** Écart sous la fin du plan pendant un arrêt sur image : on garde la DERNIÈRE image du plan, jamais celle d'après la coupe. */
export const ECART_FIGE: Sec = 0.001;

/** true si le temps de sortie t tombe dans l'arrêt sur image du plan. */
export function dansArret(plan: PlanPlace, t: Sec): boolean {
  return plan.tFige < plan.t1 && t >= plan.tFige - 1e-9;
}

/** Temps source correspondant au temps de sortie t (null si hors vidéo). Pendant un arrêt sur image : a − 0,001. */
export function sourceA(s: Scenario, t: Sec): { plan: PlanPlace; ts: Sec } | null {
  const plan = planAuTemps(s, t);
  if (!plan) return null;
  if (dansArret(plan, t)) return { plan, ts: plan.a - ECART_FIGE };
  const ts = Math.min(plan.a, plan.de + (t - plan.t0) * plan.vit);
  return { plan, ts };
}

/** Tous les temps de sortie où le temps source `ts` de la source `src` apparaît (jamais pendant un arrêt sur image). */
export function sortiesDe(s: Scenario, src: string, ts: Sec): Sec[] {
  const res: Sec[] = [];
  for (const p of s.plans) {
    if (p.src === src && ts >= p.de && ts < p.a) res.push(arrondir(p.t0 + (ts - p.de) / p.vit));
  }
  return res;
}

/**
 * Où attacher un effet posé au temps de sortie t : au temps source (ts + src) si t montre une vraie image
 * du plan, sinon (arrêt sur image, toute fin de la vidéo) au temps de sortie.
 */
export function ancrage(sc: Scenario, t: Sec): { ts: Sec; src: string } | { t: Sec } {
  const pos = sourceA(sc, t);
  if (!pos || dansArret(pos.plan, t)) return { t: arrondir(t) };
  const ts = arrondir(pos.ts);
  if (ts >= pos.plan.a || ts < pos.plan.de) return { t: arrondir(t) };
  return { ts, src: pos.plan.src };
}
