import { describe, expect, it } from 'vitest';
import { apprendre, cleNom, comparer, GOUTS_DEPART, lireGouts, rejete, resumeGouts, type Empreinte } from './gouts';

const el = (f: Empreinte['elements'][number]['f'], t: number, nom: string, auto = true) => ({ f, t, nom, auto });

describe('apprentissage des goûts', () => {
  const auto: Empreinte = {
    duree: 600,
    elements: [el('bruitages', 10, 'bruh'), el('bruitages', 50, 'vine boom'), el('bruitages', 90, 'bruh'), el('bruitages', 130, 'fart'), el('memes', 70, 'shrek crying'), el('accents', 20, 'swoosh'), el('accents', 40, 'swoosh')],
  };

  it('gardés, retirés, ajoutés à la main', () => {
    const fin: Empreinte = { duree: 600, elements: [el('bruitages', 10, 'bruh'), el('bruitages', 90, 'bruh'), el('memes', 70, 'shrek crying'), el('memes', 200, 'staring meme', false), el('accents', 20, 'swoosh'), el('accents', 40, 'swoosh')] };
    const o = comparer(auto, fin);
    expect(o.par.bruitages).toEqual({ proposes: 4, gardes: 2, ajoutes: 0 });
    expect(o.par.memes).toEqual({ proposes: 1, gardes: 1, ajoutes: 1 });
    expect(o.retires.sort()).toEqual(['fart', 'vine boom']);
  });

  it('les densités bougent de moitié, un son retiré 2 fois n\'est plus proposé, le résumé le dit', () => {
    const fin: Empreinte = { duree: 540, elements: [el('bruitages', 10, 'bruh'), el('memes', 70, 'shrek crying'), el('memes', 200, 'staring meme', false)] };
    let g = apprendre(GOUTS_DEPART, comparer(auto, fin));
    expect(g.densite.bruitages).toBeCloseTo(0.63, 2);
    expect(g.densite.memes).toBeCloseTo(1.5, 2);
    expect(g.densite.accents).toBeCloseTo(0.5, 2);
    expect(rejete(g, 'fart')).toBe(false);
    g = apprendre(g, comparer(auto, fin));
    expect(rejete(g, 'FART.mp3')).toBe(true);
    expect(g.n).toBe(2);
    expect(resumeGouts(g).join(' · ')).toMatch(/Moins de bruitages.*Plus de mèmes/);
  });

  it('relecture sûre et clés de noms stables', () => {
    expect(lireGouts('pas du json')).toEqual(GOUTS_DEPART);
    const g = apprendre(GOUTS_DEPART, comparer(auto, auto));
    expect(lireGouts(JSON.stringify(g))).toEqual(g);
    expect(cleNom('Bruh - Sound Effect (HD).mp3')).toBe(cleNom('bruh sound effect hd'));
  });
});

describe('apprendre des coupes (E3)', () => {
  it('Romain garde 0,2 s de plus avant les mots et coupe 0,1 s plus tôt après : les marges suivent de moitié', async () => {
    const { margesObservees } = await import('./gouts');
    const auto = [{ de: 10, a: 12 }, { de: 20, a: 23 }, { de: 30, a: 31 }];
    const fin = auto.map((p) => ({ de: p.de - 0.2, a: p.a - 0.1 }));
    const m = margesObservees(auto, fin);
    expect(m).toEqual({ avant: 0.2, apres: -0.1, n: 3 });
    const base = { duree: 100, elements: [] };
    const g = apprendre(GOUTS_DEPART, comparer({ ...base, plans: auto }, { ...base, plans: fin }));
    expect(g.marges).toEqual({ avant: 0.1, apres: -0.05 });
    expect(lireGouts(JSON.stringify(g)).marges).toEqual({ avant: 0.1, apres: -0.05 });
  });
});

describe('exemples pour le monteur IA (D1)', () => {
  it('compact : retirés, ajoutés à la main, durée, marges', async () => {
    const { exempleDe } = await import('./gouts');
    const auto: Empreinte = { duree: 100, elements: [el('bruitages', 10, 'fart'), el('bruitages', 30, 'bruh')] };
    const fin: Empreinte = { duree: 90, elements: [el('bruitages', 30, 'bruh'), el('memes', 50, 'staring meme', false)] };
    const x = exempleDe(comparer(auto, fin), '2026-11-09');
    expect(x.retires).toEqual(['fart']);
    expect(x.ajoutes).toEqual(['staring meme']);
    expect(x.dureeRatio).toBe(0.9);
    expect(JSON.stringify(x).length).toBeLessThan(800);
  });
});
