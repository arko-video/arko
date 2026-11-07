// C. Derush (dev 1), fonctions PURES : compter ce qui rend un passage drôle ou fort, et le noter de 0 à 100.
// Utilisé par le derush du Best-of (derush.ts) ET par le monteur sans IA (ia/sans-ia.ts) : une seule notation.
// Contrat : conception/contrat-wankil.md §3.2.

import type { Mot, Sec, TourDeParole } from '../../recette/types';
import { estFort } from '../../sous-titres/nettoyage';
import { dureeApresCoupe, motsDans } from '../express/scenes';
import { estJuron } from '../habillage/jurons';
import type { PicSource, PlageTemps, SignauxSource } from '../types';
import type { IndicesScene } from '../types-v3';

/** Points par élément (la note se compte PAR MINUTE gardée, puis 100 × (1 − e^(−x / 25))). */
export const POIDS_DERUSH = {
  rires: 8,
  fousRires: 12,
  cris: 6,
  /** Pics comptés au plus 20 fois. */
  pics: 4,
  picsApresCalme: 10,
  jurons: 3,
  motsForts: 3,
  echanges: 2,
  reactions: 5,
  mots: 0.05,
} as const;

/** Bonus d'une scène « protégée » (fou rire, ou ≥ 6 échanges rapides par minute). */
export const BONUS_PROTEGEE = 15;
/** Deux tours de personnes différentes à moins de 1,5 s d'écart = un échange rapide. */
export const ECART_ECHANGE: Sec = 1.5;

/** Règles chiffrées des indices (secondes, dB). */
export const INDICES = {
  /** Fou rire : rire de force ≥ 0,7 ou de 3 s au moins. */
  fouRireForce: 0.7,
  fouRireDuree: 3,
  /** Réaction : rire ou cri qui commence dans les 3 s après un pic. */
  reaction: 3,
  /** Calme puis pic : 3 s (0,3 s laissées juste avant le pic) au moins 15 dB sous le sommet. */
  calme: 3,
  chuteCalme: 15,
  /** Échanges rapides par minute gardée pour protéger une scène. */
  echangesParMinute: 6,
} as const;

/** Un rire est-il un fou rire ? */
export function estFouRire(r: { de: Sec; a: Sec; force: number }): boolean {
  return r.force >= INDICES.fouRireForce || r.a - r.de >= INDICES.fouRireDuree - 1e-9;
}

/** Niveau (dB) lissé sur 100 ms autour de la case k. */
function dbLisse(rms: Float32Array, k: number): number {
  let s = 0;
  let n = 0;
  for (let j = Math.max(0, k - 2); j <= Math.min(rms.length - 1, k + 2); j++) {
    s += 20 * Math.log10(rms[j]! + 1e-12);
    n++;
  }
  return n > 0 ? s / n : -100;
}

/** Le pic arrive-t-il après un calme (comme ia/signaux.ts calmeAvant, sur l'enveloppe de la source) ? */
export function picApresCalme(s: SignauxSource, pic: PicSource): boolean {
  const fin = Math.round((pic.ts - 0.3) / s.pas);
  const debut = fin - Math.round(INDICES.calme / s.pas);
  if (debut < 0) return false;
  let max = -Infinity;
  for (let k = debut; k < fin; k++) max = Math.max(max, dbLisse(s.rms, k));
  return max <= pic.db - INDICES.chuteCalme;
}

/** Nombre d'échanges rapides (changements de personne en moins de `ecart` s) dans la plage. */
export function echangesRapides(paroles: readonly TourDeParole[], p: PlageTemps, ecart: Sec = ECART_ECHANGE): number {
  const tours = paroles.filter((t) => t.fin > p.de && t.ts < p.a).sort((x, y) => x.ts - y.ts || x.fin - y.fin);
  let n = 0;
  for (let i = 1; i < tours.length; i++) {
    const avant = tours[i - 1]!;
    const apres = tours[i]!;
    if (avant.p === apres.p) continue;
    if (apres.ts < p.de || apres.ts >= p.a) continue;
    if (apres.ts - avant.fin < ecart) n++;
  }
  return n;
}

