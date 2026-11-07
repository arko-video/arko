// Qui parle v4 (dev-voix), fonctions PURES : les segments de parole (VAD) coupés en MORCEAUX de 1,5 s au plus.
// Un morceau est assez court pour ne contenir qu'une voix (deux personnes peuvent se suivre sans pause), assez long
// pour que son niveau (90ᵉ centile) ne dépende plus des syllabes. Contrat : CONTRAT.md §1.2.
//  - coupure au CREUX d'énergie (bande voix, 20 ms) le plus proche du point prévu ;
//  - un segment de moins de 0,3 s est collé au morceau voisin (à moins de 1 s), sinon gardé seul ;
//  - un morceau peut donc avoir plusieurs parties (`parties`) : jamais de temps hors des segments.

import type { Sec } from '../../recette/types';
import type { PlageTemps } from '../types';
import type { EnveloppeDb } from '../types-v3';

export const REGLAGES_MORCEAUX = {
  /** Longueur maximale d'un morceau (s). */
  max: 1.5,
  /** Un segment plus court est collé à son voisin (s). */
  min: 0.3,
  /** Le point de coupe glisse vers la trame la plus calme à ± fenetre s (sans dépasser `max`). */
  fenetre: 0.25,
  /** Un segment court n'est collé qu'à un voisin à moins de `collerMax` s. */
  collerMax: 1,
} as const;

export type ReglagesMorceaux = { -readonly [K in keyof typeof REGLAGES_MORCEAUX]: number };

/** Un morceau de parole : de `de` à `a` (temps source), fait de 1 partie ou plus (dans les segments). */
export interface MorceauParole extends PlageTemps {
  /** Parties dans les segments de parole (triées) ; la durée du morceau = somme des parties. */
  parties: PlageTemps[];
  /** Indice du (premier) segment d'où il vient. */
  seg: number;
}

/** Durée réelle d'un morceau (somme de ses parties). */
export function dureeMorceau(m: Pick<MorceauParole, 'parties'>): Sec {
  let d = 0;
  for (const p of m.parties) d += p.a - p.de;
  return d;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Énergie (dB) de la trame qui contient t (−100 hors de l'enveloppe). */
function dbA(e: EnveloppeDb | null, t: Sec): number {
  if (!e) return -100;
  const k = Math.floor(t / e.pas);
  return k >= 0 && k < e.db.length ? e.db[k]! : -100;
}

/**
 * Point de coupe : la trame la plus calme dans [ideal − fenetre, ideal + fenetre] ∩ [bas, haut] (à égalité, la plus
 * proche du point prévu). Sans énergie : le point prévu.
 */
function creux(e: EnveloppeDb | null, ideal: Sec, bas: Sec, haut: Sec, fenetre: Sec): Sec {
  if (!e) return ideal;
  const de = Math.max(bas, ideal - fenetre);
  const a = Math.min(haut, ideal + fenetre);
  if (a <= de) return Math.min(haut, Math.max(bas, ideal));
  let meilleur = ideal;
  let min = Infinity;
  for (let k = Math.ceil(de / e.pas - 0.5); (k + 0.5) * e.pas <= a + 1e-9; k++) {
    const t = (k + 0.5) * e.pas;
    if (t < de - 1e-9) continue;
    const v = dbA(e, t);
    if (v < min - 1e-9 || (Math.abs(v - min) <= 1e-9 && Math.abs(t - ideal) < Math.abs(meilleur - ideal))) {
      min = v;
      meilleur = t;
    }
  }
  return meilleur;
}

/** Coupe un segment en morceaux de `max` s au plus, au creux d'énergie le plus proche des points réguliers. */
function couperSegment(s: PlageTemps, e: EnveloppeDb | null, r: ReglagesMorceaux): PlageTemps[] {
  const res: PlageTemps[] = [];
  let t0 = s.de;
  while (s.a - t0 > r.max + 1e-9) {
    const reste = s.a - t0;
    const n = Math.ceil(reste / r.max - 1e-9);
    const ideal = t0 + reste / n;
    // Le morceau fait au moins la moitié de `max` et au plus `max` ; le reste aussi reste coupable.
    const bas = t0 + Math.max(r.min, r.max / 2);
    const haut = Math.min(t0 + r.max, s.a - r.min);
    const t = haut > bas ? creux(e, ideal, bas, haut, r.fenetre) : ideal;
    res.push({ de: t0, a: t });
    t0 = t;
  }
  res.push({ de: t0, a: s.a });
  return res;
}

/**
 * Les morceaux de parole de toute la source, triés. `segments` triés sans chevauchement (ParoleDetectee.segments) ;
 * `energie` = énergie de la bande voix (EmpreintesVoix de la piste principale), pour couper au creux.
 */
export function decouperEnMorceaux(segments: readonly PlageTemps[], energie: EnveloppeDb | null, o: Partial<ReglagesMorceaux> = {}): MorceauParole[] {
  const r: ReglagesMorceaux = { ...REGLAGES_MORCEAUX, ...o };
  const tries = segments.filter((s) => s.a > s.de).map((s, i) => ({ de: s.de, a: s.a, i })).sort((x, y) => x.de - y.de);
  const res: MorceauParole[] = [];
  /** Segments trop courts, à coller après coup. */
  const courts: { de: Sec; a: Sec; i: number }[] = [];
  for (const s of tries) {
    if (s.a - s.de < r.min) {
      courts.push(s);
      continue;
    }
    for (const p of couperSegment(s, energie, r)) res.push({ de: r3(p.de), a: r3(p.a), parties: [{ de: r3(p.de), a: r3(p.a) }], seg: s.i });
  }
  // Un segment court rejoint le morceau le plus proche (à moins de collerMax s), sinon il reste seul.
  for (const c of courts) {
    let j = -1;
    let ecart = Infinity;
    // Recherche dichotomique du premier morceau qui commence après c.
    let lo = 0;
    let hi = res.length;
    while (lo < hi) {
      const mi = (lo + hi) >> 1;
      if (res[mi]!.de < c.de) lo = mi + 1;
      else hi = mi;
    }
    for (const k of [lo - 1, lo]) {
      const m = res[k];
      if (!m) continue;
      const d = m.a <= c.de ? c.de - m.a : m.de >= c.a ? m.de - c.a : 0;
      if (d < ecart) {
        ecart = d;
        j = k;
      }
    }
    const partie = { de: r3(c.de), a: r3(c.a) };
    if (j >= 0 && ecart <= r.collerMax) {
      const m = res[j]!;
      m.parties.push(partie);
      m.parties.sort((x, y) => x.de - y.de);
      m.de = Math.min(m.de, partie.de);
      m.a = Math.max(m.a, partie.a);
    } else {
      res.splice(lo, 0, { de: partie.de, a: partie.a, parties: [partie], seg: c.i });
    }
  }
  return res.sort((x, y) => x.de - y.de || x.a - y.a);
}
