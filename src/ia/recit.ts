// A. Monteur sans IA « bien meilleur » (dev 1), fonctions PURES : des clips COMPLETS qui racontent quelque chose.
// Mise en place avant le moment fort (5 à 15 s : début de la phrase ou de l'échange qui le précède), chute après
// (fin du rire / cri / réaction + 1 à 6 s), pas de doublons. Contrat : conception/contrat-wankil.md §3.1.

import { debutDePhrase, dernierCalme, finDePhrase, TROU_PHRASE } from '../auto/derush/contexte';
import type { SignauxSource } from '../auto/types';
import type { Mot, Sec } from '../recette/types';
import type { Evenements } from './candidats';
import type { Moment } from './moments';
import { picDe } from './mots-moments';

/** Règles chiffrées (secondes). */
export const RECIT = {
  /** Mise en place : au moins / au plus avant le pic. */
  miseEnPlaceMin: 5,
  miseEnPlaceMax: 15,
  /** Chute : après la fin de l'action (rire, cri, réaction). */
  chuteMin: 1,
  chuteMax: 6,
  /** Un silence plus long que ça entre deux mots coupe la mise en place (on ne remonte pas au-delà). */
  pauseMax: 2.5,
  /** Deux clips qui se recouvrent de plus de 30 % de la durée du plus court : on garde le mieux noté. */
  recouvrementMax: 0.3,
} as const;

/** Sans mots ni calme trouvé, la mise en place commence 8 s avant le pic. */
const AVANT_PAR_DEFAUT: Sec = 8;
/** Réaction : rire ou cri qui commence dans les 3 s après le pic. */
const REACTION: Sec = 3;

const arrondi = (x: number) => Math.round(x * 100) / 100;

/** Fin de l'action autour du pic : le cri qui le contient, le rire qui suit, ou la réaction (rire / cri ≤ 3 s après). */
export function finDeLAction(pic: Sec, ev: Evenements | null): Sec {
  if (!ev) return pic;
  let fin = pic;
  for (const p of ev.pics) if (Math.abs(p.t - pic) <= 1) fin = Math.max(fin, p.t + Math.max(0, p.iSommet - p.i) * 0.02);
  for (const c of ev.cris) if (c.fin >= pic - 1.5 && c.debut <= pic + REACTION) fin = Math.max(fin, c.fin);
  for (const r of ev.rires) if (r.fin >= pic - 1 && r.debut <= pic + REACTION) fin = Math.max(fin, r.fin);
  return fin;
}

/** Fin de la zone forte qui commence au pic (niveau ≥ sommet − 10 dB), 3 s au plus : la durée du « boum » lui-même. */
export function finDeZoneForte(s: SignauxSource, pic: Sec): Sec {
  const k0 = Math.max(0, Math.round(pic / s.pas));
  const k1 = Math.min(s.rms.length, k0 + Math.round(REACTION / s.pas));
  const db = (k: number) => 20 * Math.log10((s.rms[k] ?? 0) + 1e-12);
  let sommet = -Infinity;
  for (let k = k0; k < Math.min(k1, k0 + Math.round(0.5 / s.pas)); k++) sommet = Math.max(sommet, db(k));
  let k = k0;
  while (k < k1 && db(k) < sommet - 10) k++; // le pic est noté au DÉBUT de la montée
  while (k < k1 && db(k) >= sommet - 10) k++;
  return k * s.pas;
}

/**
 * Bornes « racontées » d'un moment (temps source) : début = début de la phrase ou de l'échange qui précède le pic,
 * entre `miseEnPlaceMin` et `miseEnPlaceMax` avant lui ; fin = fin de l'action + chute. Puis bornées à [dureeMin,
 * dureeMax] et à la source. `mots` (facultatifs) = mots transcrits autour du moment. `signaux` (facultatif) sert à
 * trouver le dernier calme quand il n'y a pas de mots.
 */
