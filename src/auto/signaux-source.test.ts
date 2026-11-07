// Signaux partagés du Montage auto : à partir d'une enveloppe fabriquée (mêmes détecteurs que le monteur IA).

import { describe, expect, it } from 'vitest';
import { signalSynthetique, CONNUS } from '../ia/synthese-test';
import { avertissementsMuets } from './express/analyse-express';
import { avecFinAfk, FIN_AFK, niveauDb, passagesMuets, signauxDepuisEnveloppe } from './signaux-source';

describe('signauxDepuisEnveloppe', () => {
  const sig = signalSynthetique(600);
  const s = signauxDepuisEnveloppe('s1', sig.duree, sig.pas, sig.enveloppe);

  it('garde la source, le pas et l\'enveloppe', () => {
    expect(s.src).toBe('s1');
    expect(s.pas).toBe(0.02);
    expect(s.rms).toBe(sig.enveloppe);
  });

  it('retrouve les moments connus du signal fabriqué du monteur IA (pic, cri, rire)', () => {
    expect(s.pics.some((p) => Math.abs(p.ts - CONNUS.calmePic) < 1)).toBe(true);
    expect(s.cris.some((c) => Math.abs(c.t - CONNUS.cri) < 2)).toBe(true);
    expect(s.rires.some((c) => Math.abs(c.t - CONNUS.rire) < 2.5)).toBe(true);
    for (const p of s.pics) expect(p.db).toBeLessThanOrEqual(0);
  });

  it('cris et rires sous forme de plages { de, a, t, force }', () => {
    for (const c of [...s.cris, ...s.rires]) {
      expect(c.a).toBeGreaterThan(c.de);
      expect(c.t).toBeGreaterThanOrEqual(c.de);
      expect(c.force).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('passages muets (fin d\'enregistrement AFK)', () => {
  it('≥ 120 s sous −60 dBFS : muet ; 100 s : non', () => {
    const pas = 0.02;
    const rms = new Float32Array(500 / pas).fill(0.05);
    rms.fill(0, 50 / pas, 180 / pas); // 130 s
    rms.fill(0.0005, 300 / pas, 400 / pas); // 100 s à −66 dBFS
    const muets = passagesMuets(rms, pas);
    expect(muets).toHaveLength(1);
    expect(muets[0]!.de).toBeCloseTo(50, 5);
    expect(muets[0]!.a).toBeCloseTo(180, 5);
    expect(signauxDepuisEnveloppe('s1', 500, pas, rms).muets).toEqual(muets);
  });
});

describe('fin AFK avec des bruits isolés (avecFinAfk)', () => {
  it('une courte activité isolée après un long passage muet : toute la fin compte comme muette', () => {
    // 2 h de session, 40 min muettes, 4 min de bruits, 30 min muettes jusqu'à la fin (le cas « fin AFK » réel).
    const m = avecFinAfk([{ de: 7200, a: 9600 }, { de: 9840, a: 11640 }], 11640);
    expect(m).toEqual([{ de: 7200, a: 11640, sonIsole: 240 }]);
    // Sans muet à la toute fin non plus : 2 min de son après 10 min muettes.
    expect(avecFinAfk([{ de: 3000, a: 3600 }], 3720)).toEqual([{ de: 3000, a: 3720, sonIsole: 120 }]);
  });

  it('une vraie reprise n\'est pas touchée : plus longue que la pause, ou plus de 5 min de son', () => {
    const pauseMilieu = [{ de: 1000, a: 1300 }];
    expect(avecFinAfk(pauseMilieu, 1300 + 400)).toEqual(pauseMilieu); // 300 s muettes, 400 s de son après
    expect(avecFinAfk([{ de: 1000, a: 4000 }], 4000 + FIN_AFK.ilotMax + 1)).toEqual([{ de: 1000, a: 4000 }]);
    expect(avecFinAfk([{ de: 1000, a: 4000 }], 4000)).toEqual([{ de: 1000, a: 4000 }]); // muet jusqu'à la fin
    expect(avecFinAfk([], 100)).toEqual([]);
  });

  it('les signaux et le message le disent (bruits jamais proposés)', () => {
    const pas = 0.02;
    const rms = new Float32Array(1000 / pas).fill(0.05);
    rms.fill(0, 400 / pas, 700 / pas); // 300 s muettes
    rms.fill(0, 760 / pas); // 60 s de bruits puis 240 s muettes
    const s = signauxDepuisEnveloppe('s1', 1000, pas, rms);
    expect(s.muets).toHaveLength(1);
    expect(s.muets[0]!.de).toBeCloseTo(400, 5);
    expect(s.muets[0]!.a).toBe(1000);
    expect(s.muets[0]!.sonIsole).toBeCloseTo(60, 5);
    expect(avertissementsMuets(s)).toEqual(['La fin (9\u00a0min sans son, à part 1\u00a0min de bruits isolés) n\'est pas proposée.']);
  });
});

describe('niveauDb', () => {
  it('RMS moyen en dBFS sur une plage', () => {
    const pas = 0.02;
    const rms = new Float32Array(100).fill(0.1);
    rms.fill(1, 50, 55);
    const s = signauxDepuisEnveloppe('s1', 2, pas, rms);
    expect(niveauDb(s, 0, 0.5)).toBeCloseTo(-20, 3);
    expect(niveauDb(s, 1, 1.1)).toBeCloseTo(0, 3);
    expect(niveauDb(s, 5, 6)).toBe(-100);
  });
});
