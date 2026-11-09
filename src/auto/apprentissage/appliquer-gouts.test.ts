import { describe, expect, it } from 'vitest';
import type { ReglagesExpress } from '../express/express';
import { eclaircir, reglagesAvecGouts, zoomsAvecGouts } from './appliquer-gouts';
import { GOUTS_DEPART } from './gouts';

const REG = { dureeVisee: { min: 900, max: 1200 }, zooms: 'normal', punchlines: true } as ReglagesExpress;

describe('goûts appliqués aux réglages (E1, E2)', () => {
  it('zooms : un cran de moins, de plus, ou aucun', () => {
    expect(zoomsAvecGouts('normal', 0.5)).toBe('doux');
    expect(zoomsAvecGouts('normal', 1.6)).toBe('fort');
    expect(zoomsAvecGouts('doux', 0.5)).toBe('doux');
    expect(zoomsAvecGouts('normal', 0.3)).toBeNull();
    expect(zoomsAvecGouts(null, 3)).toBeNull();
  });

  it('sans montage appris : réglages inchangés ; sinon punchlines et durée suivent', () => {
    expect(reglagesAvecGouts(REG, GOUTS_DEPART)).toBe(REG);
    const g = { ...GOUTS_DEPART, n: 3, duree: 0.8, densite: { ...GOUTS_DEPART.densite, punchlines: 0.3 } };
    const r = reglagesAvecGouts(REG, g);
    expect(r.punchlines).toBe(false);
    expect(r.dureeVisee).toEqual({ min: 720, max: 960 });
  });

  it('éclaircir garde une part régulière', () => {
    expect(eclaircir([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toEqual([1, 3, 5, 7, 9]);
    expect(eclaircir([1, 2, 3], 1.4)).toEqual([1, 2, 3]);
  });
});
