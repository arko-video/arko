// Mots de Whisper (dev-mots), fonctions PURES : boucles de répétition et piles d'hallucinations.
//
// Sur la vraie session (whisper-base timestamped, 0–3000 s) : ≈ 37 % des mots durent 0,02 s, empilés au même instant ;
// la plupart des piles sont une BOUCLE (une phrase de 5 à 12 mots répétée à l'identique 3 à 30 fois, que
// retirerRepetitions de sous-titres/nettoyage.ts ne voit pas : il s'arrête à 4 mots), le reste des mots dont Whisper a
// perdu le temps. Aucun texte n'est jamais changé : on garde, on déplace ou on retire des mots entiers.

import type { Mot, Sec } from '../../recette/types';
import { cle } from '../../sous-titres/nettoyage';

export const REGLAGES_PILES = {
  /** ≥ `min` mots dont les débuts tiennent en `fenetre` s = une pile. */
  fenetre: 0.05,
  min: 3,
  /** Un mot de `minuscule` s ou moins n'a pas de vrai temps (Whisper donne 0,02 s quand il a décroché). */
  minuscule: 0.03,
  /** Boucles : groupes de 2 à `groupeMax` mots ; ×3 pour les groupes de 2 à 4 mots, ×2 dès `groupeLong` mots. */
  groupeMax: 12,
  groupeLong: 5,
} as const;

/** Un mot sans vrai temps : très court, ou dans un paquet de ≥ 3 débuts à moins de 0,05 s. Mots triés par début. */
export function motsSansTemps(mots: readonly Mot[], r: typeof REGLAGES_PILES = REGLAGES_PILES): boolean[] {
  const n = mots.length;
  const sans = mots.map((m) => m[2] - m[1] <= r.minuscule + 1e-6);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && mots[j + 1]![1] - mots[i]![1] <= r.fenetre + 1e-6) j++;
    if (j - i + 1 >= r.min) for (let k = i; k <= j; k++) sans[k] = true;
    i = j > i ? j + 1 : i + 1;
  }
  return sans;
}

/** Les piles : suites d'au moins 3 mots consécutifs sans vrai temps. Rend [premier, dernier] (indices inclus). */
export function trouverPiles(mots: readonly Mot[], r: typeof REGLAGES_PILES = REGLAGES_PILES): [number, number][] {
  const sans = motsSansTemps(mots, r);
  const piles: [number, number][] = [];
  let k = 0;
  while (k < mots.length) {
    if (!sans[k]) {
      k++;
      continue;
    }
    let j = k;
    while (j + 1 < mots.length && sans[j + 1]) j++;
    if (j - k + 1 >= r.min) piles.push([k, j]);
    k = j + 1;
  }
  return piles;
}

function memeGroupe(cles: readonly string[], a: number, b: number, n: number): boolean {
  if (b + n > cles.length) return false;
  for (let k = 0; k < n; k++) if (cles[a + k] !== cles[b + k]) return false;
  return true;
}

/**
 * Boucles de répétition : un groupe de 2 à 12 mots répété à la suite (×3 jusqu'à 4 mots, ×2 au-delà) n'est gardé
 * qu'UNE fois (la 1ʳᵉ, qui a le plus souvent le vrai temps). Mots triés par début. Rend les indices retirés et le
 * nombre de boucles.
 */
export function boucles(mots: readonly Mot[], r: typeof REGLAGES_PILES = REGLAGES_PILES): { retires: Set<number>; boucles: number } {
  const cles = mots.map((m) => cle(m[0]));
  const retires = new Set<number>();
  let nb = 0;
  let i = 0;
  while (i < mots.length) {
    let saut = 0;
    for (let n = 2; n <= r.groupeMax && saut === 0; n++) {
      if (cles.slice(i, i + n).every((c) => c === '')) continue;
      let fois = 1;
      while (memeGroupe(cles, i, i + fois * n, n)) fois++;
      if (fois >= (n < r.groupeLong ? 3 : 2)) {
        for (let k = i + n; k < i + fois * n; k++) retires.add(k);
        saut = fois * n;
        nb++;
      }
    }
    i += saut > 0 ? saut : 1;
  }
  return { retires, boucles: nb };
}

/** Lettres d'un mot (au moins 1) : la part de temps qu'il prend quand on répartit une pile. */
export function lettres(m: Mot): number {
  return Math.max(1, m[0].replace(/[^\p{L}\p{N}]/gu, '').length);
}

/** Durée totale de plages (s). */
export function longueur(plages: readonly { de: Sec; a: Sec }[]): Sec {
  return plages.reduce((s, p) => s + Math.max(0, p.a - p.de), 0);
}
