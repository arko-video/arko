// E. Mode PRUDENT des bruitages (par défaut, après le retour de Romain du 6/11/2026) : posés sur la réaction (après
// la phrase, ou au rire / cri qui suit), jamais par-dessus la parole ; seulement les déclencheurs très sûrs ;
// 1 toutes les 2 minutes au plus.

import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import type { SignauxSource } from '../types';
import { BRUITAGES, proposerBruitages } from './bruitages';
import { DECLENCHEURS_DEFAUT } from './declencheurs';
import { placerSurReaction, REACTION } from './reaction';

function phrase(texte: string, t: number): Mot[] {
  return texte.split(' ').map((m, i) => [m, Math.round((t + i * 0.4) * 100) / 100, Math.round((t + i * 0.4 + 0.3) * 100) / 100] as Mot);
}

function signaux(o: Partial<SignauxSource> = {}): SignauxSource {
  return { src: 's1', duree: 900, pas: 0.02, rms: new Float32Array(45000).fill(0.01), pics: [], cris: [], rires: [], muets: [], ...o };
}

const proposer = (mots: Mot[], s: SignauxSource | null = null) => proposerBruitages(mots, 's1', s, DECLENCHEURS_DEFAUT);

describe('bruitages prudents (par défaut)', () => {
  it('réglages : 1 toutes les 2 minutes, sûreté 4', () => {
    expect(BRUITAGES.parMinute).toBe(0.5);
    expect(BRUITAGES.seuilSurete).toBe(4);
  });

  it('posé APRÈS la fin de la phrase (+0,15 s), jamais sur le mot ; coupé avant que quelqu\'un reparle', () => {
    // « on a gagné les gars » finit à 11,9 ; la phrase suivante commence à 13.
    const mots = [...phrase('on a gagné les gars.', 10), ...phrase('bon on continue', 13)];
    const [p] = proposer(mots);
    expect(p).toMatchObject({ categorie: 'reussite', ts: 12.05 });
    expect(p!.ts).toBeGreaterThan(mots[4]![2]);
    expect(p!.ts + p!.dur).toBeLessThanOrEqual(13);
  });

  it('au début du rire (ou du cri) qui suit la phrase', () => {
    const mots = [...phrase('je suis mort.', 50), ...phrase('bon', 58)];
    const s = signaux({ rires: [{ de: 51.6, a: 54, t: 52.5, force: 0.9 }] });
    expect(proposer(mots, s).map((p) => [p.categorie, p.ts])).toEqual([['wasted', 51.6]]);
  });

  it('la parole reprend tout de suite (moins de 0,8 s) : rien n\'est proposé', () => {
    const mots = [...phrase('on a gagné.', 10), ...phrase('et après on va au nether', 11.3)];
    expect(proposer(mots)).toEqual([]);
    expect(placerSurReaction(mots, 2, null)).toBeNull();
  });

  it('seulement les déclencheurs très sûrs : un mot seul doit être crié', () => {
    expect(proposer(phrase('wow regarde', 10))).toEqual([]);
    expect(proposer(phrase('wow!', 10)).map((p) => p.categorie)).toEqual(['wow']);
    // Juron crié, rire, silence gênant : plus jamais tout seuls.
    expect(proposer(phrase('putain!', 20), signaux({ pics: [{ ts: 20.1, db: -6, z: 5 }] }))).toEqual([]);
    expect(proposer([], signaux({ rires: [{ de: 30, a: 32, t: 31, force: 1 }] }))).toEqual([]);
  });

  it('1 toutes les 2 minutes au plus (les plus sûrs d\'abord)', () => {
    const mots = [0, 30, 60, 90, 130, 300].flatMap((t) => phrase('on a gagné.', t));
    expect(proposer(mots).map((p) => Math.round(p.ts))).toEqual([1, 131, 301]);
  });

  it('la durée jouée ne dépasse jamais 4 s', () => {
    const [p] = proposer(phrase('allez à la prochaine', 100));
    expect(p!.dur).toBe(REACTION.durMax);
  });
});
