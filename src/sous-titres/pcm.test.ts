import { describe, expect, it } from 'vitest';
import { ajouterMono, dureeActive, moyenner, niveau, normaliserPieces, pointDeCoupe, versMono } from './pcm';

describe('ajouterMono + moyenner', () => {
  it('passe de 48 kHz à 16 kHz en moyennant 3 échantillons par case', () => {
    const somme = new Float32Array(4);
    const compte = new Uint16Array(4);
    const mono = Float32Array.from([0, 0.3, 0.6, 1, 1, 1, 0.5, 0.5, 0.5, 0, 0, 0]);
    ajouterMono(somme, compte, 0, mono, 0, 48000);
    expect(Array.from(moyenner(somme, compte)).map((x) => +x.toFixed(2))).toEqual([0.3, 1, 0.5, 0]);
  });
  it('place le son au bon temps et respecte les bornes', () => {
    const somme = new Float32Array(10);
    const compte = new Uint16Array(10);
    // Un son de 16 kHz qui commence 2 cases après le début du tampon, limité aux cases 0 à 5.
    ajouterMono(somme, compte, 1, new Float32Array(8).fill(1), 1 + 2 / 16000, 16000, 0, 5);
    expect(Array.from(moyenner(somme, compte))).toEqual([0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
  });
  it('comble les petites cases vides d\'un son sous 16 kHz', () => {
    const somme = new Float32Array(4);
    const compte = new Uint16Array(4);
    ajouterMono(somme, compte, 0, Float32Array.from([0.5, 0.5]), 0, 8000);
    expect(Array.from(moyenner(somme, compte))).toEqual([0.5, 0.5, 0.5, 0.5]);
  });
});

describe('versMono, niveau, pointDeCoupe', () => {
  it('mélange les canaux', () => {
    expect(Array.from(versMono([Float32Array.from([1, 0]), Float32Array.from([0, 0])]))).toEqual([0.5, 0]);
  });
  it('mesure le volume et trouve le silence le plus proche', () => {
    const pcm = new Float32Array(16000 * 3).fill(0.5);
    pcm.fill(0, 16000 * 1.2, 16000 * 1.4); // silence entre 1,2 s et 1,4 s
    expect(niveau(pcm, 0, 1)).toBeCloseTo(0.5);
    expect(niveau(pcm, 1.2, 1.4)).toBe(0);
    const coupe = pointDeCoupe(pcm, 0.5, 2.5);
    expect(coupe).toBeGreaterThanOrEqual(1.2);
    expect(coupe).toBeLessThanOrEqual(1.4);
  });
});

describe('normaliserPieces (gain avant Whisper, v4)', () => {
  const F = 16000;
  /** Sinus de 300 Hz d'amplitude `amp` sur [de, a[ s d'un tampon de `duree` s. */
  function sinus(duree: number, parts: [number, number, number][]): Float32Array {
    const pcm = new Float32Array(duree * F);
    for (const [de, a, amp] of parts) for (let i = de * F; i < a * F; i++) pcm[i] = amp * Math.sin((2 * Math.PI * 300 * i) / F);
    return pcm;
  }
  const rmsDb = (pcm: Float32Array, de: number, a: number) => 20 * Math.log10(niveau(pcm, de, a));

  it('remonte une zone faible vers −20 dBFS sans toucher la voisine déjà forte', () => {
    // Zone 1 : −40 dBFS (Romain) ; zone 2 : −17 dBFS (Guts) ; 0,2 s de blanc entre les deux.
    const pcm = sinus(4.2, [[0, 2, 0.01 * Math.SQRT2], [2.2, 4.2, 0.1414 * Math.SQRT2]]);
    const gains = normaliserPieces(pcm, [{ decalage: 0, de: 10, a: 12 }, { decalage: 2.2, de: 30, a: 32 }]);
    expect(gains[0]).toBeCloseTo(20, 0);
    expect(gains[1]).toBe(0);
    expect(rmsDb(pcm, 0, 2)).toBeCloseTo(-20, 0);
    expect(rmsDb(pcm, 2.2, 4.2)).toBeCloseTo(-17, 0);
  });
  it('+24 dB au plus, et jamais d’écrêtage', () => {
    const tresFaible = sinus(1, [[0, 1, 0.002]]); // ≈ −57 dBFS : il faudrait +37 dB
    expect(normaliserPieces(tresFaible, [{ decalage: 0, de: 0, a: 1 }])[0]).toBeCloseTo(24, 0);
    // Un pic isolé à 0,5 dans une zone faible : le gain s'arrête avant 0,98.
    const pic = sinus(1, [[0, 1, 0.005]]);
    pic[8000] = 0.5;
    normaliserPieces(pic, [{ decalage: 0, de: 0, a: 1 }]);
    expect(Math.max(...Array.from(pic, Math.abs))).toBeLessThanOrEqual(0.98 + 1e-6);
  });
  it('laisse le silence numérique tel quel', () => {
    const vide = new Float32Array(F);
    expect(normaliserPieces(vide, [{ decalage: 0, de: 0, a: 1 }])).toEqual([0]);
    expect(dureeActive(vide)).toBe(0);
    expect(dureeActive(sinus(2, [[0.5, 1, 0.01]]))).toBeCloseTo(0.5, 1);
  });
});
