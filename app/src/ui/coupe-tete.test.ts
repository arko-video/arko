// Outil « Couper » de Habiller : plan visé à la tête, « Couper le début / la fin » (mêmes opérations que les poignées).
import { describe, expect, it } from 'vitest';
import { normaliserRecette } from '../recette/normaliser';
import { bornesDesPlans, rognerDebut, rognerFin } from '../recette/operations';
import type { Recette, Source } from '../recette/types';
import { debutDuPlan, planVise, rognerDebutA, rognerFinA, teteDansPlan } from './coupe-tete';

const v: Source = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video', l: 1920, h: 1080 };
/** 3 plans : [0 ; 4] (4 s), [10 ; 14] (4 s), [20 ; 22] au ralenti ×0,5 (4 s) → coupes à 4 et 8 s. */
const base = (): Recette =>
  normaliserRecette({ plans: [{ de: 0, a: 4 }, { de: 10, a: 14 }, { de: 20, a: 22, vit: 0.5 }] }, { sources: [v] });

describe('plan visé', () => {
  it('le plan choisi l\'emporte, sinon le plan sous la tête', () => {
    const r = base();
    expect(planVise(r, 5, 0)).toBe(0);
    expect(planVise(r, 0, null)).toBe(0);
    expect(planVise(r, 3.99, null)).toBe(0);
    expect(planVise(r, 4, null)).toBe(1); // sur une coupe : le plan qui commence
    expect(planVise(r, 12, null)).toBe(2);
    expect(planVise(r, 12, 7)).toBe(2); // choix périmé (après Annuler) : ignoré
  });
  it('teteDansPlan : début compris, fin exclue (sauf la fin de la vidéo)', () => {
    const r = base();
    expect(teteDansPlan(r, 1, 4)).toBe(true);
    expect(teteDansPlan(r, 0, 4)).toBe(false);
    expect(teteDansPlan(r, 2, 12)).toBe(true);
    expect(teteDansPlan(r, 5, 1)).toBe(false);
  });
  it('debutDuPlan : temps de sortie du début, borné à la fin', () => {
    const r = base();
    expect(debutDuPlan(r, 1)).toBe(4);
    expect(debutDuPlan(r, 3)).toBe(12);
    expect(debutDuPlan(r, 9)).toBe(12);
  });
});

describe('Couper le début / la fin à la tête', () => {
  it('même résultat que la poignée posée au même temps source', () => {
    const r = base();
    // Tête à 5 s = 1 s dans le plan 2 (source 11).
    expect(rognerDebutA(r, 1, 5)).toEqual(rognerDebut(r, 1, 11));
    expect(rognerFinA(r, 1, 5)).toEqual(rognerFin(r, 1, 11));
    expect(bornesDesPlans(rognerDebutA(r, 1, 5))).toEqual([0, 4, 7, 11]);
    expect(bornesDesPlans(rognerFinA(r, 1, 5))).toEqual([0, 4, 5, 9]);
  });
  it('au ralenti, le temps source tient compte de la vitesse', () => {
    const r = base();
    // Tête à 10 s = 2 s dans le plan ×0,5 → 1 s de source → 21.
    expect(rognerDebutA(r, 2, 10).plans[2]).toMatchObject({ de: 21, a: 22 });
    expect(rognerFinA(r, 2, 10).plans[2]).toMatchObject({ de: 20, a: 21 });
  });
  it('tête hors du plan visé, ou au bord : recette inchangée (même objet)', () => {
    const r = base();
    expect(rognerDebutA(r, 0, 5)).toBe(r);
    expect(rognerFinA(r, 2, 1)).toBe(r);
    expect(rognerDebutA(r, 1, 4)).toBe(r); // déjà le début
  });
  it('dans l\'arrêt sur image : la fin ne bouge pas, l\'arrêt reste', () => {
    const r = normaliserRecette({ plans: [{ de: 0, a: 4, fige: 1 }, { de: 10, a: 14 }] }, { sources: [v] });
    expect(rognerFinA(r, 0, 4.5)).toBe(r);
    expect(rognerFinA(r, 0, 2).plans[0]).toEqual({ de: 0, a: 2, fige: 1 });
  });
});
