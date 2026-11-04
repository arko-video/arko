// Tests des temps forts sur des signaux fabriqués : clics à 120 BPM, avec ou sans bruit de fond.
import { describe, expect, it } from 'vitest';
import { detecterAttaques, DetecteurAttaques, ESPACEMENT_MIN_S } from './attaques';
import { mulberry32 } from './synthese/briques';
import { synthetiser } from './synthese';

/** Un clic toutes les 0,5 s (120 BPM) pendant `duree` s, plus un bruit de fond et une note tenue. */
function clics(frequence: number, duree: number, bruitFond: number, premier = 0.25): { signal: Float32Array; temps: number[] } {
  const signal = new Float32Array(Math.round(duree * frequence));
  const hasard = mulberry32(3);
  for (let i = 0; i < signal.length; i++) {
    signal[i] = (hasard() * 2 - 1) * bruitFond + 0.05 * Math.sin((2 * Math.PI * 220 * i) / frequence);
  }
  const temps: number[] = [];
  for (let t = premier; t < duree - 0.1; t += 0.5) {
    temps.push(t);
    const k0 = Math.round(t * frequence);
    for (let j = 0; j < Math.round(0.01 * frequence); j++) {
      signal[k0 + j] += 0.8 * Math.exp(-j / (0.002 * frequence)) * (hasard() * 2 - 1);
    }
  }
  return { signal, temps };
}

/** Part des temps attendus retrouvés à ±30 ms. */
function retrouves(attendus: number[], trouves: number[]): number {
  return attendus.filter((t) => trouves.some((x) => Math.abs(x - t) <= 0.03)).length / attendus.length;
}

describe('temps forts', () => {
  for (const frequence of [44100, 48000]) {
    it(`retrouve au moins 90 % des clics à 120 BPM (±30 ms) à ${frequence} Hz, sans fausse alerte`, () => {
      const { signal, temps } = clics(frequence, 20, 0.02);
      const trouves = detecterAttaques(signal, frequence);
      expect(retrouves(temps, trouves)).toBeGreaterThanOrEqual(0.9);
      expect(trouves.length).toBeLessThanOrEqual(Math.ceil(temps.length * 1.1));
    });
  }

  it('donne le même résultat en un seul morceau ou en petits morceaux (lecture au fil de l\'eau)', () => {
    const { signal } = clics(48000, 6, 0.01);
    const d = new DetecteurAttaques(48000);
    for (let i = 0; i < signal.length; i += 1000) d.ajouter(signal.subarray(i, i + 1000));
    expect(d.terminer()).toEqual(detecterAttaques(signal, 48000));
  });

  it('respecte l\'espacement minimal et ne trouve rien dans le silence', () => {
    expect(detecterAttaques(new Float32Array(48000), 48000)).toEqual([]);
    const { signal } = clics(48000, 10, 0.02);
    const t = detecterAttaques(signal, 48000);
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBeGreaterThanOrEqual(ESPACEMENT_MIN_S);
  });

  it('trouve les 6 battements du son « cœur »', () => {
    const coeur = synthetiser('tension.coeur')!;
    const attendus = [0, 0.2, 0.8, 1, 1.6, 1.8];
    expect(retrouves(attendus, detecterAttaques(coeur, 48000))).toBeGreaterThanOrEqual(5 / 6);
  });
});
