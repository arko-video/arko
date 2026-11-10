import { describe, expect, it } from 'vitest';
import PHRASES from './phrases-vision.json';
import { entreeClip, genresImage, zonesMortes, type ImageRegardee } from './regard';

const img = (t: number, jeu: number): ImageRegardee => ({ t, jeu, genre: jeu >= 0.58 ? 'jeu' : 'menu' });

describe('Arko regarde l\'image', () => {
  it('une image proche d\'une phrase « jeu » est du jeu ; proche de « bureau », du bureau', () => {
    const jeu = (PHRASES as { genre: string; v: number[] }[]).find((p) => p.genre === 'jeu')!.v;
    const bureau = (PHRASES as { genre: string; v: number[] }[]).find((p) => p.genre === 'bureau')!.v;
    expect(genresImage(jeu).jeu).toBeGreaterThan(0.5);
    expect(genresImage(bureau).bureau).toBeGreaterThan(0.5);
  });

  it('entrée de CLIP : 3 × 224 × 224, normalisée', () => {
    const rgba = new Uint8ClampedArray(224 * 224 * 4).fill(255);
    const x = entreeClip(rgba);
    expect(x.length).toBe(3 * 224 * 224);
    expect(x[0]).toBeCloseTo((1 - 0.48145466) / 0.26862954, 4);
  });

  it('zones mortes : 2 images de suite au moins, 6 s au moins ; jamais une image seule', () => {
    const l = [img(0, 0.1), img(3, 0.2), img(6, 0.9), img(9, 0.3), img(12, 0.8), img(15, 0.4), img(18, 0.5), img(21, 0.45), img(24, 0.9)];
    const z = zonesMortes(l, 30);
    expect(z.map((x) => [x.de, x.a])).toEqual([[13.5, 22.5]]);
    expect(zonesMortes([img(0, 0.9), img(3, 0.2), img(6, 0.9)], 10)).toEqual([]);
  });
});
