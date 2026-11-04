import { describe, expect, it } from 'vitest';
import {
  annuler, bornesDesPlans, choisirMise, commencerIci, dureeFinale, finirIci, nouvelHistorique, planA,
  pousser, retablir, rognerDebut, rognerFin, scinder, supprimer, deplacerPlan, ajouterPlan,
} from '../operations';
import { normaliserRecette } from '../normaliser';
import type { Recette } from '../types';

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 5, type: 'video' as const, l: 1920, h: 1080 };
const base = (): Recette => normaliserRecette({ plans: [{ de: 0, a: 5 }] }, { sources: [v] });

describe('opérations', () => {
  it('scinder à 2 s puis supprimer le plan 2 (critère de fin de phase 1)', () => {
    const r0 = base();
    const r1 = scinder(r0, 2);
    expect(r1.plans).toEqual([{ de: 0, a: 2 }, { de: 2, a: 5 }]);
    expect(r0.plans).toEqual([{ de: 0, a: 5 }]); // immuable
    const r2 = supprimer(r1, 1);
    expect(r2.plans).toEqual([{ de: 0, a: 2 }]);
    expect(dureeFinale(r2)).toBe(2);
  });
  it('scinder sans effet sur une coupe ou hors vidéo', () => {
    const r1 = scinder(base(), 2);
    expect(scinder(r1, 2)).toBe(r1);
    expect(scinder(r1, 2.05)).toBe(r1);
    expect(scinder(r1, 9)).toBe(r1);
    expect(scinder(r1, -1)).toBe(r1);
  });
  it('scinder tient compte de la vitesse', () => {
    const r = normaliserRecette({ plans: [{ de: 0, a: 4, vit: 2 }] }, { sources: [v] });
    expect(scinder(r, 1).plans).toEqual([{ de: 0, a: 2, vit: 2 }, { de: 2, a: 4, vit: 2 }]);
  });
  it('supprimer refuse le dernier plan', () => {
    const r = base();
    expect(supprimer(r, 0)).toBe(r);
    expect(supprimer(scinder(r, 2), 7).plans).toHaveLength(2);
  });
  it('rogner en gardant au moins 0,10 s et dans la source', () => {
    const r = scinder(base(), 2);
    expect(rognerDebut(r, 0, 1.95).plans[0]).toEqual({ de: 1.9, a: 2 });
    expect(rognerDebut(r, 0, -3).plans[0]).toEqual({ de: 0, a: 2 });
    expect(rognerDebut(r, 0, 0)).toBe(r);
    expect(rognerFin(r, 1, 9).plans[1]).toEqual({ de: 2, a: 5 });
    expect(rognerFin(r, 1, 2).plans[1]).toEqual({ de: 2, a: 2.1 });
    expect(rognerFin(r, 0, 1.234).plans[0]).toEqual({ de: 0, a: 1.23 });
  });
  it('commencer ici / finir ici', () => {
    const r = scinder(base(), 2);
    expect(commencerIci(r, 1).plans).toEqual([{ de: 1, a: 2 }, { de: 2, a: 5 }]);
    expect(commencerIci(r, 3).plans).toEqual([{ de: 3, a: 5 }]);
    expect(commencerIci(r, 2).plans).toEqual([{ de: 2, a: 5 }]);
    expect(commencerIci(r, 0)).toBe(r);
    expect(finirIci(r, 3).plans).toEqual([{ de: 0, a: 2 }, { de: 2, a: 3 }]);
    expect(finirIci(r, 2).plans).toEqual([{ de: 0, a: 2 }]);
    expect(finirIci(r, 1).plans).toEqual([{ de: 0, a: 1 }]);
    expect(finirIci(r, 5)).toBe(r);
  });
  it('choisirMise normalise', () => {
    const r = choisirMise(base(), { type: 'recadre', x: 1.7 });
    expect(r.mise).toEqual({ type: 'recadre', x: 1 });
  });
  it('planA et bornesDesPlans', () => {
    const r = scinder(base(), 2);
    expect(planA(r, 3)).toEqual({ i: 1, ts: 3 });
    expect(planA(r, 6)).toBeNull();
    expect(bornesDesPlans(r)).toEqual([0, 2, 5]);
  });
});

describe('historique', () => {
  it('annule et rétablit', () => {
    const r0 = base();
    const r1 = scinder(r0, 2);
    const r2 = supprimer(r1, 1);
    let h = pousser(pousser(nouvelHistorique(r0), r1), r2);
    expect(h.present).toBe(r2);
    h = annuler(h);
    expect(h.present).toBe(r1);
    h = annuler(h);
    expect(h.present).toBe(r0);
    expect(h.peutAnnuler).toBe(false);
    expect(annuler(h)).toBe(h);
    h = retablir(h);
    expect(h.present).toBe(r1);
    expect(h.peutRetablir).toBe(true);
    h = pousser(h, r0);
    expect(h.peutRetablir).toBe(false);
  });
  it('garde au plus 50 états', () => {
    let h = nouvelHistorique(base());
    for (let i = 1; i <= 60; i++) h = pousser(h, choisirMise(base(), { type: 'flou', y: i / 100 }));
    let n = 0;
    while (h.peutAnnuler) {
      h = annuler(h);
      n++;
    }
    expect(n).toBe(50);
    expect(h.present.mise).toEqual({ type: 'flou', y: 0.1 });
  });
  it('est immuable', () => {
    const h0 = nouvelHistorique(base());
    const h1 = pousser(h0, scinder(base(), 2));
    expect(h0.peutAnnuler).toBe(false);
    expect(h1.peutAnnuler).toBe(true);
  });

  it('déplacer un plan dans une longue source (live de 2 h)', () => {
    const live = { ...v, duree: 7200 };
    const r = normaliserRecette({ plans: [{ de: 0, a: 60 }] }, { sources: [live] });
    expect(deplacerPlan(r, 0, 5400).plans).toEqual([{ de: 5370, a: 5430 }]);
    expect(deplacerPlan(r, 0, 7190).plans).toEqual([{ de: 7140, a: 7200 }]); // borné à la fin
    expect(deplacerPlan(r, 0, 10).plans).toEqual([{ de: 0, a: 60 }]); // borné au début → inchangé
    expect(deplacerPlan(r, 0, 10)).toBe(r);
    expect(deplacerPlan(r, 3, 100)).toBe(r);
  });
  it('ajouter un passage après un plan ou à la fin', () => {
    const live = { ...v, duree: 7200 };
    const r = normaliserRecette({ plans: [{ de: 0, a: 60 }, { de: 100, a: 110 }] }, { sources: [live] });
    expect(ajouterPlan(r, 5400).plans).toEqual([{ de: 0, a: 60 }, { de: 100, a: 110 }, { de: 5385, a: 5415 }]);
    expect(ajouterPlan(r, 5400, 10, 0).plans[1]).toEqual({ de: 5395, a: 5405 });
    expect(ajouterPlan(r, 7199, 30).plans[2]).toEqual({ de: 7170, a: 7200 });
    expect(ajouterPlan(base(), 2, 30).plans[1]).toEqual({ de: 0, a: 5 }); // source plus courte que 30 s
    expect(ajouterPlan(r, Number.NaN)).toBe(r);
  });
});