export function bornesRacontees(
  m: Moment,
  ev: Evenements | null,
  mots: readonly Mot[] | null,
  duree: Sec,
  o: { dureeMin?: Sec; dureeMax?: Sec; signaux?: SignauxSource | null } = {},
): { debut: Sec; fin: Sec } {
  const R = RECIT;
  const pic = picDe(m);
  const action = Math.max(finDeLAction(pic, ev), o.signaux ? finDeZoneForte(o.signaux, pic) : pic);
  // Mise en place.
  let debut: Sec | null = mots && mots.length > 0 ? debutDePhrase(mots, pic, R.miseEnPlaceMin, R.miseEnPlaceMax, R.pauseMax) : null;
  if (debut === null && o.signaux) debut = dernierCalme(o.signaux, pic, R.miseEnPlaceMin, R.miseEnPlaceMax);
  if (debut === null) debut = pic - AVANT_PAR_DEFAUT;
  // Chute : 1 s après l'action, jusqu'à la fin de la phrase en cours, 6 s au plus.
  let fin = action + R.chuteMin;
  if (mots && mots.length > 0) fin = Math.max(fin, finDePhrase(mots, fin, action + R.chuteMax));
  // Durée visée : trop long → la chute d'abord (jusqu'à 1 s), puis la mise en place (jusqu'à 5 s), puis la chute
  // jusqu'à la fin de l'action. Jamais le pic ni la réaction.
  const max = o.dureeMax ?? Infinity;
  const min = Math.min(o.dureeMin ?? 0, max);
  const exces = () => fin - debut! - max;
  if (exces() > 0) fin = Math.max(action + R.chuteMin, fin - exces());
  if (exces() > 0) debut = Math.min(pic - R.miseEnPlaceMin, debut + exces());
  if (exces() > 0) fin = Math.max(action, fin - exces());
  // Trop court → plus de chute (6 s), puis plus de contexte (jusqu'à 15 s avant, au début d'une phrase), puis la suite.
  const manque = () => min - (fin - debut!);
  if (manque() > 0) fin = Math.min(action + R.chuteMax, fin + manque());
  if (manque() > 0) {
    const vise = Math.max(pic - R.miseEnPlaceMax, debut - manque());
    // Au début de la phrase dite à ce moment-là, si elle commence encore dans les 15 s ; sinon pile au point visé.
    const phrase = mots && mots.length > 0 ? debutDePhrase(mots, vise, 0, R.miseEnPlaceMax, TROU_PHRASE) : null;
    debut = phrase !== null && phrase >= pic - R.miseEnPlaceMax ? phrase : vise;
  }
  if (manque() > 0) fin += manque();
  // Dans la source, en gardant la longueur.
  if (debut < 0) {
    fin = Math.min(duree, fin - debut);
    debut = 0;
  }
  if (fin > duree) {
    debut = Math.max(0, debut - (fin - duree));
    fin = duree;
  }
  return { debut: arrondi(debut), fin: arrondi(fin) };
}

/** Part de recouvrement de deux plages, rapportée à la plus courte (0 à 1). */
export function recouvrement(a: { debut: Sec; fin: Sec }, b: { debut: Sec; fin: Sec }): number {
  const commun = Math.min(a.fin, b.fin) - Math.max(a.debut, b.debut);
  const court = Math.min(a.fin - a.debut, b.fin - b.debut);
  return commun <= 0 || court <= 0 ? 0 : commun / court;
}

/** Retire les moments qui en recouvrent un mieux noté (> 30 % du plus court). Garde l'ordre d'entrée. */
export function dedoublonner(moments: readonly Moment[], recouvrementMax: number = RECIT.recouvrementMax): Moment[] {
  const ordre = moments.map((_, i) => i).sort((x, y) => moments[y]!.score - moments[x]!.score || x - y);
  const gardes: number[] = [];
  for (const i of ordre) {
    if (gardes.every((g) => recouvrement(moments[g]!, moments[i]!) <= recouvrementMax + 1e-9)) gardes.push(i);
  }
  return gardes.sort((x, y) => x - y).map((i) => moments[i]!);
}
