// Opérations « rythme » (phase 4) : vitesse, arrêt sur image, combos, modèles, alerte de rythme.
// Mêmes règles que operations.ts : NOUVELLE recette normalisée, ou la recette d'origine si sans effet.
// CONTRAT : signatures fixées.
// Rappel : durée d'un plan = dureePlan(p) = (a − de) / vit + (fige ?? 0) (voir temps.ts).
//
// Les combos s'attachent au TEMPS SOURCE quand c'est possible (ts + src) : ils suivent ainsi les coupes
// faites plus tard. Pendant un arrêt sur image (pas de temps source), on utilise le temps de sortie t.

import { ancrage, compiler, dansArret, planAuTemps, sourceA, type Scenario } from './chronologie';
import { FIGE, SON, VITESSE } from './defauts';
import { normaliser } from './normaliser';
import { scinder } from './operations';
import { arrondir, DUREE_MIN_PLAN } from './temps';
import type { Plan, Recette, Sec, Son, Zoom } from './types';

export { modeleMeilleurDAbord, modeleTop3 } from './modeles';
export { alerteRythme, conseilAccroche, evenementsRythme, MESSAGE_ACCROCHE, MESSAGE_RYTHME, picLePlusFort, type PicSonore } from './rythme';

export type Combo = 'boom' | 'fige' | 'rate';

/** Réglages des combos (une seule source pour le code et les tests). */
export const COMBOS = {
  boom: { son: 'impact.meme', force: 1.5, dur: 0.5 },
  fige: { son: 'meme.disque-raye', dur: 1 },
  rate: { son: 'comedie.trombone-triste', vit: 0.5, avant: 1.5 },
} as const;

/** Normalise ; renvoie la recette d'origine si rien n'a changé. */
function finir(origine: Recette, modifiee: Recette): Recette {
  const r = normaliser(modifiee, { sources: modifiee.sources }).recette;
  return JSON.stringify(r) === JSON.stringify(origine) ? origine : r;
}

function borner(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

/** Remplace le plan i par `p` (nouvelle liste). */
function avecPlan(recette: Recette, i: number, p: Plan): Recette {
  return { ...recette, plans: recette.plans.map((x, k) => (k === i ? p : x)) };
}

/** Vitesse du plan i (0,25 à 4). */
export function changerVitesse(recette: Recette, i: number, vit: number): Recette {
  const p = recette.plans[i];
  if (!p || !Number.isFinite(vit)) return recette;
  const v = arrondir(borner(vit, VITESSE.min, VITESSE.max));
  const nouveau: Plan = { ...p, vit: v };
  if (v === 1) delete nouveau.vit;
  return finir(recette, avecPlan(recette, i, nouveau));
}

/** Arrêt sur image à la fin du plan i (null = retirer). */
export function figerFin(recette: Recette, i: number, dur: Sec | null): Recette {
  const p = recette.plans[i];
  if (!p) return recette;
  const nouveau: Plan = { ...p };
  if (dur === null || !Number.isFinite(dur) || dur <= 0) delete nouveau.fige;
  else nouveau.fige = arrondir(borner(dur, FIGE.min, FIGE.max));
  return finir(recette, avecPlan(recette, i, nouveau));
}

/**
 * Applique un combo au temps de SORTIE t (déjà reculé de 0,15 s et aimanté par l'interface si besoin) :
 * - boom : zoom punch (bande webcam en jeu + webcam) + son impact.meme
 * - fige : coupe à t, arrêt sur image 1 s + son meme.disque-raye
 * - rate : les 1,5 s avant t passent au ralenti 0,5, puis son comedie.trombone-triste
 * Une seule nouvelle recette : le combo s'annule d'un seul coup.
 */
export function appliquerCombo(recette: Recette, combo: Combo, t: Sec): Recette {
  if (!Number.isFinite(t) || recette.plans.length === 0) return recette;
  const sc = compiler(recette);
  const tb = borner(t, 0, sc.duree);
  if (combo === 'boom') return comboBoom(recette, sc, tb);
  if (combo === 'fige') return comboFige(recette, sc, tb);
  return comboRate(recette, tb);
}

function comboBoom(recette: Recette, sc: Scenario, t: Sec): Recette {
  const plan = planAuTemps(sc, t);
  if (!plan) return recette;
  const ancre = ancrage(sc, t);
  const zoom: Zoom = {
    ...ancre,
    dur: COMBOS.boom.dur,
    force: COMBOS.boom.force,
    style: 'punch',
    zone: plan.mise.type === 'jeuCam' ? 'cam' : 'tout',
  };
  const son: Son = { id: COMBOS.boom.son, ...ancre, vol: SON.vol };
  return finir(recette, { ...recette, zooms: [...recette.zooms, zoom], sons: [...recette.sons, son] });
}

function comboFige(recette: Recette, sc: Scenario, t: Sec): Recette {
  const pos = sourceA(sc, t);
  if (!pos || dansArret(pos.plan, t)) return recette; // déjà figé ici
  let r = scinder(recette, t);
  let i = pos.plan.i;
  // Coupe impossible (t trop près d'une coupe) : on fige le plan qui se termine là.
  if (r === recette && pos.ts - pos.plan.de < DUREE_MIN_PLAN) i = pos.plan.i - 1;
  if (i < 0) return recette;
  const p = r.plans[i]!;
  r = avecPlan(r, i, { ...p, fige: COMBOS.fige.dur });
  // Le son démarre au début de l'arrêt : 1/100 s avant la fin du plan, en temps source.
  const son: Son = { id: COMBOS.fige.son, ts: arrondir(p.a - 0.01), vol: SON.vol };
  const src = compiler(r).plans[i]!.src;
  if (src) son.src = src;
  return finir(recette, { ...r, sons: [...r.sons, son] });
}

function comboRate(recette: Recette, t: Sec): Recette {
  const debut = Math.max(0, t - COMBOS.rate.avant);
  if (t - debut < 0.2) return recette;
  let r = scinder(recette, t);
  r = scinder(r, debut);
  const sc2 = compiler(r);
  // Les morceaux entièrement dans [debut, t] passent au ralenti.
  const ralentis = sc2.plans.filter((p) => p.t0 >= debut - 0.02 && p.tFige <= t + 0.02).map((p) => p.i);
  if (ralentis.length === 0) return recette;
  r = { ...r, plans: r.plans.map((p, k) => (ralentis.includes(k) ? { ...p, vit: COMBOS.rate.vit } : p)) };
  // Le son tombe à la fin du ralenti (début de l'éventuel arrêt sur image).
  const sc3 = compiler(r);
  const fin = sc3.plans[ralentis[ralentis.length - 1]!]!.tFige;
  const son: Son = { id: COMBOS.rate.son, ...ancrage(sc3, fin), vol: SON.vol };
  return finir(recette, { ...r, sons: [...r.sons, son] });
}

/** Temps de sortie le plus proche de t parmi `pics` (à ±rayon), sinon t. */
export function aimanter(t: Sec, pics: readonly Sec[], rayon: Sec = 0.3): Sec {
  let meilleur = t;
  let ecart = rayon + 1e-9;
  for (const p of pics) {
    const e = Math.abs(p - t);
    if (e <= ecart) {
      ecart = e;
      meilleur = p;
    }
  }
  return meilleur;
}
