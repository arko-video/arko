import { describe, expect, it } from 'vitest';
import { recetteVide } from '../../recette/defauts';
import { normaliser } from '../../recette/normaliser';
import { SOURCE_TEST } from '../habillage/montage-test';
import { densitesVers, rythmeDe } from './rythme';

describe('rythme d\'un montage (E4a)', () => {
  it('par minute de vidéo finale', () => {
    const r = normaliser({ ...recetteVide(), sources: [SOURCE_TEST], plans: [{ de: 0, a: 20 }, { de: 30, a: 50, trans: 'flash' }, { de: 60, a: 80 }], zooms: [{ t: 5, force: 1.3 }], sons: [{ id: 'impact.boom', t: 10 }, { id: 'whoosh.rapide', t: 20 }] }).recette;
    const y = rythmeDe(r);
    expect(y.minutes).toBe(1);
    expect(y.coupes).toBe(2);
    expect(y.transitions).toBe(1);
    expect(y.sons).toBe(2);
    expect(y.zooms).toBe(1);
    expect(y.plan).toBe(20);
  });

  it('densités pour copier un modèle (E4c)', () => {
    const base = { minutes: 10, coupes: 20, zooms: 2, sons: 2, memes: 0.5, textes: 3, transitions: 0, plan: 3 };
    const d = densitesVers({ ...base, sons: 6, memes: 0, transitions: 0 }, base);
    expect(d.bruitages).toBe(2.9);
    expect(d.memes).toBe(0.25);
    expect(d.transitions).toBeUndefined();
    expect(d.zooms).toBe(1);
  });
});