/** Compte tout ce qui se passe dans la plage `p` (temps source). */
export function indicesScene(p: PlageTemps, mots: readonly Mot[], signaux: SignauxSource | null, paroles?: readonly TourDeParole[]): IndicesScene {
  const dans = (t: Sec) => t >= p.de && t < p.a;
  const ceux = motsDans(mots, p);
  const coupe = ceux.length > 0 ? dureeApresCoupe(ceux, signaux, p) : 0;
  const duree = Math.round((coupe > 0 ? coupe : p.a - p.de) * 100) / 100;
  const rires = signaux ? signaux.rires.filter((x) => dans(x.t)) : [];
  const cris = signaux ? signaux.cris.filter((x) => dans(x.t)) : [];
  const pics = signaux ? signaux.pics.filter((x) => dans(x.ts)) : [];
  const reagit = (pic: PicSource) =>
    [...(signaux?.rires ?? []), ...(signaux?.cris ?? [])].some((x) => x.de >= pic.ts - 1e-9 && x.de <= pic.ts + INDICES.reaction);
  return {
    duree,
    rires: rires.length,
    fousRires: rires.filter(estFouRire).length,
    cris: cris.length,
    pics: pics.length,
    picsApresCalme: signaux ? pics.filter((x) => picApresCalme(signaux, x)).length : 0,
    jurons: ceux.filter((m) => estJuron(m[0])).length,
    motsForts: ceux.filter((m) => m[3] === 1 || estFort(m[0])).length,
    echanges: paroles ? echangesRapides(paroles, p) : 0,
    reactions: pics.filter(reagit).length,
    mots: ceux.length,
  };
}

/** Minutes gardées (au moins 0,5 : une scène très courte n'explose pas la note). */
function minutes(ind: IndicesScene): number {
  return Math.max(0.5, ind.duree / 60);
}

/** true si la scène ne doit jamais être jetée pour sa longueur (fou rire, ou ≥ 6 échanges rapides par minute). */
export function estProtegee(ind: IndicesScene): boolean {
  return ind.fousRires > 0 || ind.echanges / minutes(ind) >= INDICES.echangesParMinute;
}

/** Note de 0 à 100 (par minute gardée, bonus si protégée). */
export function noterIndices(ind: IndicesScene): number {
  const P = POIDS_DERUSH;
  const points =
    ind.rires * P.rires +
    ind.fousRires * P.fousRires +
    ind.cris * P.cris +
    Math.min(ind.pics, 20) * P.pics +
    ind.picsApresCalme * P.picsApresCalme +
    ind.jurons * P.jurons +
    ind.motsForts * P.motsForts +
    ind.echanges * P.echanges +
    ind.reactions * P.reactions +
    ind.mots * P.mots;
  const note = Math.round(100 * (1 - Math.exp(-points / minutes(ind) / 25)));
  return Math.min(100, note + (estProtegee(ind) ? BONUS_PROTEGEE : 0));
}

function pluriel(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

/** « 2 fous rires · échanges rapides · 3 pics de son » (3 éléments au plus ; « De la parole » sinon). */
export function raisonIndices(ind: IndicesScene): string {
  const parts: string[] = [];
  if (ind.fousRires) parts.push(pluriel(ind.fousRires, 'fou rire', 'fous rires'));
  const rires = ind.rires - ind.fousRires;
  if (rires > 0) parts.push(pluriel(rires, 'rire', 'rires'));
  if (ind.echanges >= 2) parts.push('échanges rapides');
  if (ind.cris) parts.push(pluriel(ind.cris, 'cri', 'cris'));
  if (ind.picsApresCalme) parts.push(ind.picsApresCalme > 1 ? `${ind.picsApresCalme} fois calme puis gros pic` : 'calme puis gros pic');
  const autresPics = ind.pics - ind.picsApresCalme;
  if (autresPics > 0) parts.push(pluriel(autresPics, 'pic de son', 'pics de son'));
  if (ind.jurons) parts.push(pluriel(ind.jurons, 'juron', 'jurons'));
  if (ind.motsForts) parts.push(pluriel(ind.motsForts, 'mot fort', 'mots forts'));
  return parts.length > 0 ? parts.slice(0, 3).join(' · ') : 'De la parole';
}
