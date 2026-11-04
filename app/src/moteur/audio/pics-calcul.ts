// Pics sonores (partie pure, testable) : enveloppe RMS au pas de 20 ms, puis maxima locaux
// au-dessus d'un seuil adaptatif (médiane + 2,5 × écart-type), espacés d'au moins 0,4 s.

import type { PicSonore } from '../../recette/rythme';
import { arrondir } from '../../recette/temps';
import type { Sec } from '../../recette/types';

/** Pas de l'enveloppe (secondes de SOURCE). */
export const PAS_ENVELOPPE: Sec = 0.02;
export const REGLAGES_PICS = { ecarts: 2.5, espacement: 0.4, plancher: 0.01 };

/** Accumulateur d'enveloppe : on y verse des échantillons au fil du décodage, sans tout garder en mémoire. */
export class Enveloppe {
  private readonly sommes: Float64Array;
  private readonly nombres: Uint32Array;

  constructor(
    /** Temps source du début de l'enveloppe. */
    readonly debut: Sec,
    duree: Sec,
    readonly pas: Sec = PAS_ENVELOPPE,
  ) {
    const n = Math.max(1, Math.ceil(duree / pas - 1e-9));
    this.sommes = new Float64Array(n);
    this.nombres = new Uint32Array(n);
  }

  /** Ajoute `n` échantillons de PCM (canaux séparés) qui commencent au temps source `ts`. */
  ajouter(canaux: readonly Float32Array[], frequence: number, ts: Sec, n = canaux[0]?.length ?? 0) {
    const nb = canaux.length;
    const parCase = this.pas * frequence;
    const decalage = (ts - this.debut) * frequence;
    let k = 0;
    // On avance case par case (plus rapide qu'un calcul de case pour chaque échantillon).
    while (k < n) {
      const c = Math.floor((decalage + k) / parCase);
      const finCase = Math.min(n, Math.max(k + 1, Math.ceil((c + 1) * parCase - decalage)));
      if (c >= 0 && c < this.sommes.length) {
        let somme = 0;
        for (let i = k; i < finCase; i++) {
          let x = 0;
          for (let j = 0; j < nb; j++) x += canaux[j]![i]!;
          x /= nb;
          somme += x * x;
        }
        this.sommes[c]! += somme;
        this.nombres[c]! += finCase - k;
      }
      k = finCase;
    }
  }

  /** Valeurs RMS par case de `pas` secondes (0 là où il n'y a pas de son). */
  valeurs(): Float32Array {
    const res = new Float32Array(this.sommes.length);
    for (let c = 0; c < res.length; c++) res[c] = this.nombres[c]! > 0 ? Math.sqrt(this.sommes[c]! / this.nombres[c]!) : 0;
    return res;
  }
}

/** Enveloppe d'un plan placée sur la vidéo finale : la case k est au temps de sortie t0 + (k + 0,5) × pas. */
export interface EnveloppePlacee {
  t0: Sec;
  /** Durée d'une case dans la vidéo finale (= 0,02 / vit). */
  pas: Sec;
  valeurs: Float32Array;
}

function mediane(v: number[]): number {
  if (v.length === 0) return 0;
  const tri = [...v].sort((a, b) => a - b);
  const m = tri.length >> 1;
  return tri.length % 2 ? tri[m]! : (tri[m - 1]! + tri[m]!) / 2;
}

/** Pics (temps de sortie, triés, au 1/100) de plusieurs enveloppes placées, avec un seuil commun. */
export function trouverPics(enveloppes: readonly EnveloppePlacee[], reglages = REGLAGES_PICS): Sec[] {
  return trouverPicsForts(enveloppes, reglages).map((p) => p.t);
}

/** Comme trouverPics, avec la FORCE de chaque pic (volume RMS du sommet, de 0 à 1). Triés par temps. */
export function trouverPicsForts(enveloppes: readonly EnveloppePlacee[], reglages = REGLAGES_PICS): PicSonore[] {
  const toutes: number[] = [];
  for (const e of enveloppes) for (const x of e.valeurs) toutes.push(x);
  if (toutes.length < 3) return [];
  const med = mediane(toutes);
  const moyenne = toutes.reduce((a, x) => a + x, 0) / toutes.length;
  const ecart = Math.sqrt(toutes.reduce((a, x) => a + (x - moyenne) ** 2, 0) / toutes.length);
  const seuil = Math.max(med + reglages.ecarts * ecart, reglages.plancher);
  // 1. Candidats : maxima locaux au-dessus du seuil.
  const candidats: { t: Sec; v: number }[] = [];
  for (const e of enveloppes) {
    const v = e.valeurs;
    for (let k = 0; k < v.length; k++) {
      const x = v[k]!;
      // Maximum local strict à gauche, au-dessus (strictement) du seuil.
      if (x <= seuil) continue;
      if ((k > 0 && v[k - 1]! >= x) || (k < v.length - 1 && v[k + 1]! > x)) continue;
      candidats.push({ t: e.t0 + (k + 0.5) * e.pas, v: x });
    }
  }
  // 2. Les plus forts d'abord ; un pic trop proche d'un pic déjà gardé est ignoré.
  candidats.sort((a, b) => b.v - a.v);
  const gardes: { t: Sec; v: number }[] = [];
  for (const c of candidats) {
    if (gardes.every((g) => Math.abs(g.t - c.t) >= reglages.espacement - 1e-9)) gardes.push(c);
  }
  return gardes.sort((a, b) => a.t - b.t).map((g) => ({ t: arrondir(g.t), force: Math.round(g.v * 10000) / 10000 }));
}
