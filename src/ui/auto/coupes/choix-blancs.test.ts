// Panneau « Couper les blancs » : partie écoutée et plage de coupe selon le choix, durées lisibles.

import { describe, expect, it } from 'vitest';
import { normaliser } from '../../../recette/normaliser';
import { TA } from '../../../textes-auto';
import { dureeLisible, plagesDuChoix } from './choix-blancs';

const r = normaliser({
  sources: [{ id: 's1', nom: 'live.mp4', taille: 1, emp: 'e', duree: 7380, type: 'video', l: 1280, h: 720 }],
  plans: [{ de: 100, a: 160 }, { de: 30, a: 40 }],
}).recette;

describe('plagesDuChoix', () => {
  it('mon montage : on écoute du 1er au dernier temps gardé, on coupe les plans actuels', () => {
    expect(plagesDuChoix(r, 7380, 'montage', '', '')).toEqual({ zone: { de: 30, a: 160 } });
  });
  it('toute la vidéo : la vidéo d\'origine entière', () => {
    expect(plagesDuChoix(r, 7380, 'toute', '', '')).toEqual({ zone: { de: 0, a: 7380 }, coupe: { de: 0, a: 7380 } });
  });
  it('une partie « de 0:20:00 à 1:10:00 »', () => {
    expect(plagesDuChoix(r, 7380, 'partie', '0:20:00', '1:10:00')).toEqual({ zone: { de: 1200, a: 4200 }, coupe: { de: 1200, a: 4200 } });
    expect(plagesDuChoix(r, 7380, 'partie', '0:20:00', '9:00:00')).toEqual({ zone: { de: 1200, a: 7380 }, coupe: { de: 1200, a: 7380 } });
  });
  it('un temps illisible ou une fin avant le début : un message', () => {
    expect(plagesDuChoix(r, 7380, 'partie', 'bof', '1:00')).toBe(TA.coupes.blancs.heureFausse);
    expect(plagesDuChoix(r, 7380, 'partie', '10:00', '5:00')).toBe(TA.coupes.blancs.partieVide);
  });
});

describe('dureeLisible', () => {
  it('« 2 h 03 », « 41 min », « 1 min 12 s », « 45 s »', () => {
    expect(dureeLisible(7380)).toBe('2 h 03');
    expect(dureeLisible(41 * 60 + 10)).toBe('41 min');
    expect(dureeLisible(72)).toBe('1 min 12 s');
    expect(dureeLisible(45)).toBe('45 s');
    expect(TA.coupes.blancs.apercu(dureeLisible(7380), dureeLisible(2460), 312)).toBe('2 h 03 → 41 min de parole · 312 coupes');
  });
});
