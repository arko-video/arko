// Coupes v4 (dev-coupes), fonctions PURES : OÙ poser une coupe. On ne coupe JAMAIS là où la VAD entend la voix
// (p ≥ seuil) ; on glisse la coupe vers la trame de 20 ms la plus calme (énergie de la bande voix) à ± `fenetre` s ;
// si la voix continue au-delà de la marge, on prolonge (borné). Sans VAD, les segments de parole servent de masque.

import type { Sec } from '../../recette/types';
import type { EnveloppeDb } from '../types-v3';
import type { ParoleDetectee } from '../types-v4';

/** Pas des trames où l'on cherche le creux (s). */
export const PAS_CREUX: Sec = 0.02;
/** Une coupe ne s'approche jamais à moins de `GARDE_NOYAU` s de la parole qu'elle protège (mot ou segment). */
export const GARDE_NOYAU: Sec = 0.05;

/** Ce qu'on entend trame par trame (20 ms) : la voix (0 à 255) et le niveau de la bande voix (dB). */
export interface Ecoute {
  pas: Sec;
  /** Ce qu'on a vraiment mesuré : la VAD (sinon p vient des segments) et l'énergie (sinon db vaut −100). */
  avecVad: boolean;
  avecEnergie: boolean;
  /** Probabilité de parole × 255 de la trame k (la plus forte des cases de la VAD qu'elle touche). */
  p(k: number): number;
  /** Niveau de la bande voix (dB) de la trame k ; −100 sans mesure. */
  db(k: number): number;
}

/** Trames de 20 ms de la VAD (si elle est là), sinon des segments de parole ; énergie de la bande voix si elle est là. */
export function ecouteDe(parole: Pick<ParoleDetectee, 'segments' | 'probas'>, energie: EnveloppeDb | null): Ecoute {
  const pas = PAS_CREUX;
  const v = parole.probas;
  let p: (k: number) => number;
  if (v && v.p.length > 0) {
    p = (k) => {
      if (k < 0) return 0;
      const i0 = Math.floor((k * pas) / v.pas + 1e-9);
      const i1 = Math.floor(((k + 1) * pas - 1e-6) / v.pas);
      let m = 0;
      for (let i = i0; i <= i1 && i < v.p.length; i++) m = Math.max(m, v.p[i]!);
      return m;
    };
  } else {
    const s = parole.segments;
    p = (k) => {
      const t = (k + 0.5) * pas;
      let lo = 0;
      let hi = s.length - 1;
      while (lo <= hi) {
        const mi = (lo + hi) >> 1;
        if (s[mi]!.a <= t) lo = mi + 1;
        else if (s[mi]!.de > t) hi = mi - 1;
        else return 255;
      }
      return 0;
    };
  }
  const db = energie && energie.db.length > 0
    ? (k: number) => {
        const j = Math.floor(((k + 0.5) * pas) / energie.pas);
        const x = j >= 0 && j < energie.db.length ? energie.db[j]! : -100;
        return Number.isFinite(x) ? Math.max(-100, x) : -100;
      }
    : () => -100;
  return { pas, p, db, avecVad: !!(v && v.p.length > 0), avecEnergie: !!(energie && energie.db.length > 0) };
}

/** Un instant « s'entend » si la VAD y entend la voix, ou si le son dépasse PLANCHER_ACTIF ET le fond local + MARGE_ACTIF. */
export const PLANCHER_ACTIF = -55;
export const MARGE_ACTIF = 10;

/**
 * La partie de [de, a] où l'on entend quelque chose (voix selon la VAD, ou son ≥ max(−55 dBFS, fond local + 10 dB) ;
 * fond = 10ᵉ centile du niveau sur ± 5 s) : de la 1ʳᵉ à la dernière trame entendue. null si rien ne s'entend. Sans
 * VAD ni énergie, on ne sait pas : toute la plage.
 */
export function partieEntendue(ec: Ecoute, de: Sec, a: Sec, seuilParole: number): { de: Sec; a: Sec } | null {
  if (!ec.avecVad && !ec.avecEnergie) return { de, a };
  const pas = ec.pas;
  const k0 = Math.max(0, Math.floor(de / pas));
  const k1 = Math.max(k0, Math.ceil(a / pas) - 1);
  let fond = -100;
  if (ec.avecEnergie) {
    const n = Math.round(5 / pas);
    const v: number[] = [];
    for (let k = Math.max(0, k0 - n); k <= k1 + n; k++) v.push(ec.db(k));
    v.sort((x, y) => x - y);
    fond = v[Math.floor(0.1 * (v.length - 1))] ?? -100;
  }
  const seuilDb = Math.max(PLANCHER_ACTIF, fond + MARGE_ACTIF);
  const seuil = seuilParole * 255;
  let premier = -1;
  let dernier = -1;
  for (let k = k0; k <= k1; k++) {
    if (ec.p(k) >= seuil || (ec.avecEnergie && ec.db(k) >= seuilDb)) {
      if (premier < 0) premier = k;
      dernier = k;
    }
  }
  if (premier < 0) return null;
  return { de: Math.max(de, premier * pas), a: Math.min(a, (dernier + 1) * pas) };
}

