// Mesures de niveau d'un son : « sonie » simple (RMS sur la partie active) et crête vraie (sur-échantillonnée × 4).

import { FREQ } from './briques';

/** Fenêtres de 20 ms pour mesurer le niveau. */
const FENETRE = Math.round(0.02 * FREQ);
/** Une fenêtre compte comme « active » si elle est à moins de 20 dB de la plus forte (on ignore les silences et les queues). */
const PORTE_DB = 20;

/** RMS de la partie active du son (valeur linéaire, 1 = 0 dBFS). */
export function rmsActif(signal: Float32Array): number {
  const energies: number[] = [];
  for (let i = 0; i < signal.length; i += FENETRE) {
    let e = 0;
    const fin = Math.min(signal.length, i + FENETRE);
    for (let k = i; k < fin; k++) e += signal[k] * signal[k];
    energies.push(e / (fin - i));
  }
  const max = Math.max(0, ...energies);
  if (max === 0) return 0;
  const porte = max * Math.pow(10, -PORTE_DB / 10);
  const actives = energies.filter((e) => e >= porte);
  return Math.sqrt(actives.reduce((a, e) => a + e, 0) / actives.length);
}

// Noyau d'interpolation (sinc fenêtré, 8 échantillons de chaque côté) pour les 3 points entre deux échantillons.
const DEMI = 8;
const NOYAUX = [1, 2, 3].map((p) => {
  const noyau: number[] = [];
  for (let j = -DEMI + 1; j <= DEMI; j++) {
    const x = j - p / 4; // distance entre l'échantillon j et le point p/4
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const hann = 0.5 + 0.5 * Math.cos((Math.PI * x) / DEMI);
    noyau.push(sinc * hann);
  }
  return noyau;
});

/**
 * Crête vraie : la plus grande valeur du son, y compris ENTRE les échantillons (sur-échantillonnage × 4),
 * car un convertisseur ou un encodeur AAC peut dépasser la crête des échantillons.
 */
export function creteVraie(signal: Float32Array): number {
  let crete = 0;
  for (let i = 0; i < signal.length; i++) crete = Math.max(crete, Math.abs(signal[i]));
  const candidat = crete * 0.5; // un pic entre deux échantillons est forcément près d'échantillons déjà forts
  let vraie = crete;
  for (let i = 0; i < signal.length - 1; i++) {
    const a = Math.abs(signal[i]);
    const b = Math.abs(signal[i + 1]);
    if (a < candidat && b < candidat) continue;
    // On ne cherche qu'autour d'un sommet (là où l'onde fait demi-tour) : beaucoup plus rapide.
    const avant = i > 0 ? Math.abs(signal[i - 1]) : 0;
    const apres = i + 2 < signal.length ? Math.abs(signal[i + 2]) : 0;
    if (Math.max(a, b) < Math.max(avant, apres)) continue;
    for (const noyau of NOYAUX) {
      let v = 0;
      for (let j = -DEMI + 1; j <= DEMI; j++) {
        const k = i + j;
        if (k >= 0 && k < signal.length) v += signal[k] * noyau[j + DEMI - 1];
      }
      vraie = Math.max(vraie, Math.abs(v));
    }
  }
  return vraie;
}

/** Décibels (dBFS) d'une valeur linéaire. */
export function enDb(x: number): number {
  return 20 * Math.log10(Math.max(x, 1e-12));
}
