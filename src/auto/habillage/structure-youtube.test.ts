import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliserRecette } from '../../recette/normaliser';
import type { Recette } from '../../recette/types';
import { SOURCE_TEST } from './montage-test';
import { pointsEllipse, poserStructureYoutube, STRUCTURE } from './structure-youtube';

const recetteDe = (plans: { de: number; a: number }[], o: Record<string, unknown> = {}): Recette =>
  normaliserRecette({ plans, destination: 'youtube', ...o }, { sources: [SOURCE_TEST] });

describe('structure YouTube (générique, ellipses, fin)', () => {
  it('un carton « Quelques minutes plus tard » sur les sauts de plus de 3 min seulement', () => {
    const r = recetteDe([{ de: 10, a: 20 }, { de: 30, a: 40 }, { de: 400, a: 410 }]);
    expect(pointsEllipse(r)).toEqual([20]);
    const s = poserStructureYoutube(r);
    const cartons = s.plans.filter((p) => p.ins?.type === 'carton');
    expect(cartons).toHaveLength(1);
    expect((cartons[0]!.ins as { txt: string }).txt).toBe(STRUCTURE.texteEllipse);
  });

  it('générique au nom de la chaîne au début (sans accroche), puis la fin « Abonne-toi »', () => {
    const r = recetteDe([{ de: 10, a: 20 }]);
    const s = poserStructureYoutube(r, { chaine: 'Ma Chaîne' });
    const premier = compiler(s).plans[0]!;
    expect(s.plans[0]!.ins).toMatchObject({ type: 'carton', txt: 'MA CHAÎNE' });
    expect(premier.t1 - premier.t0).toBeCloseTo(STRUCTURE.dureeTitre);
    expect(s.outro).toMatchObject({ modele: 'abonne', chaine: 'Ma Chaîne' });
    // Sans nom de chaîne ni persos : rien au début, pas de fin.
    const sans = poserStructureYoutube(r);
    expect(sans.plans.some((p) => p.ins)).toBe(false);
    expect(sans.outro).toBeUndefined();
  });

  it('TikTok (9:16) : rien ne change', () => {
    const r = normaliserRecette({ plans: [{ de: 0, a: 10 }, { de: 400, a: 410 }], destination: 'tiktok' }, { sources: [SOURCE_TEST] });
    expect(poserStructureYoutube(r, { chaine: 'X' })).toBe(r);
  });
});

describe('carte « nom » des persos', () => {
  it('seulement pour un vrai prénom, à la 1re apparition, à côté du perso', async () => {
    const { cartesNoms, vraiNom } = await import('./structure-youtube');
    expect(vraiNom('Voix 2')).toBe(false);
    expect(vraiNom('Romain')).toBe(true);
    const r = recetteDe([{ de: 0, a: 30 }], {
      personnes: [{ id: 'p1', nom: 'Romain' }, { id: 'p2', nom: 'Voix 2' }],
      paroles: [{ ts: 2, fin: 4, p: 'p1', emo: 'rit' }, { ts: 5, fin: 7, p: 'p2', emo: 'crie' }],
      avatars: { mode: 'reactions' },
    });
    const s = cartesNoms(r);
    expect(s.textes?.map((t) => [t.txt, t.t, t.x])).toEqual([['ROMAIN', 2, 0.17]]);
  });
});
