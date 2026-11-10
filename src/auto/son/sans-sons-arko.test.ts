import { describe, expect, it } from 'vitest';
import type { Recette } from '../../recette/types';
import { sansSonsArko } from './sans-sons-arko';

describe('jamais les sons d\'Arko dans un montage automatique', () => {
  it('retire les sons du catalogue et coupe le son d\'office des transitions ; garde ceux de la bibliothèque', () => {
    const r = {
      sources: [],
      plans: [{ de: 0, a: 5 }, { de: 5, a: 9, trans: { type: 'zoom' } }, { de: 9, a: 12, trans: { type: 'flash', son: 'a3' } }],
      sons: [{ id: 'whoosh.rapide', t: 1 }, { id: 'a1', t: 2 }, { id: 'impact.boom', ts: 3 }],
    } as unknown as Recette;
    const s = sansSonsArko(r);
    expect(s.sons!.map((x) => x.id)).toEqual(['a1']);
    expect(s.plans[1]!.trans).toEqual({ type: 'zoom', son: false });
    expect(s.plans[2]!.trans).toEqual({ type: 'flash', son: 'a3' });
  });
});
