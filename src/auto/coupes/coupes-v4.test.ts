// Coupes v4 (dev-coupes) : marges de la DA, segments de la VAD, prolongement borné, coupe au creux et jamais dans
// la voix, réactions gardées sans mots, sons forts gardés seulement avant une réaction ou près de la parole, mode voix,
// plages, muets, et durées de la revue = durée du montage (couperLesBlancs). Données fabriquées seulement.

import { describe, expect, it } from 'vitest';
import { normaliser } from '../../recette/normaliser';
import { couperLesBlancs } from '../../recette/operations';
import { dureePlan } from '../../recette/temps';
import type { Mot, Recette } from '../../recette/types';
import { REGLAGES_BLANCS } from './blancs';
import { couperV4, dureeDansMorceaux, morceauxV4, REGLAGES_COUPES_V4, reglagesCoupesV4, RETARD_FIN_VAD } from './coupes-v4';
import { ecouteDe, pointDeCoupe, prolonger } from './creux';
import { energieFabriquee, entree, moment, pA, paroleFabriquee, signauxFabriques, vadFabriquee } from './coupes-test';
import { paroleDepuisProbas } from '../vad/segments';

const mot = (txt: string, de: number, a: number): Mot => [txt, de, a];
const bords = (ms: { de: number; a: number }[]) => ms.map((m) => [m.de, m.a]);

describe('réglages', () => {
  it('Normal = la DA (0,25 / 0,35 / 0,5 / 0,35 s, fondus 20 / 40 ms) + VAD et creux', () => {
    expect(REGLAGES_COUPES_V4).toMatchObject({ avant: 0.25, apres: 0.35, fusion: 0.5, morceauMin: 0.35, fonduEntree: 0.02, fonduSortie: 0.04 });
    expect(REGLAGES_COUPES_V4).toMatchObject({ prolongerAvant: 0.2, prolongerApres: 0.3, seuilParole: 0.35, fenetreCreux: 0.15, fortSiReaction: true, reactionApres: 2 });
    expect(reglagesCoupesV4('serre')).toMatchObject({ avant: 0.15, apres: 0.2, fusion: 0.3, seuilParole: 0.35 });
    expect(reglagesCoupesV4('large')).toMatchObject({ avant: 0.4, apres: 0.6, fusion: 0.8, fenetreCreux: 0.15 });
  });

  it('les réglages de Couper les blancs ne changent pas (outil d\'avant)', () => {
    expect(REGLAGES_BLANCS.normal).toEqual({ avant: 0.25, apres: 0.35, fusion: 0.5, fortDb: -16, fortFenetre: 0.1, fortAvant: 0.4, fortApres: 0.6, morceauMin: 0.35, fonduEntree: 0.02, fonduSortie: 0.04 });
    expect(REGLAGES_BLANCS.serre.avant).toBe(0.15);
  });
});

describe('marges de la DA autour des mots et de la parole', () => {
  it('un mot garde 0,25 s avant et 0,35 s après', () => {
    expect(couperV4(entree({ mots: [mot('salut', 10, 10.4)] }))).toEqual([{ de: 9.75, a: 10.75, raison: 'parole' }]);
  });

  it('fusion sous 0,5 s : un trou de moins de 1,1 s entre deux mots reste, au-delà il est coupé', () => {
    expect(bords(couperV4(entree({ mots: [mot('a', 1, 1.2), mot('b', 2.27, 2.5)] })))).toEqual([[0.75, 2.85]]);
    expect(bords(couperV4(entree({ mots: [mot('a', 1, 1.2), mot('b', 2.35, 2.5)] })))).toEqual([[0.75, 1.55], [2.11, 2.85]]);
  });

  it('un segment de parole (mot raté de la voix faible) est gardé, avec 0,1 s de moins après (retard de la VAD)', () => {
    const parole = paroleFabriquee(60, [[20, 21, 0.9]]);
    const s = parole.segments[0]!;
    const r = couperV4(entree({ parole }));
    expect(r).toHaveLength(1);
    expect(r[0]!.de).toBeCloseTo(s.de - 0.25, 1);
    expect(r[0]!.a).toBeCloseTo(s.a + 0.35 - RETARD_FIN_VAD, 1);
  });

  it('zones = mots ∪ parole : la parole sans mot ET les mots hors parole sont gardés', () => {
    const parole = paroleFabriquee(60, [[20, 21, 0.9]]);
    const r = couperV4(entree({ mots: [mot('ok', 40, 40.3)], parole }));
    expect(r).toHaveLength(2);
    expect(r[0]!.a).toBeGreaterThan(21);
    expect(r[1]).toMatchObject({ de: 39.75, a: 40.65 });
  });

  it('mode voix : les « mots » vides sont les segments (mêmes marges que la parole)', () => {
    const parole = paroleFabriquee(60, [[20, 21, 0.9], [30, 31, 0.9]]);
    const vides: Mot[] = parole.segments.map((s) => ['', s.de, s.a]);
    expect(couperV4(entree({ mots: vides, parole }))).toEqual(couperV4(entree({ parole })));
  });
});

