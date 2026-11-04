import { describe, expect, it } from 'vitest';
import { ajouterMono, moyenner, niveau, pointDeCoupe, versMono } from './pcm';

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
