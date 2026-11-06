// A. Couper les blancs : règles des morceaux (marges, fusion, sons forts, longueur minimale, muets, plage,
// Serré / Normal / Large), sur des mots et des signaux fabriqués.

import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import type { SignauxSource } from '../types';
import { morceauxDeParole, morceauxDeVoix, REGLAGES_BLANCS, sonsForts } from './blancs';

const N = REGLAGES_BLANCS.normal;

function mot(txt: string, ts: number, fin: number): Mot {
  return [txt, ts, fin];
}

/** Signaux fabriqués : fond à `fondDb` dBFS, rafales fortes [de, a, dB]. */
function signaux(duree: number, fondDb: number, rafales: [number, number, number][] = [], muets: { de: number; a: number }[] = []): SignauxSource {
  const pas = 0.02;
  const rms = new Float32Array(Math.round(duree / pas)).fill(10 ** (fondDb / 20));
  for (const [de, a, db] of rafales) for (let k = Math.round(de / pas); k < Math.round(a / pas); k++) rms[k] = 10 ** (db / 20);
  for (const m of muets) for (let k = Math.round(m.de / pas); k < Math.round(m.a / pas); k++) rms[k] = 0;
  return { src: 's1', duree, pas, rms, pics: [], cris: [], rires: [], muets };
}

describe('morceauxDeParole — réglage Normal (vérifié sur une vraie session)', () => {
  it('chaque mot garde 0,25 s avant et 0,35 s après (au centième)', () => {
    expect(morceauxDeParole([mot('salut', 10, 10.4)], null, N)).toEqual([{ de: 9.75, a: 10.75, raison: 'parole' }]);
  });

  it('fusionne deux morceaux séparés de moins de 0,5 s, pas au-delà', () => {
    // 1,2 + 0,35 = 1,55 ; 2,29 − 0,25 = 2,04 : écart 0,49 → fusion.
    expect(morceauxDeParole([mot('a', 1, 1.2), mot('b', 2.29, 2.5)], null, N)).toEqual([{ de: 0.75, a: 2.85, raison: 'parole' }]);
    // 2,31 − 0,25 = 2,06 : écart 0,51 → deux morceaux.
    expect(morceauxDeParole([mot('a', 1, 1.2), mot('b', 2.31, 2.5)], null, N)).toEqual([
      { de: 0.75, a: 1.55, raison: 'parole' },
      { de: 2.06, a: 2.85, raison: 'parole' },
    ]);
  });

  it('mots qui se chevauchent avec leurs marges : un seul morceau, trié', () => {
    const r = morceauxDeParole([mot('c', 5, 5.4), mot('a', 1, 1.5), mot('b', 1.9, 2.2)], null, N);
    expect(r).toEqual([
      { de: 0.75, a: 2.55, raison: 'parole' },
      { de: 4.75, a: 5.75, raison: 'parole' },
    ]);
  });

  it('garde un son fort hors parole (RMS 100 ms > −16 dBFS) de −0,4 s à +0,6 s', () => {
    const s = signaux(60, -40, [[30, 30.3, -8]]);
    const r = morceauxDeParole([mot('ok', 5, 5.3)], s, N);
    expect(r).toHaveLength(2);
    const fort = r[1]!;
    expect(fort.raison).toBe('fort');
    // La fenêtre de 100 ms qui devient forte commence un peu avant la rafale (±0,06 s).
    expect(fort.de).toBeGreaterThanOrEqual(29.5);
    expect(fort.de).toBeLessThanOrEqual(29.62);
    expect(fort.a).toBeGreaterThanOrEqual(30.88);
    expect(fort.a).toBeLessThanOrEqual(31.0);
  });

  it('un son à −20 dBFS n\'est pas « fort » ; le son fort près d\'un mot fusionne avec lui (raison parole)', () => {
    expect(morceauxDeParole([], signaux(60, -40, [[30, 31, -20]]), N)).toEqual([]);
    const r = morceauxDeParole([mot('boum', 10, 10.3)], signaux(60, -40, [[10.8, 11, -6]]), N);
    expect(r).toHaveLength(1);
    expect(r[0]!.raison).toBe('parole');
    expect(r[0]!.a).toBeGreaterThan(11.5);
  });

  it('retire un morceau plus court que 0,35 s (coupé par la plage)', () => {
    // [4,8 ; 5,45] coupé à 5,1 → 0,3 s : retiré.
    expect(morceauxDeParole([mot('a', 5.05, 5.1)], null, N, { de: 0, a: 5.1 })).toEqual([]);
    // [4,8 ; 5,45] coupé à 5,2 → 0,4 s : gardé.
    expect(morceauxDeParole([mot('a', 5.05, 5.1)], null, N, { de: 0, a: 5.2 })).toEqual([{ de: 4.8, a: 5.2, raison: 'parole' }]);
  });

  it('les passages muets ne sont jamais gardés', () => {
    const s = signaux(400, -40, [], [{ de: 100, a: 300 }]);
    const r = morceauxDeParole([mot('a', 99.8, 100.1), mot('fantome', 200, 200.5), mot('b', 310, 310.4)], s, N);
    expect(r).toEqual([
      { de: 99.55, a: 100, raison: 'parole' },
      { de: 309.75, a: 310.75, raison: 'parole' },
    ]);
  });

  it('borne à la plage et à la source ; ignore les mots hors plage', () => {
    const r = morceauxDeParole([mot('a', 0.1, 0.3), mot('b', 50, 50.5), mot('c', 119.9, 120)], signaux(120, -40), N, { de: 0, a: 60 });
    expect(r).toEqual([
      { de: 0, a: 0.65, raison: 'parole' },
      { de: 49.75, a: 50.85, raison: 'parole' },
    ]);
    const fin = morceauxDeParole([mot('c', 119.9, 120)], signaux(120, -40), N);
    expect(fin[0]!.a).toBe(120);
  });
});