describe('jamais de coupe dans la voix', () => {
  it('prolongement : la VAD entend encore la voix après la marge → la fin va jusqu\'à la fin de la voix', () => {
    // p = 0,4 (voix douce, pas un segment) de 10,4 à 10,95 : la marge finit à 10,75, la voix à 10,95.
    const vad = vadFabriquee(60, [[10.4, 10.95, 0.4]]);
    const parole = { ...paroleDepuisProbas(vad, 60) };
    expect(parole.segments).toHaveLength(0);
    const [m] = couperV4(entree({ mots: [mot('salut', 10, 10.4)], parole }));
    expect(m!.a).toBeGreaterThanOrEqual(10.95);
    expect(m!.a).toBeLessThanOrEqual(11.11);
    expect(pA(vad, m!.a)).toBeLessThan(0.35);
  });

  it('prolongement borné : +0,3 s au plus, puis on cherche la 1ʳᵉ trame sans voix (jamais plus de ~1,1 s après le mot)', () => {
    const vad = vadFabriquee(60, [[10.4, 11.3, 0.4]]);
    const ec = ecouteDe(paroleDepuisProbas(vad, 60), null);
    expect(prolonger(ec, 10.75, 'fin', REGLAGES_COUPES_V4)).toBeCloseTo(11.05, 5);
    const [m] = couperV4(entree({ mots: [mot('salut', 10, 10.4)], parole: paroleDepuisProbas(vad, 60) }));
    expect(m!.a).toBeGreaterThanOrEqual(11.3);
    expect(m!.a).toBeLessThanOrEqual(11.5);
    expect(pA(vad, m!.a)).toBeLessThan(0.35);
    // Voix sans fin : la coupe reste bornée.
    const sansFin = vadFabriquee(60, [[10.4, 30, 0.4]]);
    const [x] = couperV4(entree({ mots: [mot('salut', 10, 10.4)], parole: paroleDepuisProbas(sansFin, 60) }));
    expect(x!.a).toBeLessThanOrEqual(10.4 + 0.35 + 0.3 + 0.15 + 0.3 + 0.02);
  });

  it('prolongement avant : la voix commence plus tôt que la marge → le début recule (0,2 s au plus)', () => {
    const vad = vadFabriquee(60, [[9.5, 10, 0.4]]);
    const [m] = couperV4(entree({ mots: [mot('salut', 10, 10.4)], parole: paroleDepuisProbas(vad, 60) }));
    expect(m!.de).toBeLessThanOrEqual(9.75);
    expect(m!.de).toBeGreaterThanOrEqual(9.75 - 0.2 - 0.15 - 0.2 - 0.02);
    expect(pA(vad, m!.de)).toBeLessThan(0.35);
  });

  it('coupe au creux : la fin glisse vers la trame la plus calme à ± 0,15 s', () => {
    const energie = energieFabriquee(60, -30, [[10.84, 10.86, -70]]);
    const [m] = couperV4(entree({ mots: [mot('salut', 10, 10.4)], energie }));
    expect(m!.a).toBe(10.85);
  });

  it('… mais jamais sur une trame où la VAD entend la voix (p ≥ 0,35), même si elle est plus calme', () => {
    const energie = energieFabriquee(60, -30, [[10.84, 10.86, -70], [10.62, 10.64, -50]]);
    const vad = vadFabriquee(60, [[10.8, 10.9, 0.5]]);
    const parole = paroleDepuisProbas(vad, 60);
    const [m] = couperV4(entree({ mots: [mot('salut', 10, 10.4)], parole, energie }));
    expect(pA(vad, m!.a)).toBeLessThan(0.35);
    expect(m!.a).toBe(10.63);
  });

  it('la coupe ne rentre jamais dans le mot qu\'elle protège (garde de 0,05 s)', () => {
    // Le plus calme serait juste après le mot (10,42) : hors d'atteinte (fin ≥ 10,4 + 0,05).
    const energie = energieFabriquee(60, -30, [[10.4, 10.44, -80]]);
    const [m] = couperV4(entree({ mots: [mot('salut', 10, 10.4)], energie, niveau: 'serre' }));
    expect(m!.a).toBeGreaterThanOrEqual(10.45);
  });

  it('pointDeCoupe : toute la fenêtre dans la voix → la 1ʳᵉ trame sans voix vers l\'extérieur', () => {
    const vad = vadFabriquee(60, [[5, 6.1, 0.6]]);
    const ec = ecouteDe(paroleDepuisProbas(vad, 60), null);
    const t = pointDeCoupe(ec, 5.8, 'fin', 5.5, REGLAGES_COUPES_V4);
    expect(pA(vad, t)).toBeLessThan(0.35);
    expect(t).toBeGreaterThanOrEqual(6.08);
  });
});

