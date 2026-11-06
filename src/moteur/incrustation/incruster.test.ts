// Ma bibliothèque dans LE rendu : le son d'un mème « Coupure » et d'un fond vert, mixés comme à l'export (rendu.audio
// par blocs), avec des sources FABRIQUÉES (jeu à 440 Hz, mème à 1 000 Hz, fond vert à 3 000 Hz) ; placement à l'écran.

import { describe, expect, it } from 'vitest';
import { normaliser } from '../../recette/normaliser';
import { ajouterIncrustation, insererMeme, modifierIncrustation } from '../../recette/operations-bibliotheque';
import type { Recette, Source } from '../../recette/types';
import { LecteurAudio } from '../audio/lecteur-audio';
import { CacheDecodage } from '../cache-decodage';
import type { MediaOuvert } from '../media';
import { rendre } from '../rendre';
import { rectIncrustation, tailleTravail, visibles } from './incruster';

const F = 48000;
const s1: Source = { id: 's1', nom: 'jeu.mp4', taille: 1, emp: 'e1', duree: 60, type: 'video', l: 1920, h: 1080 };
const meme: Source = { id: 'b1', nom: 'bruh.mp4', taille: 1, emp: 'e2', duree: 3, type: 'video', l: 1280, h: 720, bib: 'v1' };
const vert: Source = { id: 'b2', nom: 'abonne.mp4', taille: 1, emp: 'e3', duree: 5, type: 'video', l: 1920, h: 1080, bib: 'v2' };
const FREQ: Record<string, number> = { s1: 440, b1: 1000, b2: 3000 };

/** Son fabriqué d'une source : un sinus à sa fréquence, en morceaux de 0,1 s (comme un décodeur). */
function sinkDe(id: string, duree: number) {
  return {
    async *samples(debut: number) {
      for (let t = Math.floor(debut * 10) / 10; t < duree; t += 0.1) {
        const n = 4800;
        yield {
          timestamp: t, numberOfFrames: n, numberOfChannels: 1, sampleRate: F,
          copyTo(d: Float32Array) {
            for (let k = 0; k < n; k++) d[k] = 0.3 * Math.sin(2 * Math.PI * FREQ[id]! * (t + k / F));
          },
          close() {},
        };
      }
    },
  };
}

async function mixer(r: Recette): Promise<Float32Array> {
  const medias = new Map<string, MediaOuvert>(r.sources.map((s) => [s.id, { id: s.id, duree: s.duree } as unknown as MediaOuvert]));
  const cache = new CacheDecodage({ video: () => null, audio: (m) => new LecteurAudio(sinkDe((m as unknown as { id: string }).id, m.duree) as never) });
  const rendu = rendre(r, medias, cache);
  const total = Math.round(rendu.duree * F);
  const g = new Float32Array(total);
  for (let k = 0; k < total; k += 12_000) g.set((await rendu.audio(k / F, Math.min(12_000, total - k)))[0]!, k);
  await rendu.fermer();
  await cache.fermer();
  return g;
}

/** Amplitude de la fréquence f entre de et a (Goertzel simplifié). */
function amplitude(pcm: Float32Array, de: number, a: number, f: number): number {
  const [i0, i1] = [Math.round(de * F), Math.round(a * F)];
  let re = 0;
  let im = 0;
  for (let i = i0; i < i1; i++) {
    re += pcm[i]! * Math.cos((2 * Math.PI * f * i) / F);
    im += pcm[i]! * Math.sin((2 * Math.PI * f * i) / F);
  }
  return (2 * Math.hypot(re, im)) / (i1 - i0);
}

const base = () => normaliser({ sources: [s1], plans: [{ de: 10, a: 13 }] }).recette;

describe('son des clips de Ma bibliothèque', () => {
  it('mème « Coupure » : le jeu, puis le son du mème pendant sa durée, puis le jeu reprend', async () => {
    const r = insererMeme(base(), 1, meme, 0.5, 1.5).recette;
    expect(r.plans.map((p) => p.src ?? 's1')).toEqual(['s1', 'b1', 's1']);
    const pcm = await mixer(r);
    expect(pcm.length).toBe(4 * F);
    expect(amplitude(pcm, 0.1, 0.9, 440)).toBeGreaterThan(0.2);
    expect(amplitude(pcm, 1.1, 1.9, 1000)).toBeGreaterThan(0.2);
    expect(amplitude(pcm, 1.1, 1.9, 440)).toBeLessThan(0.02);
    expect(amplitude(pcm, 2.1, 3.9, 440)).toBeGreaterThan(0.2);
    expect(amplitude(pcm, 2.1, 3.9, 1000)).toBeLessThan(0.02);
  });

  it('fond vert : son du clip par-dessus le jeu pendant sa durée gardée, au volume réglé ; coupé avec « son : non »', async () => {
    const r = ajouterIncrustation(base(), { src: 'b2', t: 0.5, de: 2, a: 3 }, vert).recette;
    const pcm = await mixer(r);
    expect(amplitude(pcm, 0.6, 1.4, 3000)).toBeGreaterThan(0.2);
    expect(amplitude(pcm, 0.6, 1.4, 440)).toBeGreaterThan(0.2); // le jeu continue dessous
    expect(amplitude(pcm, 0, 0.45, 3000)).toBeLessThan(0.01);
    expect(amplitude(pcm, 1.55, 2.9, 3000)).toBeLessThan(0.01); // rien après la fin gardée
    const moitie = await mixer(modifierIncrustation(r, 0, { vol: 0.5 }));
    expect(amplitude(moitie, 0.6, 1.4, 3000) / amplitude(pcm, 0.6, 1.4, 3000)).toBeCloseTo(0.5, 1);
    const muet = await mixer(modifierIncrustation(r, 0, { son: false }));
    expect(amplitude(muet, 0.6, 1.4, 3000)).toBeLessThan(0.01);
  });
});

describe('placement à l\'écran', () => {
  const env = { l: 1080, h: 1920 };
  it('petit : centre et largeur réglés ; plein écran : recouvre toute l\'image', () => {
    expect(rectIncrustation({ src: 'b', t: 0, de: 0, a: 1, x: 0.75, y: 0.25, taille: 0.4 }, 1280, 720, env)).toEqual({ x: 594, y: 358.5, l: 432, h: 243 });
    const p = rectIncrustation({ src: 'b', t: 0, de: 0, a: 1, plein: true }, 1920, 1080, env);
    expect(p.h).toBe(1920);
    expect(p.l).toBeCloseTo(3413.3, 0);
    expect(p.x).toBeCloseTo(-1166.7, 0);
  });

  it('taille de travail = taille affichée, jamais plus que le clip ni 1920 px', () => {
    expect(tailleTravail({ x: 0, y: 0, l: 432, h: 243 }, 1280, 720)).toEqual({ l: 432, h: 243 });
    expect(tailleTravail({ x: 0, y: 0, l: 3413, h: 1920 }, 1920, 1080)).toEqual({ l: 1920, h: 1080 });
    expect(tailleTravail({ x: 0, y: 0, l: 5000, h: 5000 }, 3840, 3840)).toEqual({ l: 1920, h: 1920 });
  });

  it('visibles pendant [t, t + (a − de)[ seulement', () => {
    const l = [{ src: 'b', t: 1, de: 2, a: 3 }];
    expect(visibles(l, 0.99)).toEqual([]);
    expect(visibles(l, 1)).toEqual([0]);
    expect(visibles(l, 1.99)).toEqual([0]);
    expect(visibles(l, 2)).toEqual([]);
  });
});
