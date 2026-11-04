import { describe, expect, it } from 'vitest';
import { compiler, miseDuPlan, planAuTemps, sortiesDe, sourceA } from '../chronologie';
import { normaliserRecette } from '../normaliser';

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 100, type: 'video' as const, l: 1920, h: 1080 };
const r = normaliserRecette(
  { plans: [{ de: 10, a: 14 }, { de: 20, a: 22, vit: 2 }, { de: 10, a: 12, vit: 0.5 }], zooms: [{ ts: 11 }], textes: [{ txt: 'a', t: 1 }] },
  { sources: [v] },
);

describe('compiler', () => {
  const s = compiler(r);
  it('place les plans en temps de sortie', () => {
    expect(s.duree).toBeCloseTo(9);
    expect(s.plans.map((p) => [p.t0, p.t1])).toEqual([[0, 4], [4, 5], [5, 9]]);
    expect(s.plans[0]!.src).toBe('s1');
  });
  it('convertit temps de sortie → source', () => {
    expect(sourceA(s, 0)!.ts).toBe(10);
    expect(sourceA(s, 4.5)!.ts).toBe(21);
    expect(sourceA(s, 4.5)!.plan.i).toBe(1);
    expect(sourceA(s, 7)!.ts).toBe(11);
    expect(sourceA(s, 9)!.plan.i).toBe(2);
    expect(sourceA(s, 9.5)).toBeNull();
    expect(planAuTemps(s, -1)).toBeNull();
  });
  it('un passage réutilisé fait réapparaître le zoom', () => {
    expect(sortiesDe(s, 's1', 11)).toEqual([1, 7]);
    expect(s.zooms.map((z) => z.t)).toEqual([1, 7]);
  });
  it('fusionne une mise de même type, remplace sinon', () => {
    expect(miseDuPlan({ type: 'flou', y: 0.5 }, { type: 'flou', y: 0.3 })).toEqual({ type: 'flou', y: 0.3 });
    expect(miseDuPlan({ type: 'flou', y: 0.5 }, { type: 'recadre', x: 0.2 })).toEqual({ type: 'recadre', x: 0.2 });
  });
});
