// Parole AUDIBLE (intégrateur, PURE). Une « parole » bien plus faible que la parole habituelle de la session est un
// bruit lointain (le jeu resté ouvert, une télé, quelqu'un dans une autre pièce) : la VAD l'entend, Whisper y écrit des
// boucles inventées, et personne ne l'entendra dans la vidéo. Mesure : les 10 % les plus forts des trames de parole
// (segments de la VAD), dans la bande de la voix (empreintes) ou, sans elle, le volume du son.
// Vraie session (ses chiffres, aucun texte) : parole de la session −24,6 dB ; séquences de la main de −19,7 à −33,8 dB
// (9,2 dB sous la session au pire) ; la rafale de bruits après la fin AFK −43,7 dB (19 dB sous la session).

import type { Sec } from '../../recette/types';
import type { PlageTemps } from '../types';
import type { EnveloppeDb } from '../types-v3';

export const PAROLE_AUDIBLE = {
  /** Un passage dont la parole est à plus de `ecartDbMax` dB sous celle de la session n'est pas audible (≈ 5,6× moins fort). */
  ecartDbMax: 15,
  /** Centile des trames de parole qui sert de niveau (0,9 : les 10 % les plus forts). */
  centile: 0.9,
  /** Mots : la parole regardée autour de chaque mot (± s). */
  autourMot: 20,
  /** Séquences : il faut au moins tant de secondes de parole. */
  paroleMin: 2,
} as const;

/** Pas de l'histogramme des niveaux (dB) et bornes. */
const BIN = 0.5;
const BAS = -100;
const NB = Math.round(-BAS / BIN) + 1;
const bin = (db: number) => Math.max(0, Math.min(NB - 1, Math.round(((Number.isFinite(db) ? db : BAS) - BAS) / BIN)));
const valeur = (b: number) => BAS + b * BIN;

/** Les trames de `energie` qui tombent dans la parole (1 = parole). Segments triés. */
export function tramesDeParole(energie: EnveloppeDb, segments: readonly PlageTemps[]): Uint8Array {
  const n = energie.db.length;
  const parle = new Uint8Array(n);
  for (const s of segments) {
    const k1 = Math.min(n, Math.ceil(s.a / energie.pas - 1e-9));
    for (let k = Math.max(0, Math.floor(s.de / energie.pas + 1e-9)); k < k1; k++) parle[k] = 1;
  }
  return parle;
}

function centileHisto(h: Uint32Array, total: number, c: number): number {
  const rang = Math.floor(c * (total - 1));
  let cumul = 0;
  for (let b = 0; b < NB; b++) {
    cumul += h[b]!;
    if (cumul > rang) return valeur(b);
  }
  return valeur(NB - 1);
}

/** Niveau de la parole entre `de` et `a` (centile des trames de parole, dB) et sa durée (s) ; null sans parole. */
export function niveauParole(energie: EnveloppeDb, parle: Uint8Array, de: Sec = 0, a: Sec = Infinity, c: number = PAROLE_AUDIBLE.centile): { db: number; secondes: Sec } | null {
  const h = new Uint32Array(NB);
  let total = 0;
  const k1 = Math.min(parle.length, Math.ceil(a / energie.pas - 1e-9));
  for (let k = Math.max(0, Math.floor(de / energie.pas + 1e-9)); k < k1; k++) {
    if (!parle[k]) continue;
    h[bin(energie.db[k]!)]!++;
    total++;
  }
  return total > 0 ? { db: centileHisto(h, total, c), secondes: total * energie.pas } : null;
}

/**
 * Niveau de la parole autour de chaque seconde t (fenêtre [t − autour, t + 1 + autour[), NaN sans parole autour.
 * Histogramme glissant : linéaire en durée (une session de 3 h ≈ 0,1 s).
 */
export function niveauxAutour(energie: EnveloppeDb, parle: Uint8Array, autour: Sec = PAROLE_AUDIBLE.autourMot, c: number = PAROLE_AUDIBLE.centile): Float32Array {
  const n = parle.length;
  const secondes = Math.ceil(n * energie.pas);
  const res = new Float32Array(secondes).fill(Number.NaN);
  const h = new Uint32Array(NB);
  let total = 0;
  let k0 = 0;
  let k1 = 0;
  for (let t = 0; t < secondes; t++) {
    const fin = Math.min(n, Math.ceil((t + 1 + autour) / energie.pas - 1e-9));
    const debut = Math.max(0, Math.floor((t - autour) / energie.pas + 1e-9));
    for (; k1 < fin; k1++) {
      if (!parle[k1]) continue;
      h[bin(energie.db[k1]!)]!++;
      total++;
    }
    for (; k0 < debut; k0++) {
      if (!parle[k0]) continue;
      h[bin(energie.db[k0]!)]!--;
      total--;
    }
    if (total > 0) res[t] = centileHisto(h, total, c);
  }
  return res;
}

/** Le niveau de parole `db` est-il audible face à celui de la session (`reference`) ? */
export function estAudible(db: number, reference: number): boolean {
  return db >= reference - PAROLE_AUDIBLE.ecartDbMax;
}

/** Le volume du son (RMS linéaire, un pas) vu comme une enveloppe en dB : quand il n'y a pas la bande de la voix. */
export function enveloppeDbDuVolume(rms: Float32Array, pas: Sec): EnveloppeDb {
  const db = new Float32Array(rms.length);
  for (let k = 0; k < rms.length; k++) db[k] = rms[k]! > 0 ? 20 * Math.log10(rms[k]!) : BAS;
  return { pas, db };
}

/**
 * Le niveau du MÉLANGE des pistes (somme des puissances, trame par trame) : avec des pistes séparées, chacune ne porte
 * qu'une voix, et la parole de l'autre y serait « inaudible ». Une seule piste (ou le mélange) : elle-même.
 */
export function energieDuMelange(pistes: readonly EnveloppeDb[] | null | undefined): EnveloppeDb | null {
  if (!pistes || pistes.length <= 1) return pistes?.[0] ?? null;
  const pas = pistes[0]!.pas;
  const n = Math.max(...pistes.map((p) => p.db.length));
  const db = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let puissance = 0;
    for (const p of pistes) {
      const x = p.db[Math.min(p.db.length - 1, Math.round((k * pas) / p.pas))];
      if (x !== undefined && Number.isFinite(x)) puissance += 10 ** (x / 10);
    }
    db[k] = puissance > 0 ? Math.max(BAS, 10 * Math.log10(puissance)) : BAS;
  }
  return { pas, db };
}
