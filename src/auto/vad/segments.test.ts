// Tests des segments de parole (dev-vad) : probabilités FABRIQUÉES (jamais le modèle).
import { describe, expect, it } from 'vitest';
import type { ProbasVad } from '../types-v4';
import { dansLaParole, fusionnerPlages, paroleDepuisProbas, paroleDepuisZones, probaA, probaMax, REGLAGES_VAD, segmentA, segmentsDeProbas, zonesATranscrire } from './segments';

const PAS = 0.032;

/** Probabilités : `fond` partout, puis chaque [de, a, p] posé (temps en s). */
function probas(duree: number, morceaux: [number, number, number][], fond = 0.02): ProbasVad {
  const p = new Uint8Array(Math.ceil(duree / PAS)).fill(Math.round(fond * 255));
  for (const [de, a, q] of morceaux) for (let k = Math.round(de / PAS); k < Math.round(a / PAS); k++) p[k] = Math.round(q * 255);
  return { src: 's', pas: PAS, p, plages: [{ de: 0, a: duree }], modele: 'silero-vad-v5' };
}

const sans = { ...REGLAGES_VAD, marge: 0, margeAvant: 0, trouMax: 0 };

describe('segments de la VAD (algorithme de Silero + réglages mesurés)', () => {
  it('entrée à 0,5, sortie à 0,35 : 0,4 seul ne commence rien, 0,4 après 0,6 continue', () => {
    expect(segmentsDeProbas(probas(10, [[1, 3, 0.4]]), 10, sans)).toEqual([]);
    const s = segmentsDeProbas(probas(10, [[1, 2, 0.6], [2, 3, 0.4]]), 10, sans);
    expect(s.length).toBe(1);
    expect(s[0]!.de).toBeCloseTo(1, 1);
    expect(s[0]!.a).toBeCloseTo(3, 1);
    expect(s[0]!.p).toBeGreaterThan(0.4);
  });

  it('parole ≥ 0,25 s ; un creux de moins de 0,1 s sous 0,35 ne coupe pas', () => {
    expect(segmentsDeProbas(probas(5, [[1, 1.19, 0.9]]), 5, sans)).toEqual([]);
    expect(segmentsDeProbas(probas(5, [[1, 1.32, 0.9]]), 5, sans).length).toBe(1);
    const court = segmentsDeProbas(probas(5, [[1, 2, 0.9], [2.064, 3, 0.9]]), 5, sans);
    expect(court.length).toBe(1);
    const long = segmentsDeProbas(probas(5, [[1, 2, 0.9], [2.2, 3, 0.9]]), 5, sans);
    expect(long.length).toBe(2);
  });

  it('marges mesurées (0,2 s avant, 0,05 s après), bornées à la source ; trous < 0,3 s bouchés', () => {
    const s = segmentsDeProbas(probas(10, [[0.05, 1, 0.9], [4, 5, 0.9], [9.6, 10, 0.9]]), 10);
    expect(s[0]!.de).toBe(0);
    expect(s[1]!.de).toBeCloseTo(4 - 0.2, 2);
    expect(s[1]!.a).toBeCloseTo(5 + 0.05, 1);
    expect(s[2]!.a).toBe(10);
    // 0,4 s de silence entre deux phrases : avec les marges il reste 0,15 s < 0,3 → un seul segment.
    const u = segmentsDeProbas(probas(10, [[1, 2, 0.9], [2.4, 3, 0.9]]), 10);
    expect(u.length).toBe(1);
    // 1 s de silence : deux segments.
    expect(segmentsDeProbas(probas(10, [[1, 2, 0.9], [3, 4, 0.9]]), 10).length).toBe(2);
  });

  it('triés, sans chevauchement, temps arrondis au ms ; part de la source', () => {
    const v = probas(60, [[1, 3, 0.9], [10, 12, 0.8], [30, 31, 0.7], [30.5, 33, 0.95]]);
    const p = paroleDepuisProbas(v, 60);
    expect(p.methode).toBe('vad');
    expect(p.probas).toBe(v);
    for (let i = 1; i < p.segments.length; i++) expect(p.segments[i]!.de).toBeGreaterThanOrEqual(p.segments[i - 1]!.a);
    for (const s of p.segments) expect(Math.round(s.de * 1000) / 1000).toBe(s.de);
    const total = p.segments.reduce((t, s) => t + s.a - s.de, 0);
    expect(p.part).toBeCloseTo(total / 60, 6);
  });

  it('outils : probaA, probaMax, segmentA, dansLaParole', () => {
    const v = probas(10, [[2, 3, 0.8]]);
    expect(probaA(v, 2.5)).toBeCloseTo(0.8, 2);
    expect(probaA(v, -1)).toBe(0);
    expect(probaA(v, 99)).toBe(0);
    expect(probaMax(v, 0, 10)).toBeCloseTo(0.8, 2);
    expect(probaMax(v, 5, 6)).toBeCloseTo(0.02, 2);
    const p = paroleDepuisProbas(v, 10);
    expect(segmentA(p, 2.5)).toBe(0);
    expect(segmentA(p, 5)).toBe(-1);
    expect(dansLaParole(p, 1.9)).toBe(true); // dans la marge d'avant
    expect(dansLaParole(p, 4)).toBe(false);
  });

  it('zones de Whisper : segments + 0,3 s, trous < 1 s bouchés, dans la source', () => {
    const p = paroleDepuisZones('s', 20, [{ de: 0.1, a: 1 }, { de: 2, a: 3 }, { de: 10, a: 19.9 }], 'sans-modele');
    expect(zonesATranscrire(p, 20)).toEqual([{ de: 0, a: 3.3 }, { de: 9.7, a: 20 }]);
  });

  it('fusionnerPlages et paroleDepuisZones (zones dans le désordre, qui se touchent)', () => {
    expect(fusionnerPlages([{ de: 5, a: 6 }, { de: 1, a: 2 }, { de: 2.1, a: 3 }], 0.2)).toEqual([{ de: 1, a: 3 }, { de: 5, a: 6 }]);
    const p = paroleDepuisZones('s', 4, [{ de: 3, a: 9 }, { de: -1, a: 1 }], 'mots');
    expect(p.segments).toEqual([{ de: 0, a: 1, p: 1 }, { de: 3, a: 4, p: 1 }]);
    expect(p.methode).toBe('mots');
    expect(p.part).toBeCloseTo(0.5, 6);
  });
});
