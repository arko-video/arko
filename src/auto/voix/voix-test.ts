// Outils pour les tests de « Qui parle » (dev 1) : des VOIX FABRIQUÉES (somme d'harmoniques d'une fondamentale qui
// varie, façonnées par des formants qui changent à chaque syllabe), du bruit de jeu, et la vérité (qui parle quand).
// (Le nom ne finit pas par .test.ts : Vitest ne le lance pas seul.)

import { hasard } from '../../ia/synthese-test';

export const FREQ_TEST = 16000;

/**
 * Une voix : fondamentale (Hz), facteur de ses formants (1 = voix grave « moyenne », 1,2 = plus aiguë) et pente du
 * spectre (amplitude de l'harmonique h en 1 / h^pente : grand = voix sombre, petit = voix claire, ou micro différent).
 */
export interface Timbre {
  f0: number;
  formants: number;
  pente: number;
}

export const VOIX_A: Timbre = { f0: 105, formants: 1, pente: 0.9 };
export const VOIX_B: Timbre = { f0: 215, formants: 1.18, pente: 0.45 };
/** Une 3ᵉ voix (qui parle v4 : trois personnes). */
export const VOIX_C: Timbre = { f0: 150, formants: 1.08, pente: 0.7 };

/** Un tour de la vérité : voix 0 ou 1, de `de` à `a` (s). */
export interface TourVrai {
  v: 0 | 1;
  de: number;
  a: number;
}

/** Un tour de la vérité avec trois personnes (voix 0, 1 ou 2). */
export interface TourVrai3 {
  v: 0 | 1 | 2;
  de: number;
  a: number;
}

/** Tours de 3 personnes à tour de rôle (0, 1, 2, 0…), 2 à 4 s, 0,4 à 1 s de silence entre deux. */
export function toursATrois(duree: number, graine = 4): TourVrai3[] {
  const r = hasard(graine);
  const res: TourVrai3[] = [];
  let t = 0.5;
  let v: 0 | 1 | 2 = 0;
  while (t < duree - 2) {
    const a = Math.min(duree - 0.5, t + 2 + 2 * r());
    res.push({ v, de: Math.round(t * 100) / 100, a: Math.round(a * 100) / 100 });
    t = a + 0.4 + 0.6 * r();
    v = ((v + 1) % 3) as 0 | 1 | 2;
  }
  return res;
}

/** Tours qui alternent (2 à 4 s, 0,4 à 1 s de silence entre deux) sur `duree` s ; `seule` = toujours la voix 0. */
export function toursAlternes(duree: number, graine = 3, seule = false): TourVrai[] {
  const r = hasard(graine);
  const res: TourVrai[] = [];
  let t = 0.5;
  let v: 0 | 1 = 0;
  while (t < duree - 2) {
    const a = Math.min(duree - 0.5, t + 2 + 2 * r());
    res.push({ v, de: Math.round(t * 100) / 100, a: Math.round(a * 100) / 100 });
    t = a + 0.4 + 0.6 * r();
    if (!seule) v = v === 0 ? 1 : 0;
  }
  return res;
}

/** Gain d'un formant (résonance simple) à la fréquence f. */
function gainFormants(f: number, F: readonly number[]): number {
  let g = 0;
  for (const fc of F) {
    const b = 60 + fc / 12;
    g += 1 / (1 + ((f - fc) / b) ** 2);
  }
  return g;
}

/** Son mono (16 kHz) d'une voix sur ses tours, RMS de parole ≈ `db` dBFS. */
export function fabriquerVoix(timbre: Timbre, tours: readonly { de: number; a: number }[], duree: number, db: number, graine = 1): Float32Array {
  const r = hasard(graine);
  const n = Math.round(duree * FREQ_TEST);
  const x = new Float32Array(n);
  let s2 = 0;
  let parle = 0;
  for (const t of tours) {
    const syllabe = 0.18;
    for (let s0 = t.de; s0 < t.a; s0 += syllabe) {
      // Une voyelle au hasard (F1 300–800, F2 900–2300, F3 2300–3000 Hz), à l'échelle de la voix.
      const voy = [300 + 500 * r(), 900 + 1400 * r(), 2300 + 700 * r()].map((f) => f * timbre.formants);
      const f0 = timbre.f0 * (0.9 + 0.2 * r());
      const harm: [number, number][] = [];
      for (let h = 1; h * f0 < 3800; h++) harm.push([h * f0, gainFormants(h * f0, voy) / h ** timbre.pente]);
      const i0 = Math.round(s0 * FREQ_TEST);
      const i1 = Math.min(n, Math.round(Math.min(t.a, s0 + syllabe) * FREQ_TEST));
      for (let i = i0; i < i1; i++) {
        const u = (i - i0) / Math.max(1, i1 - i0);
        const env = Math.sin(Math.PI * u) ** 0.6;
        const temps = i / FREQ_TEST;
        let v = 0;
        for (const [f, g] of harm) v += g * Math.sin(2 * Math.PI * f * temps);
        x[i] = v * env;
        s2 += x[i]! * x[i]!;
        parle++;
      }
    }
  }
  const gain = 10 ** (db / 20) / Math.sqrt(s2 / Math.max(1, parle));
  for (let i = 0; i < n; i++) x[i]! *= gain;
  return x;
}

/** Bruit de jeu (bruit filtré + petit bourdonnement), RMS ≈ `db` dBFS. */
export function bruitDeJeu(duree: number, db: number, graine = 9): Float32Array {
  const r = hasard(graine);
  const n = Math.round(duree * FREQ_TEST);
  const x = new Float32Array(n);
  let y = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    y = 0.9 * y + 0.1 * (r() * 2 - 1);
    x[i] = y + 0.3 * Math.sin((2 * Math.PI * 180 * i) / FREQ_TEST);
    s2 += x[i]! * x[i]!;
  }
  const gain = 10 ** (db / 20) / Math.sqrt(s2 / n);
  for (let i = 0; i < n; i++) x[i]! *= gain;
  return x;
}

export function mixer(...sons: Float32Array[]): Float32Array {
  const res = new Float32Array(sons[0]!.length);
  for (const s of sons) for (let i = 0; i < res.length; i++) res[i]! += s[i]!;
  return res;
}