describe('réactions et sons forts', () => {
  it('une réaction (rire, cri, exclamation) est gardée même sans mots, avec les marges', () => {
    const r = couperV4(entree({ moments: [moment('rire', 20, 21.5)] }));
    expect(r).toEqual([{ de: 19.75, a: 21.85, raison: 'voix' }]);
    expect(couperV4(entree({ moments: [moment('sonFort', 20, 21.5), moment('echanges', 40, 45)] }))).toEqual([]);
  });

  it('… sur la partie qu\'on ENTEND seulement : un « rire » muet (ni voix ni son) ne fait pas un blanc', () => {
    const energie = energieFabriquee(60, -80, [[20.5, 21.2, -35]]);
    expect(couperV4(entree({ moments: [moment('rire', 20, 21.5)], energie }))).toEqual([{ de: 20.25, a: 21.55, raison: 'voix' }]);
    expect(couperV4(entree({ moments: [moment('fouRire', 30, 33)], energie }))).toEqual([]);
    // La VAD seule suffit aussi à l'entendre.
    const parole = paroleDepuisProbas(vadFabriquee(60, [[40.2, 40.4, 0.4]]), 60);
    expect(couperV4(entree({ moments: [moment('cri', 40, 41)], parole, energie }))).toHaveLength(1);
  });

  it('un son fort seul (loin de la parole, sans réaction) est retiré', () => {
    const signaux = signauxFabriques(120, -40, [[60, 60.3, -8]]);
    expect(couperV4(entree({ mots: [mot('ok', 5, 5.3)], signaux }))).toHaveLength(1);
  });

  it('un son fort suivi d\'un rire dans les 2 s est gardé (avec le rire)', () => {
    const signaux = signauxFabriques(120, -40, [[60, 60.3, -8]]);
    const r = couperV4(entree({ mots: [mot('ok', 5, 5.3)], signaux, moments: [moment('rire', 61.5, 62.5)] }));
    expect(r).toHaveLength(2);
    expect(r[1]!.de).toBeLessThanOrEqual(59.62);
    expect(r[1]!.a).toBeGreaterThanOrEqual(62.5);
  });

  it('un son fort qui touche la parole (< 1 s) est gardé ; « garder la parole seulement » : jamais', () => {
    const signaux = signauxFabriques(120, -40, [[60, 60.3, -8]]);
    const r = couperV4(entree({ mots: [mot('ok', 61.3, 61.6)], signaux }));
    expect(r).toHaveLength(1);
    expect(r[0]!.de).toBeLessThanOrEqual(59.62);
    expect(r[0]!.raison).toBe('parole');
    expect(couperV4(entree({ mots: [mot('ok', 61.3, 61.6)], signaux, garder: 'parole' }))[0]!.de).toBeGreaterThan(60.9);
  });

  it('fortSiReaction = false : tous les sons forts sont gardés (comme Couper les blancs)', () => {
    const signaux = signauxFabriques(120, -40, [[60, 60.3, -8]]);
    const r = morceauxV4(entree({ mots: [mot('ok', 5, 5.3)], signaux }), { ...REGLAGES_COUPES_V4, fortSiReaction: false });
    expect(r).toHaveLength(2);
    expect(r[1]!.raison).toBe('fort');
  });
});

