// Sous-titres de la voix faible (« Sous-titres pour ») : tenue des lignes « boîte » (intégrateur, demande de
// dev-persos) — 0,4 s après le dernier mot, 0,7 s au moins, 2,8 s au plus, jamais sur la ligne suivante ni sur une
// punchline. Données fabriquées.

import { describe, expect, it } from 'vitest';
import { decouperLignes, type LignePlacee, type MotPlace } from './sous-titres-places';
import { avecLignesVoix, SOUS_TITRES_VOIX } from './sous-titres-voix';
import type { Mot, TourDeParole } from './types';

function mots(liste: [string, number, number][]): MotPlace[] {
  return liste.map(([txt, a, b], k) => ({ k, mot: [txt, a, b] as Mot, t0: a, t1: b }));
}
const decouper = (ms: MotPlace[], n: number, d: number) => decouperLignes(ms, n, undefined, d);

describe('sous-titres de la voix faible : tenue des lignes « boîte »', () => {
  const tours: TourDeParole[] = [{ ts: 0, fin: 30, p: 'p2' }];

  it('une ligne reste 0,4 s après son dernier mot (0,7 s au moins), en style boîte', () => {
    const ms = mots([['on', 1, 1.3], ['y', 1.4, 1.6], ['va', 1.7, 2.1], ['ok', 10, 10.2]]);
    const l = avecLignesVoix([], ms, tours, 'p2', 0.88, () => false, decouper);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ t0: 1, style: SOUS_TITRES_VOIX.style, y: 0.88 });
    expect(l[0]!.t1).toBeCloseTo(2.1 + SOUS_TITRES_VOIX.tenue, 5);
    expect(l[1]!.t1).toBeCloseTo(10.7, 5); // 0,2 s de mot + 0,4 = 0,6 < 0,7 → 0,7 s
  });

  it('jamais au-delà de 2,8 s, ni sur la ligne suivante ou une punchline', () => {
    const longue = mots([['a', 0, 0.4], ['b', 0.5, 0.9], ['c', 1, 1.4], ['d', 1.5, 1.9], ['e', 2, 2.7], ['f', 3.2, 3.5]]);
    const l = avecLignesVoix([], longue, tours, 'p2', 0.88, () => false, decouper);
    expect(l[0]!.t1 - l[0]!.t0).toBeLessThanOrEqual(SOUS_TITRES_VOIX.max + 1e-9);
    expect(l[0]!.t1).toBeLessThanOrEqual(l[1]!.t0 + 1e-9);
    const punch: LignePlacee[] = [{ k0: 99, k1: 100, t0: 2.3, t1: 4, mots: [] }];
    const avec = avecLignesVoix(punch, mots([['salut', 1, 2]]), tours, 'p2', 0.88, () => false, decouper);
    const boite = avec.find((x) => x.style === SOUS_TITRES_VOIX.style)!;
    expect(boite.t1).toBeCloseTo(2.3, 5);
  });
});
