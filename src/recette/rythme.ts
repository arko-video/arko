// Alerte de rythme (phase 4, pure) : repère le passage le plus « mou » de la vidéo finale
// et conseille d'animer l'accroche. Tous les temps sont des temps de SORTIE.

import { compiler } from './chronologie';
import { arrondir } from './temps';
import type { Recette, Sec } from './types';

/** Un passage plus long que ça sans aucun événement « traîne ». */
export const PASSAGE_MOU: Sec = 4;
/** L'accroche = les 3 premières secondes. */
export const DUREE_ACCROCHE: Sec = 3;
export const MESSAGE_RYTHME = 'Ça traîne ici : coupe, zoome ou ajoute un son';
export const MESSAGE_ACCROCHE = 'Ton accroche est calme : ajoute un texte, un son ou un zoom dans les 3 premières secondes.';

/**
 * Événements de la vidéo finale, triés : coupes (et transitions), débuts d'arrêt sur image, débuts de texte,
 * zooms, sons, et les pics sonores donnés.
 */
export function evenementsRythme(recette: Recette, pics: readonly Sec[] = []): Sec[] {
  const sc = compiler(recette);
  const ev: Sec[] = [];
  for (const p of sc.plans) {
    if (p.i > 0) ev.push(p.t0);
    if (p.tFige < p.t1) ev.push(p.tFige);
  }
  for (const x of recette.textes) ev.push(x.t);
  for (const z of sc.zooms) ev.push(z.t);
  for (const s of sc.sons) ev.push(s.t);
  ev.push(...pics);
  return ev.filter((t) => Number.isFinite(t) && t >= 0 && t <= sc.duree).sort((a, b) => a - b);
}

/** Le passage le plus « mou » (plus de 4 s sans événement), ou null. `pics` = pics sonores en temps de sortie. */
export function alerteRythme(recette: Recette, pics: readonly Sec[] = []): { t0: Sec; t1: Sec; message: string } | null {
  const duree = compiler(recette).duree;
  if (duree <= PASSAGE_MOU) return null;
  const bornes = [0, ...evenementsRythme(recette, pics), duree];
  let pire: { t0: Sec; t1: Sec } | null = null;
  for (let k = 1; k < bornes.length; k++) {
    const t0 = bornes[k - 1]!;
    const t1 = bornes[k]!;
    if (t1 - t0 > PASSAGE_MOU + 1e-6 && (!pire || t1 - t0 > pire.t1 - pire.t0)) pire = { t0, t1 };
  }
  return pire ? { t0: arrondir(pire.t0), t1: arrondir(pire.t1), message: MESSAGE_RYTHME } : null;
}

/** Conseil si les 3 premières secondes n'ont ni texte, ni son, ni zoom ; sinon null. */
export function conseilAccroche(recette: Recette): string | null {
  if (recette.plans.length === 0) return null;
  const sc = compiler(recette);
  const tot = (t: Sec) => t < DUREE_ACCROCHE;
  const anime = recette.textes.some((x) => tot(x.t)) || sc.sons.some((s) => tot(s.t)) || sc.zooms.some((z) => tot(z.t));
  return anime ? null : MESSAGE_ACCROCHE;
}

/** Un pic sonore de la vidéo finale : temps de SORTIE et force (volume RMS du sommet, de 0 à 1). */
export interface PicSonore {
  t: Sec;
  force: number;
}

/**
 * « Trouver le moment fort » : le pic le PLUS FORT (pas le premier). À force égale, celui qui a le plus
 * de pics autour de lui (à ±0,75 s), puis le plus tôt. null s'il n'y a aucun pic.
 */
export function picLePlusFort(pics: readonly PicSonore[]): Sec | null {
  let meilleur: PicSonore | null = null;
  let voisinsMeilleur = -1;
  for (const p of pics) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.force)) continue;
    const voisins = pics.filter((u) => Math.abs(u.t - p.t) <= 0.75).length;
    const plusFort = !meilleur || p.force > meilleur.force + 1e-9;
    const egal = meilleur && Math.abs(p.force - meilleur.force) <= 1e-9;
    if (plusFort || (egal && (voisins > voisinsMeilleur || (voisins === voisinsMeilleur && p.t < meilleur!.t)))) {
      meilleur = p;
      voisinsMeilleur = voisins;
    }
  }
  return meilleur ? meilleur.t : null;
}
