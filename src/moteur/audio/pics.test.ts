// Pics sonores : enveloppe RMS et détection (partie pure).
import { describe, expect, it } from 'vitest';
import { Enveloppe, trouverPics } from './pics-calcul';

/** Bruit de fond faible + claquements forts aux temps donnés (secondes). */
function sonAvecClaques(duree: number, claques: number[], f = 48000): Float32Array {
  const x = new Float32Array(Math.round(duree * f));
  let graine = 1;
  for (let k = 0; k < x.length; k++) {
    graine = (graine * 16807) % 2147483647;
    x[k] = ((graine / 2147483647) * 2 - 1) * 0.02;
  }
  for (const c of claques) for (let k = 0; k < 0.06 * f; k++) x[Math.round(c * f) + k] = Math.sin(k / 3) * 0.8 * (1 - k / (0.06 * f));
  return x;
}

describe('pics sonores', () => {
  it('enveloppe RMS au pas de 20 ms', () => {
    const env = new Enveloppe(10, 1);
    env.ajouter([new Float32Array(48000).fill(0.5)], 48000, 10);
    const v = env.valeurs();
    expect(v.length).toBe(50);
    expect(v[0]).toBeCloseTo(0.5, 5);
  });

  it('trouve les claquements, en temps de sortie, espacés d\'au moins 0,4 s', () => {
    const env = new Enveloppe(0, 10);
    env.ajouter([sonAvecClaques(10, [1, 1.15, 4, 7.5])], 48000, 0);
    // Plan [0 ; 10] placé à 5 s dans la vidéo finale, au ralenti 0,5 (une case = 0,04 s de sortie) :
    // les claques sortent à 7 ; 7,3 ; 13 et 20 s. 7 et 7,3 sont à moins de 0,4 s : un seul pic.
    const pics = trouverPics([{ t0: 5, pas: 0.04, valeurs: env.valeurs() }]);
    expect(pics.length).toBe(3);
    expect(pics[0]).toBeCloseTo(7, 0);
    expect(pics.slice(1).map(Math.round)).toEqual([13, 20]);
  });

  it('60 s de son : moins de 300 ms', () => {
    const son = sonAvecClaques(60, [5, 20, 40]);
    const debut = performance.now();
    const env = new Enveloppe(0, 60);
    env.ajouter([son, son], 48000, 0);
    const pics = trouverPics([{ t0: 0, pas: 0.02, valeurs: env.valeurs() }]);
    expect(performance.now() - debut).toBeLessThan(300);
    expect(pics.map(Math.round)).toEqual([5, 20, 40]);
  });

  it('rien dans un son régulier ou muet', () => {
    expect(trouverPics([{ t0: 0, pas: 0.02, valeurs: new Float32Array(500) }])).toEqual([]);
    expect(trouverPics([{ t0: 0, pas: 0.02, valeurs: new Float32Array(500).fill(0.3) }])).toEqual([]);
  });
});
