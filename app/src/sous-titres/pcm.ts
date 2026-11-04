// Fonctions pures sur le son : passage en mono 16 kHz, volume, point de coupe dans un silence.

import { FREQUENCE } from './config';

/**
 * Ajoute un morceau de son (déjà en mono) dans un tampon 16 kHz.
 * Chaque échantillon d'origine tombe dans la ou les cases 16 kHz qu'il couvre : on fait la somme,
 * puis `moyenner` divise par le nombre d'échantillons. Cette moyenne sert aussi de filtre (moins d'aigus parasites).
 * @param somme tampon de sortie (somme des échantillons)
 * @param compte nombre d'échantillons ajoutés dans chaque case
 * @param debutSortie temps (s) de la case 0 du tampon
 * @param mono échantillons d'origine
 * @param debutMono temps (s) du premier échantillon d'origine
 * @param frequence fréquence d'origine (Hz)
 * @param k0 première case autorisée, k1 case de fin (exclue) : le reste est ignoré
 */
export function ajouterMono(
  somme: Float32Array,
  compte: Uint16Array,
  debutSortie: number,
  mono: Float32Array,
  debutMono: number,
  frequence: number,
  k0 = 0,
  k1 = somme.length,
): void {
  const rapport = FREQUENCE / frequence;
  // Petit epsilon : 2/16000 s doit tomber dans la case 2, pas 1,9999…
  const decalage = (debutMono - debutSortie) * FREQUENCE + 1e-6;
  const fin = Math.min(k1, somme.length);
  for (let j = 0; j < mono.length; j++) {
    const debutCase = Math.floor(decalage + j * rapport);
    // Son d'origine sous 16 kHz : un échantillon couvre plusieurs cases.
    const finCase = Math.max(debutCase + 1, Math.floor(decalage + (j + 1) * rapport));
    for (let k = Math.max(debutCase, k0); k < Math.min(finCase, fin); k++) {
      somme[k]! += mono[j]!;
      compte[k]!++;
    }
  }
}

/** Divise chaque case par son nombre d'échantillons (une case vide = silence). */
export function moyenner(somme: Float32Array, compte: Uint16Array): Float32Array {
  for (let k = 0; k < somme.length; k++) {
    const n = compte[k]!;
    somme[k] = n > 0 ? somme[k]! / n : 0;
  }
  return somme;
}

/** Mélange les canaux d'un morceau en un seul (moyenne). */
export function versMono(canaux: Float32Array[]): Float32Array {
  if (canaux.length === 1) return canaux[0]!;
  const n = canaux[0]?.length ?? 0;
  const res = new Float32Array(n);
  for (const c of canaux) for (let i = 0; i < n; i++) res[i]! += c[i]!;
  for (let i = 0; i < n; i++) res[i]! /= canaux.length;
  return res;
}

/** Volume moyen (RMS, de 0 à 1) entre t0 et t1 secondes d'un tampon 16 kHz. */
export function niveau(pcm: Float32Array, t0: number, t1: number): number {
  const a = Math.max(0, Math.floor(t0 * FREQUENCE));
  const b = Math.min(pcm.length, Math.ceil(t1 * FREQUENCE));
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += pcm[i]! * pcm[i]!;
  return Math.sqrt(s / (b - a));
}

/**
 * Cherche le moment le plus calme entre t0 et t1 (secondes) d'un tampon 16 kHz, par pas de 50 ms.
 * Sert à couper une longue plage dans un silence plutôt qu'au milieu d'un mot.
 */
export function pointDeCoupe(pcm: Float32Array, t0: number, t1: number): number {
  const pas = 0.05;
  let meilleur = t1;
  let plusBas = Infinity;
  for (let t = t1 - pas; t >= t0; t -= pas) {
    const v = niveau(pcm, t, t + pas);
    // À volume égal, on garde la coupe la plus tardive (fenêtres plus longues).
    if (v < plusBas - 1e-6) {
      plusBas = v;
      meilleur = t + pas / 2;
    }
  }
  return meilleur;
}
