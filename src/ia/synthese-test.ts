// Outils pour les tests : un signal fabriqué dont on CONNAÎT les moments forts.
// (Le nom ne finit pas par .test.ts : ce n'est pas un test, Vitest ne le lance pas seul.)

import type { Difference } from './images';
import { PAS_ENVELOPPE } from './signaux';

/** Petit générateur pseudo-aléatoire reproductible (mêmes nombres à chaque test). */
export function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Les moments connus du signal fabriqué (temps source, en secondes). */
export const CONNUS = {
  /** Gros bip après un long calme. */
  calmePic: 80,
  /** Rire de 2 s (rafales à 5 Hz). */
  rire: 200,
  /** Cri régulier de 1,5 s, avec un changement de scène. */
  cri: 300,
  /** Partie bruyante (jeu animé) à partir de 440 s… */
  bruyant: 440,
  /** …et un pic au milieu, SANS calme avant. */
  picSansCalme: 500,
};

/**
 * Enveloppe (volume toutes les 20 ms) de 10 min : bruit faible (≈ −40 dB) et les moments de CONNUS.
 * Renvoie aussi les différences d'images clés (une toutes les 2 s, changement de scène à 300 s).
 */
export function signalSynthetique(duree = 600): { enveloppe: Float32Array; diffs: Difference[]; pas: number; duree: number } {
  const pas = PAS_ENVELOPPE;
  const n = Math.round(duree / pas);
  const r = hasard(42);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * pas;
    let v = 0.01 * (1 + 0.3 * (r() - 0.5));
    if (t >= CONNUS.calmePic && t < CONNUS.calmePic + 0.3) v = 0.5;
    if (t >= CONNUS.rire && t < CONNUS.rire + 2) v = 0.15 * (0.55 + 0.45 * Math.sin(2 * Math.PI * 5 * (t - CONNUS.rire)));
    if (t >= CONNUS.cri && t < CONNUS.cri + 1.5) v = 0.4 * (1 + 0.05 * (r() - 0.5));
    if (t >= CONNUS.bruyant) v = 0.2 * (1 + 0.2 * (r() - 0.5));
    if (t >= CONNUS.picSansCalme && t < CONNUS.picSansCalme + 0.3) v = 0.8;
    env[i] = v;
  }
  const diffs: Difference[] = [];
  for (let t = 2; t < duree; t += 2) diffs.push({ t, d: t === CONNUS.cri ? 0.6 : 0.05 + 0.02 * r() });
  return { enveloppe: env, diffs, pas, duree };
}