describe('plages, muets, longueur minimale', () => {
  it('ne coupe que dans les plages données (jamais ailleurs)', () => {
    const mots = [mot('a', 5, 5.5), mot('b', 15, 15.5), mot('c', 25, 25.5)];
    const r = couperV4(entree({ mots, plages: [{ de: 14, a: 20 }] }));
    expect(bords(r)).toEqual([[14.75, 15.85]]);
    const bord = couperV4(entree({ mots, plages: [{ de: 15.2, a: 20 }] }));
    expect(bord[0]!.de).toBe(15.2);
  });

  it('retire les passages muets et les morceaux de moins de 0,35 s', () => {
    const signaux = signauxFabriques(120, -40, [], [{ de: 10.2, a: 30 }]);
    const r = couperV4(entree({ mots: [mot('a', 10, 10.3), mot('b', 50, 50.02)], signaux }));
    expect(r.every((m) => m.a - m.de >= 0.35 - 1e-9)).toBe(true);
    expect(r.some((m) => m.a > 10.2 && m.de < 30)).toBe(false);
    expect(r[r.length - 1]).toMatchObject({ de: 49.75, a: 50.37 });
  });

  it('triés, sans chevauchement, arrondis au 1/100 s ; rien à garder → []', () => {
    const parole = paroleFabriquee(200, [[3, 4, 0.8], [3.9, 6, 0.7], [50, 52.33, 0.9], [100, 100.4, 0.9]]);
    const r = couperV4(entree({ mots: [mot('x', 51, 51.2), mot('y', 4.5, 7)], parole, energie: energieFabriquee(200, -45) }));
    for (let i = 0; i < r.length; i++) {
      expect(Math.round(r[i]!.de * 100) / 100).toBe(r[i]!.de);
      if (i > 0) expect(r[i]!.de).toBeGreaterThan(r[i - 1]!.a);
    }
    expect(couperV4(entree())).toEqual([]);
  });
});

describe('durées de la revue = durée du montage', () => {
  const s1 = { id: 's1', nom: 'live.mp4', taille: 1, emp: 'e1', duree: 600, type: 'video' as const, l: 1280, h: 720 };
  const recette = (plans: { de: number; a: number }[]): Recette => normaliser({ sources: [s1], plans }).recette;
  const parole = paroleFabriquee(600, [[12, 14.2, 0.9], [15.1, 18, 0.8], [40, 40.6, 0.9], [121, 125, 0.9], [126.3, 127, 0.6], [300, 302, 0.9]]);
  const mots = [mot('salut', 12.1, 12.5), mot('ça', 16, 16.3), mot('va', 41, 41.4), mot('oui', 122, 122.5), mot('loin', 200, 200.3)];
  const signaux = signauxFabriques(600, -40, [[60, 60.3, -8], [130, 130.2, -6]]);

  for (const niveau of ['serre', 'normal', 'large'] as const) {
    it(`dureeDansMorceaux = durée des plans de couperLesBlancs (${niveau})`, () => {
      const morceaux = couperV4(entree({ mots, parole, signaux, niveau, energie: energieFabriquee(600, -50, [[14.5, 14.6, -80]]) }));
      const plages = [{ de: 10, a: 50 }, { de: 118.4, a: 140 }, { de: 199.5, a: 200.2 }];
      const montage = couperLesBlancs(recette(plages), morceaux, niveau);
      const reel = montage.plans.reduce((t, p) => t + dureePlan(p), 0);
      const annonce = dureeDansMorceaux(morceaux, plages, REGLAGES_BLANCS[niveau].morceauMin);
      expect(Math.abs(annonce - reel)).toBeLessThanOrEqual(0.3);
      expect(annonce).toBeCloseTo(reel, 1);
    });
  }
});

describe('dureeDansMorceaux : morceaux rangés une fois (relecture point 14)', () => {
  it('même résultat à chaque appel, et pour une autre liste (non triée, avec chevauchement)', () => {
    const morceaux = [{ de: 30, a: 34 }, { de: 10, a: 12 }, { de: 11, a: 15 }, { de: 50, a: 50.2 }];
    const plages = [{ de: 0, a: 20 }, { de: 31, a: 60 }];
    const un = dureeDansMorceaux(morceaux, plages, 0.35);
    expect(un).toBeCloseTo(5 + 3, 5);
    expect(dureeDansMorceaux(morceaux, plages, 0.35)).toBe(un);
    expect(dureeDansMorceaux([{ de: 0, a: 1 }], plages, 0.35)).toBe(1);
  });
});
