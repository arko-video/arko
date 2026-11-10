import { describe, expect, it } from 'vitest';
import { avecRegard } from '../signaux-source';
import type { SignauxSource } from '../types';

const s: SignauxSource = { src: 'v', duree: 100, pas: 0.02, rms: new Float32Array(0), pics: [], cris: [], rires: [], muets: [{ de: 90, a: 100 }] };

describe('zones mortes vues à l\'image dans les passages muets', () => {
  it('ajoutées dans l\'ordre, et remplacées (pas doublées) si on regarde à nouveau', () => {
    const a = avecRegard(s, [{ de: 0, a: 15, vu: 'bureau' }]);
    expect(a.muets).toEqual([{ de: 0, a: 15, vu: 'bureau' }, { de: 90, a: 100 }]);
    const b = avecRegard(a, [{ de: 40, a: 50, vu: 'menu' }]);
    expect(b.muets).toEqual([{ de: 40, a: 50, vu: 'menu' }, { de: 90, a: 100 }]);
  });
});
