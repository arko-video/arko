// Détection des rires (heuristique, fonction PURE) : un rire, ce sont des rafales « ha-ha-ha »
// d'environ 4 à 6 par seconde. On les cherche dans le SPECTRE de l'enveloppe (le volume toutes les 20 ms) :
// si la plus grande part de ses variations tombe entre 4 et 6 Hz, c'est probablement un rire.
// Ce n'est pas parfait (une parole très rythmée peut y ressembler), d'où le mot « heuristique ».

import type { Sec } from '../recette/types';
import type { Fond, Plage } from './signaux';

export interface OptionsRires {
  /** Durée d'une fenêtre d'analyse (s). */
  fenetre?: Sec;
  /** Décalage entre deux fenêtres (s). */
  saut?: Sec;
  /** Part minimale des variations entre 4 et 6 Hz. */
  partMin?: number;
  /** Profondeur minimale des rafales (écart type / moyenne du volume). */
  profondeurMin?: number;
  /** De combien de dB la fenêtre doit dépasser le niveau habituel. */
  auDessus?: number;
}

/** Fréquences de modulation examinées (Hz) : de 1 à 12 par demi-hertz. */
const FREQUENCES: number[] = Array.from({ length: 23 }, (_, k) => 1 + k * 0.5);

/**
 * Part des variations de `x[a..a+n[` qui tombe entre `fMin` et `fMax` Hz (0 à 1).
 * Calcul direct (transformée de Fourier aux seules fréquences utiles), avec une fenêtre de Hann.
 */
export function partDansBande(x: Float32Array, a: number, n: number, pas: Sec, fMin = 4, fMax = 6): number {
  const t = tables(n, pas);
  let m = 0;
  for (let k = 0; k < n; k++) m += x[a + k]!;
  m /= n;
  const v = new Float64Array(n);
  for (let k = 0; k < n; k++) v[k] = (x[a + k]! - m) * t.hann[k]!;
  let bande = 0;
  let total = 0;
  FREQUENCES.forEach((f, i) => {
    const cos = t.cos[i]!;
    const sin = t.sin[i]!;
    let re = 0;
    let im = 0;
    for (let k = 0; k < n; k++) {
      re += v[k]! * cos[k]!;
      im -= v[k]! * sin[k]!;
    }
    const p = re * re + im * im;
    total += p;
    if (f >= fMin && f <= fMax) bande += p;
  });
  return total > 0 ? bande / total : 0;
}

/** Tables de cosinus, sinus et fenêtre de Hann, calculées une seule fois par taille de fenêtre. */
interface Tables {
  hann: Float64Array;
  cos: Float64Array[];
  sin: Float64Array[];
}
const tablesEnCache = new Map<string, Tables>();
function tables(n: number, pas: Sec): Tables {
  const cle = `${n}:${pas}`;
  const deja = tablesEnCache.get(cle);
  if (deja) return deja;
  const hann = new Float64Array(n);
  for (let k = 0; k < n; k++) hann[k] = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (n - 1));
  const cos = FREQUENCES.map((f) => Float64Array.from({ length: n }, (_, k) => Math.cos(2 * Math.PI * f * pas * k)));
  const sin = FREQUENCES.map((f) => Float64Array.from({ length: n }, (_, k) => Math.sin(2 * Math.PI * f * pas * k)));
  const res = { hann, cos, sin };
  tablesEnCache.set(cle, res);
  return res;
}

/**
 * Rires : fenêtres de 1,28 s (tous les 0,2 s) assez fortes, bien « hachées », et dont les variations
 * sont surtout entre 4 et 6 Hz. Les fenêtres retenues qui se suivent forment une plage ;
 * on garde les plages de 0,5 à 3,5 s (un rire de 0,5 à 3 s, plus la marge de la fenêtre).
 */
export function detecterRires(env: Float32Array, db: Float32Array, fond: Fond, pas: Sec, o: OptionsRires = {}): Plage[] {
  const n = Math.round((o.fenetre ?? 1.28) / pas);
  const saut = Math.max(1, Math.round((o.saut ?? 0.2) / pas));
  const partMin = o.partMin ?? 0.45;
  const profondeurMin = o.profondeurMin ?? 0.25;
  const auDessus = o.auDessus ?? 6;
  const marge = 0.4;
  const plages: Plage[] = [];
  let courante: Plage | null = null;
  const fermer = () => {
    if (!courante) return;
    const d = courante.fin - courante.debut;
    if (d >= 0.5 && d <= 3.5) plages.push(courante);
    courante = null;
  };
  for (let a = 0; a + n <= env.length; a += saut) {
    // 1. Assez fort par rapport à d'habitude ?
    let s = 0;
    let s2 = 0;
    let sdb = 0;
    for (let k = a; k < a + n; k++) {
      s += env[k]!;
      s2 += env[k]! * env[k]!;
      sdb += db[k]!;
    }
    const m = s / n;
    const fort = sdb / n - fond.moyenne[a]! >= auDessus;
    const profondeur = m > 0 ? Math.sqrt(Math.max(0, s2 / n - m * m)) / m : 0;
    let part = 0;
    if (fort && profondeur >= profondeurMin) part = partDansBande(env, a, n, pas);
    const centre = (a + n / 2) * pas;
    if (part >= partMin) {
      const force = Math.min(1, part);
      if (courante && centre - marge <= courante.fin + 1e-9) {
        courante.fin = centre + marge;
        if (force > courante.force) {
          courante.force = force;
          courante.t = centre;
        }
      } else {
        fermer();
        courante = { debut: Math.max(0, centre - marge), fin: centre + marge, t: centre, force };
      }
    } else if (courante && centre - marge > courante.fin) {
      fermer();
    }
  }
  fermer();
  return plages;
}
