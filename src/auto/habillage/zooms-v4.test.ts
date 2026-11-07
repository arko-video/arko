// C v4 : zooms du Best-of v4 (taux de la DA, priorité aux moments forts, jamais deux ×1,12 de suite). Données fabriquées.

import { describe, expect, it } from 'vitest';
import type { Plan } from '../../recette/types';
import { habillerV4 } from './habillage-v4';
import { entreeTest, moment, montageTest, signauxTest } from './montage-test';
import { FORCES_ZOOMS_AUTO } from './zooms-auto';
import { planifierZoomsV4, ZOOMS_V4, type EntreeZoomsV4 } from './zooms-v4';

/** 20 plans de 3 s : [0,3], [5,8], [10,13]… */
const PLANS: Plan[] = Array.from({ length: 20 }, (_, i) => ({ de: i * 5, a: i * 5 + 3 }));
const entree = (o: Partial<EntreeZoomsV4> = {}): EntreeZoomsV4 => ({ premiere: 's1', moments: [], punchlines: [], signaux: null, force: 'normal', ...o });
const forces = (z: ReturnType<typeof planifierZoomsV4>) => z.map((x) => x?.force ?? 1);

describe('taux et priorités', () => {
  it('×1,32 sur 35 % des plans, ×1,12 sur 23 %, jamais deux ×1,12 de suite, centre à 45 %', () => {
    const f = forces(planifierZoomsV4(PLANS, entree()));
    expect(f.filter((x) => x === 1.32)).toHaveLength(Math.round(ZOOMS_V4.partForts * 20));
    expect(f.filter((x) => x === 1.12)).toHaveLength(Math.round(ZOOMS_V4.partLegers * 20));
    for (let i = 1; i < f.length; i++) expect(f[i] === 1.12 && f[i - 1] === 1.12).toBe(false);
    expect(planifierZoomsV4(PLANS, entree()).find((x) => x)!.y).toBe(0.45);
  });

  it('les plans des moments les plus forts d’abord, puis ceux d’une punchline, puis les plus longs', () => {
    const moments = [moment('cri', 50, 51, 0.9), moment('rire', 60.5, 61.5, 0.4), moment('sonFort', 70, 71, 0.2), moment('echanges', 80, 90, 1)];
    const plans = PLANS.map((p, i) => (i === 19 ? { de: p.de, a: p.de + 9 } : p)); // le dernier plan est long
    const z = forces(planifierZoomsV4(plans, entree({ moments, punchlines: [{ ts: 30.5, fin: 32 }] })));
    expect([z[10], z[12], z[14], z[6], z[19]]).toEqual([1.32, 1.32, 1.32, 1.32, 1.32]);
    // Les « échanges » ne déclenchent pas de punch-in : le plan 16 n'a rien de plus qu'un autre.
    const seuls = forces(planifierZoomsV4(PLANS, entree({ moments: [moment('echanges', 80, 82, 1)] })));
    expect(seuls[16]).not.toBe(1.32);
  });

  it('un pic du jeu compte, un plan d’une autre source ou un élément inséré n’est jamais zoomé', () => {
    const z = forces(planifierZoomsV4(PLANS, entree({ signaux: signauxTest(200, { pics: [{ ts: 41, db: -5, z: 8 }] }) })));
    expect(z[8]).toBe(1.32);
    const autres: Plan[] = PLANS.map((p, i) => (i < 10 ? { ...p, src: 's2' } : i === 10 ? { ...p, ins: { type: 'image', id: 'x' } as never } : p));
    const z2 = forces(planifierZoomsV4(autres, entree()));
    expect(z2.slice(0, 11).every((x) => x === 1)).toBe(true);
  });

  it('Doux / Normal / Fort', () => {
    for (const f of ['doux', 'normal', 'fort'] as const) {
      const z = forces(planifierZoomsV4(PLANS, entree({ force: f })));
      expect(z).toContain(FORCES_ZOOMS_AUTO[f].fort);
      expect(z).toContain(FORCES_ZOOMS_AUTO[f].leger);
    }
  });
});

describe('dans le montage', () => {
  it('taux de la DA sur un montage coupé ; zooms décochés : aucun', () => {
    const m = montageTest(5);
    const res = habillerV4(m.recette, entreeTest(m, { accroche: false, momentsV4: [moment('cri', 35, 36, 0.9)] }));
    const { plans, zoomsForts, zoomsLegers } = res.bilan;
    expect(zoomsForts / plans).toBeGreaterThanOrEqual(0.3);
    expect(zoomsForts / plans).toBeLessThanOrEqual(0.4);
    expect(zoomsLegers / plans).toBeGreaterThanOrEqual(0.18);
    expect(zoomsLegers / plans).toBeLessThanOrEqual(0.28);
    const plan = res.recette.plans.find((p) => 35 >= p.de && 35 < p.a)!;
    expect(plan.zoomFixe?.force).toBe(1.32);
    expect(habillerV4(m.recette, entreeTest(m, { zooms: null })).recette.plans.slice(1).some((p) => p.zoomFixe)).toBe(false);
  });
});