describe('Serré / Normal / Large', () => {
  const mots = [mot('un', 1, 1.3), mot('deux', 1.9, 2.2), mot('trois', 3.1, 3.5), mot('quatre', 6, 6.4)];
  const total = (niveau: keyof typeof REGLAGES_BLANCS) => morceauxDeParole(mots, null, REGLAGES_BLANCS[niveau]).reduce((s, m) => s + m.a - m.de, 0);

  it('Serré garde moins que Normal, qui garde moins que Large', () => {
    expect(total('serre')).toBeLessThan(total('normal'));
    expect(total('normal')).toBeLessThan(total('large'));
  });

  it('deux mots séparés de 1 s : Serré coupe entre les deux, Normal et Large les gardent ensemble', () => {
    const deux = [mot('a', 1, 1.3), mot('b', 2.3, 2.6)];
    expect(morceauxDeParole(deux, null, REGLAGES_BLANCS.serre)).toHaveLength(2);
    expect(morceauxDeParole(deux, null, REGLAGES_BLANCS.normal)).toHaveLength(1);
    expect(morceauxDeParole(deux, null, REGLAGES_BLANCS.large)).toHaveLength(1);
  });

  it('les fondus de son sont les mêmes (20 ms / 40 ms) pour les trois', () => {
    for (const r of Object.values(REGLAGES_BLANCS)) expect([r.fonduEntree, r.fonduSortie]).toEqual([0.02, 0.04]);
  });
});

describe('sons forts et voix sans transcription', () => {
  it('sonsForts regroupe une longue rafale en un seul morceau', () => {
    const r = sonsForts(signaux(60, -40, [[10, 12, -6], [12.2, 13, -6]]), N);
    expect(r).toHaveLength(1);
    expect(r[0]!.a).toBeGreaterThan(13.5);
  });

  it('morceauxDeVoix : zones de voix + marges, raison « voix »', () => {
    const pas = 0.02;
    const db = new Float32Array(1000).fill(-40);
    for (let k = 250; k < 350; k++) db[k] = -24; // voix de 5 à 7 s
    const r = morceauxDeVoix({ pas, db }, null, N);
    expect(r).toHaveLength(1);
    expect(r[0]!.raison).toBe('voix');
    expect(Math.abs(r[0]!.de - 4.75)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(r[0]!.a - 7.35)).toBeLessThanOrEqual(0.08);
  });
});
