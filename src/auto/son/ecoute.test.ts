import { describe, expect, it } from 'vitest';
import PHRASES from './phrases-sons.json';
import { dixSecondes, entreeClap, genreDuSon, NB_TRAMES } from './ecoute';

describe('Arko écoute tes sons (CLAP)', () => {
  it('même préparation que CLAP (valeurs de transformers, sinus 440 Hz)', () => {
    const t = Array.from({ length: 24000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48000));
    const x = entreeClap(Float32Array.from(t));
    expect(x.length).toBe(NB_TRAMES * 64);
    const v = (i: number, j: number) => x[i * 64 + j]!;
    expect(v(0, 0)).toBeCloseTo(8.628, 1);
    expect(v(0, 5)).toBeCloseTo(21.427, 1);
    expect(v(10, 3)).toBeCloseTo(-17.759, 1);
    expect(v(500, 4)).toBeCloseTo(-7.272, 1);
    expect(v(1000, 63)).toBeCloseTo(-48.831, 0);
  });

  it('un son court est répété jusqu\'à 10 s', () => {
    const r = dixSecondes(Float32Array.from([1, 2, 3]));
    expect(r.length).toBe(480000);
    expect(Array.from(r.subarray(0, 7))).toEqual([1, 2, 3, 1, 2, 3, 1]);
  });

  it('une empreinte proche de « rire » est rangée en rire ; trop floue : rien', () => {
    const rire = (PHRASES as { genre: string; v: number[] }[]).find((p) => p.genre === 'rire')!.v;
    expect(genreDuSon(rire).genre).toBe('rire');
    expect(genreDuSon(new Array(512).fill(0)).genre).toBeNull();
  });
});

describe('le choix des sons se sert de l\'écoute quand le nom ne dit rien', () => {
  it('accents : le nom passe d\'abord, puis le son entendu ; bruitages : pareil', async () => {
    const { sonsAccent } = await import('./accents');
    const { sonsPossibles } = await import('./choix-son');
    const son = (id: string, nom: string, ecoute?: string) => ({ id, nom, etiquette: '', duree: 1, type: 'audio/mpeg', taille: 1, ajouteLe: 0, ...(ecoute ? { ecoute } : {}) });
    const sons = [son('a', 'son1', 'impact'), son('b', 'Vine boom'), son('c', 'son2', 'rire')];
    expect(sonsAccent('impact', sons).map((s) => s.id)).toEqual(['b', 'a']);
    expect(sonsPossibles('rire', sons).map((s) => s.id)).toEqual(['c']);
  });
});
