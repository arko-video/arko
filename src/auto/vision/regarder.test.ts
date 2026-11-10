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

describe('menus gardés quand on y réagit', () => {
  it('un rire dans un menu de 40 s : 10 s gardées autour, le reste reste mort', () => {
    const avec = { ...s, rires: [{ de: 20, a: 21, t: 20, force: 1 }] } as unknown as SignauxSource;
    const r = avecRegard(avec, [{ de: 0, a: 40, vu: 'menu' }]);
    expect(r.muets.filter((m) => m.vu)).toEqual([{ de: 0, a: 14, vu: 'menu' }, { de: 24, a: 40, vu: 'menu' }]);
    // Un menu muet entier reste mort ; un bout trop court (moins de 6 s) n'est plus coupé.
    expect(avecRegard({ ...avec, rires: [{ de: 5, a: 6, t: 5, force: 1 }] } as unknown as SignauxSource, [{ de: 0, a: 12, vu: 'menu' }]).muets.filter((m) => m.vu)).toEqual([]);
  });
});

describe('garde-fou du regard', () => {
  it('plus de 35 % de la vidéo en menus : ignoré, et c\'est dit', async () => {
    const { definirRegard, preparerRegard, messageRegard } = await import('./regarder');
    const source = { infos: { emp: 'e', id: 'v', duree: 100 } } as never;
    definirRegard(async () => [{ de: 0, a: 80, vu: 'menu' }]);
    const r = await preparerRegard(source);
    expect(r.ignore).toBe(true);
    expect(r.zones).toEqual([]);
    expect(messageRegard(r)).toContain('80 %');
    definirRegard(async () => [{ de: 0, a: 12, vu: 'bureau' }]);
    const ok = await preparerRegard(source);
    expect(ok.zones).toHaveLength(1);
    expect(messageRegard(ok)).toContain('1 passage');
    definirRegard(null);
  });
});
