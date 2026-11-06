// A sans transcription : énergie de la bande voix (300–3400 Hz) et zones de voix, sur un signal fabriqué :
// bruit de jeu (souffle large bande, grondement grave, explosion) + voix synthétique (harmoniques 150 Hz → 3,4 kHz,
// modulées en syllabes de 4 Hz), ≈ 12 dB au-dessus du jeu dans la bande voix (une voix au micro dans OBS).

import { describe, expect, it } from 'vitest';
import { hasard } from '../../ia/synthese-test';
import type { PlageTemps } from '../types';
import { AccumulateurVoix, bruitDeFond, zonesDeVoix } from './voix';

const F = 16000;
const VOIX: PlageTemps[] = [
  { de: 5, a: 8 },
  { de: 18, a: 21.5 },
];

/** 30 s de « partie de jeu » : souffle −28 dBFS, grondement 60 Hz fort, explosion à 12 s ; voix aux moments VOIX. */
function partie(avecVoix = true): Float32Array {
  const n = 30 * F;
  const x = new Float32Array(n);
  const alea = hasard(7);
  for (let i = 0; i < n; i++) {
    const t = i / F;
    const souffle = (alea() * 2 - 1) * 0.07; // ≈ −28 dBFS
    const grondement = 0.25 * Math.sin(2 * Math.PI * 60 * t);
    let explosion = 0;
    if (t >= 12 && t < 12.4) explosion = (alea() * 2 - 1) * 0.5 * Math.exp(-(t - 12) * 8) * Math.sin(2 * Math.PI * 90 * t);
    let voix = 0;
    if (avecVoix && VOIX.some((v) => t >= v.de && t < v.a)) {
      const syllabes = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t);
      // Harmoniques de même force (formants aplatis) : ≈ −20 dBFS dans la bande voix, ~12 dB au-dessus du jeu.
      for (let h = 1; h * 150 < 3400; h++) voix += Math.sin(2 * Math.PI * 150 * h * t + h);
      voix *= 0.03 * syllabes;
    }
    x[i] = souffle + grondement + explosion + voix;
  }
  return x;
}

/** Donne le son par morceaux de 1 024 échantillons, comme le décodeur. */
function energie(x: Float32Array, frequence = F) {
  const acc = new AccumulateurVoix(x.length / frequence);
  for (let i = 0; i < x.length; i += 1024) acc.ajouter(x.subarray(i, i + 1024), frequence, i / frequence);
  return acc.resultat();
}

function couvert(zones: PlageTemps[], p: PlageTemps): number {
  return zones.reduce((s, z) => s + Math.max(0, Math.min(z.a, p.a) - Math.max(z.de, p.de)), 0);
}

describe('AccumulateurVoix', () => {
  it('une valeur toutes les 20 ms ; un sinus à 1 kHz passe, un sinus à 60 Hz est très atténué', () => {
    const n = 2 * F;
    const aigu = new Float32Array(n).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / F));
    const grave = new Float32Array(n).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 60 * i) / F));
    const ea = energie(aigu);
    const eg = energie(grave);
    expect(ea.db.length).toBe(100);
    expect(ea.pas).toBe(0.02);
    expect(ea.db[50]!).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 0); // ≈ −9 dBFS
    expect(eg.db[50]!).toBeLessThan(ea.db[50]! - 40);
  });

  it('même résultat à 48 kHz et à 16 kHz (à 1 dB près)', () => {
    const f48 = new Float32Array(2 * 48000).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 800 * i) / 48000));
    const f16 = new Float32Array(2 * F).map((_, i) => 0.3 * Math.sin((2 * Math.PI * 800 * i) / F));
    expect(Math.abs(energie(f48, 48000).db[60]! - energie(f16).db[60]!)).toBeLessThan(1);
  });
});

describe('zonesDeVoix : voix synthétique + bruit de jeu', () => {
  const zones = zonesDeVoix(energie(partie()));

  it('trouve chaque passage de voix (au moins 90 % couvert, début à ±0,3 s)', () => {
    for (const v of VOIX) {
      expect(couvert(zones, v) / (v.a - v.de)).toBeGreaterThan(0.9);
      const z = zones.find((x) => x.a > v.de && x.de < v.a)!;
      expect(Math.abs(z.de - v.de)).toBeLessThanOrEqual(0.3);
    }
  });

  it('ne prend presque rien du bruit de jeu hors voix (< 1 s en tout)', () => {
    const total = zones.reduce((s, z) => s + z.a - z.de, 0);
    const voix = VOIX.reduce((s, v) => s + couvert(zones, v), 0);
    expect(total - voix).toBeLessThan(1);
  });

  it('sans voix : (presque) aucune zone', () => {
    const z = zonesDeVoix(energie(partie(false)));
    expect(z.reduce((s, x) => s + x.a - x.de, 0)).toBeLessThan(1);
  });

  it('le seuil suit le bruit de fond : une marge énorme ne garde rien', () => {
    expect(zonesDeVoix(energie(partie()), { margeDb: 60 })).toEqual([]);
  });

  it('bruitDeFond : le 10ᵉ percentile glissant suit un fond qui monte', () => {
    const db = new Float32Array(3000).map((_, k) => (k < 1500 ? -50 : -30));
    const fond = bruitDeFond(db, 0.02, 10);
    expect(fond[200]!).toBeCloseTo(-50, 0);
    expect(fond[2900]!).toBeCloseTo(-30, 0);
  });
});
