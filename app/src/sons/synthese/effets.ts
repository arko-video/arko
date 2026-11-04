// Effets de la synthèse : filtres biquad (avec balayage), distorsion douce, réverbération Freeverb, panoramique.
// JavaScript pur, sans Web Audio (utilisable dans la page et dans le Worker d'export).

import { FREQ, lire, type Valeur } from './briques';

export type TypeFiltre = 'passe-bas' | 'passe-haut' | 'passe-bande';

/** Tous les combien d'échantillons on recalcule un filtre qui balaie (16 = inaudible et rapide). */
const RECALCUL = 16;

/**
 * Filtre biquad (recettes classiques « Audio EQ Cookbook » de R. Bristow-Johnson).
 * `freq` peut être une courbe : le filtre balaie (ex. un whoosh qui monte).
 * `q` : 0,7 = doux ; plus grand = plus « pointu » autour de la fréquence.
 */
export function filtrer(signal: Float32Array, type: TypeFiltre, freq: Valeur, q = 0.707): Float32Array {
  const sortie = new Float32Array(signal.length);
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    if (i === 0 || (typeof freq !== 'number' && i % RECALCUL === 0)) {
      const f = Math.min(Math.max(lire(freq, i / FREQ), 10), FREQ * 0.45);
      const w = (2 * Math.PI * f) / FREQ;
      const cos = Math.cos(w);
      const alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha;
      if (type === 'passe-bas') {
        b0 = (1 - cos) / 2 / a0;
        b1 = (1 - cos) / a0;
        b2 = b0;
      } else if (type === 'passe-haut') {
        b0 = (1 + cos) / 2 / a0;
        b1 = -(1 + cos) / a0;
        b2 = b0;
      } else {
        b0 = alpha / a0;
        b1 = 0;
        b2 = -alpha / a0;
      }
      a1 = (-2 * cos) / a0;
      a2 = (1 - alpha) / a0;
    }
    const x = signal[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    sortie[i] = y;
  }
  return sortie;
}

/** Distorsion douce (tanh) : `force` 1 = presque rien, 5 = très saturé. Le niveau maximal reste 1. */
export function saturer(signal: Float32Array, force: number): Float32Array {
  const sortie = new Float32Array(signal.length);
  const norme = Math.tanh(force);
  for (let i = 0; i < signal.length; i++) sortie[i] = Math.tanh(signal[i] * force) / norme;
  return sortie;
}

export interface OptionsReverb {
  /** Taille de la pièce, de 0 (placard) à 1 (cathédrale). */
  taille?: number;
  /** Amorti des aigus dans la queue, de 0 (brillant) à 1 (sourd). */
  amorti?: number;
  /** Part de réverbération dans le résultat, de 0 à 1. */
  mix?: number;
}

// Longueurs des filtres de Freeverb (écrites pour 44,1 kHz, adaptées à 48 kHz).
const PEIGNES = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const PASSE_TOUT = [556, 441, 341, 225];

/**
 * Réverbération « Freeverb » simplifiée, en mono : 8 filtres en peigne en parallèle, puis 4 passe-tout en série.
 * Le résultat a la MÊME longueur que le signal : prévois de la place à la fin pour la queue.
 */
export function reverberation(signal: Float32Array, options: OptionsReverb = {}): Float32Array {
  const taille = options.taille ?? 0.7;
  const amorti = (options.amorti ?? 0.4) * 0.4;
  const mix = options.mix ?? 0.25;
  const retour = taille * 0.28 + 0.7;
  const echelle = FREQ / 44100;
  const humide = new Float32Array(signal.length);
  // 1. Les peignes : chacun renvoie un écho qui s'atténue, avec les aigus amortis.
  for (const longueur of PEIGNES) {
    const tampon = new Float32Array(Math.round(longueur * echelle));
    let pos = 0;
    let memoire = 0;
    for (let i = 0; i < signal.length; i++) {
      const sortiePeigne = tampon[pos];
      memoire = sortiePeigne * (1 - amorti) + memoire * amorti;
      tampon[pos] = signal[i] * 0.015 + memoire * retour;
      humide[i] += sortiePeigne;
      pos++;
      if (pos === tampon.length) pos = 0;
    }
  }
  // 2. Les passe-tout : ils « diffusent » les échos pour une queue lisse.
  for (const longueur of PASSE_TOUT) {
    const tampon = new Float32Array(Math.round(longueur * echelle));
    let pos = 0;
    for (let i = 0; i < humide.length; i++) {
      const lu = tampon[pos];
      const entree = humide[i];
      humide[i] = lu - entree;
      tampon[pos] = entree + lu * 0.5;
      pos++;
      if (pos === tampon.length) pos = 0;
    }
  }
  const sortie = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) sortie[i] = signal[i] * (1 - mix) + humide[i] * 3 * mix;
  return sortie;
}

/**
 * Panoramique : place un son mono entre gauche (−1) et droite (+1). 0 = au centre, sans perte de niveau.
 * `pan` peut être une courbe (un son qui passe de gauche à droite). Renvoie [gauche, droite].
 */
export function panoramique(mono: Float32Array, pan: Valeur): [Float32Array, Float32Array] {
  const gauche = new Float32Array(mono.length);
  const droite = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const p = Math.min(1, Math.max(-1, lire(pan, i / FREQ)));
    gauche[i] = mono[i] * (p > 0 ? 1 - p : 1);
    droite[i] = mono[i] * (p < 0 ? 1 + p : 1);
  }
  return [gauche, droite];
}