export interface ReglagesCreux {
  /** Jamais de coupe sur une trame où p ≥ seuilParole (0 à 1). */
  seuilParole: number;
  /** Fenêtre de recherche du creux de chaque côté du point prévu (s). */
  fenetreCreux: Sec;
  /** Prolongement au plus, si la voix continue : avant le début, après la fin (s). */
  prolongerAvant: Sec;
  prolongerApres: Sec;
}

const trame = (t: Sec, pas: Sec) => Math.floor(t / pas + 1e-9);
const milieu = (k: number, pas: Sec) => (k + 0.5) * pas;

/**
 * Prolonge un bord tant que la VAD entend la voix (p ≥ seuil), de `prolongerApres` s au plus après une fin
 * (`prolongerAvant` avant un début). Rend le bord prolongé (inchangé si la voix ne continue pas).
 */
export function prolonger(ec: Ecoute, x: Sec, cote: 'debut' | 'fin', r: ReglagesCreux): Sec {
  const seuil = r.seuilParole * 255;
  const pas = ec.pas;
  if (cote === 'fin') {
    let k = trame(x, pas);
    if (ec.p(k) < seuil) return x;
    const kMax = trame(x + r.prolongerApres, pas);
    while (k <= kMax && ec.p(k) >= seuil) k++;
    return Math.min(x + r.prolongerApres, Math.max(x, k * pas));
  }
  let k = trame(x - 1e-6, pas);
  if (ec.p(k) < seuil) return x;
  const kMin = trame(x - r.prolongerAvant, pas);
  while (k > kMin && ec.p(k) >= seuil) k--;
  return Math.max(x - r.prolongerAvant, Math.min(x, (k + 1) * pas));
}

/**
 * Point de coupe d'un bord prévu en `x` : la trame la plus calme (niveau le plus bas, puis la plus proche de x) parmi
 * celles où la VAD n'entend pas de voix, entre x − fenêtre et x + fenêtre, sans entrer dans la parole protégée
 * (`borne` : jamais après elle pour un début, jamais avant elle pour une fin). Si toute la fenêtre est de la parole,
 * on cherche plus loin vers l'extérieur (prolongement) ; à défaut, la trame la moins « voix ». Rend le milieu de la
 * trame choisie.
 */
export function pointDeCoupe(ec: Ecoute, x: Sec, cote: 'debut' | 'fin', borne: Sec, r: ReglagesCreux): Sec {
  const pas = ec.pas;
  const seuil = r.seuilParole * 255;
  const f = r.fenetreCreux;
  let lo = x - f;
  let hi = x + f;
  if (cote === 'fin') lo = Math.max(lo, borne);
  else hi = Math.min(hi, borne);
  if (hi < lo) {
    // La marge est plus petite que la garde : on ne bouge que vers l'extérieur.
    if (cote === 'fin') lo = hi = Math.max(x, borne);
    else lo = hi = Math.min(x, borne);
  }
  const k0 = Math.ceil(lo / pas - 0.5 - 1e-9);
  const k1 = Math.floor(hi / pas - 0.5 + 1e-9);
  let choisi = -1;
  let meilleur = Infinity;
  let ecart = Infinity;
  for (let k = k0; k <= k1; k++) {
    if (ec.p(k) >= seuil) continue;
    const d = ec.db(k);
    const e = Math.abs(milieu(k, pas) - x);
    if (d < meilleur - 1e-6 || (Math.abs(d - meilleur) <= 1e-6 && e < ecart)) {
      choisi = k;
      meilleur = d;
      ecart = e;
    }
  }
  if (choisi >= 0) return milieu(choisi, pas);
  // Toute la fenêtre est de la parole : on prolonge vers l'extérieur jusqu'à la 1ʳᵉ trame sans voix.
  if (cote === 'fin') {
    const kMax = trame(hi + r.prolongerApres, pas);
    for (let k = k1 + 1; k <= kMax; k++) if (ec.p(k) < seuil) return milieu(k, pas);
  } else {
    const kMin = trame(lo - r.prolongerAvant, pas);
    for (let k = k0 - 1; k >= kMin; k--) if (ec.p(k) < seuil) return milieu(k, pas);
  }
  // Toujours de la voix : la trame la moins « voix » de toute la zone (puis la plus calme, puis la plus proche).
  const a0 = cote === 'fin' ? k0 : trame(lo - r.prolongerAvant, pas);
  const a1 = cote === 'fin' ? trame(hi + r.prolongerApres, pas) : k1;
  let pMin = Infinity;
  for (let k = a0; k <= a1; k++) {
    const pk = ec.p(k);
    const d = ec.db(k);
    const e = Math.abs(milieu(k, pas) - x);
    if (pk < pMin || (pk === pMin && (d < meilleur - 1e-6 || (Math.abs(d - meilleur) <= 1e-6 && e < ecart)))) {
      choisi = k;
      pMin = pk;
      meilleur = d;
      ecart = e;
    }
  }
  return choisi >= 0 ? milieu(choisi, pas) : x;
}

/** true si la VAD (ou les segments) entend la voix au temps t. */
export function voixA(ec: Ecoute, t: Sec, seuil: number): boolean {
  return ec.p(trame(t, ec.pas)) >= seuil * 255;
}
