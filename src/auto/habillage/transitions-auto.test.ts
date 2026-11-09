import { describe, expect, it } from 'vitest';
import type { Recette } from '../../recette/types';
import type { SignauxSource } from '../types';
import { transitionsDesScenes } from './transitions-auto';

const recette = (plans: { de: number; a: number }[]) => ({ v: 1, sources: [], plans }) as unknown as Recette;
const signaux = (cris: number[]) => ({ cris: cris.map((t) => ({ t })), rires: [], pics: [] }) as unknown as SignauxSource;

describe('transitions automatiques (TikTok)', () => {
  const scenes = [{ de: 0, a: 10 }, { de: 20, a: 30 }, { de: 40, a: 50 }];
  const plans = [{ de: 0, a: 4 }, { de: 5, a: 9 }, { de: 20, a: 25 }, { de: 26, a: 29 }, { de: 40, a: 45 }];

  it('une transition à chaque changement de scène, jamais dans les jump cuts', () => {
    const r = transitionsDesScenes(recette(plans), scenes, null);
    const t = r.plans.map((p) => (p.trans ? (typeof p.trans === 'string' ? p.trans : p.trans.type) : null));
    expect(t[0]).toBeNull();
    expect(t[1]).toBeNull();
    expect(t[2]).not.toBeNull();
    expect(t[3]).toBeNull();
    expect(t[4]).not.toBeNull();
    expect(t[2]).not.toBe(t[4]);
  });

  it('un cri au début de la scène → secousse ; sans bruitages, aucun son', () => {
    const r = transitionsDesScenes(recette(plans), scenes, signaux([40.5]));
    expect(r.plans[4]!.trans).toMatchObject({ type: 'secousse', son: false });
  });

  it('une seule scène : rien ne change', () => {
    const r0 = recette(plans);
    expect(transitionsDesScenes(r0, [scenes[0]!], null)).toBe(r0);
  });
});
