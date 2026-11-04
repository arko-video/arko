// Moteur YouTube : taille et poids de la miniature, cascade 16:9 (débits conseillés par YouTube),
// assemblage intro + montage + outro dans le rendu unique, mise en page des textes en 16:9.

import { describe, expect, it } from 'vitest';
import { YOUTUBE } from '../recette/destination';
import { normaliser } from '../recette/normaliser';
import { FREQUENCE_SORTIE } from './audio/reechantillonner';
import { centreTexte, mettreEnPageTexte } from './couches/textes';
import { CASCADE, CASCADE_169, cascadePour, essaiPermis } from './export/cascade';
import { encoderSousLimite, MINIATURE, tailleMiniature } from './miniature';
import type { Rendu } from './rendre';
import { assembler, recetteGeneriqueVideo, type Segment } from './rendre-generiques';

describe('miniature', () => {
  it('1280 × 720 en 16:9, 1080 × 1920 pour un Short, 2 Mo au plus', () => {
    expect(tailleMiniature('youtube')).toEqual({ l: 1280, h: 720 });
    expect(tailleMiniature('short')).toEqual({ l: 1080, h: 1920 });
    expect(MINIATURE.maxOctets).toBe(2 * 1024 * 1024);
  });

  it('garde le PNG s\'il passe sous 2 Mo, sinon compresse en JPEG jusqu\'à passer', async () => {
    const appels: string[] = [];
    const faux = (tailles: Record<string, number>) => async (type: string, q?: number) => {
      appels.push(`${type}@${q ?? ''}`);
      return new Blob([new Uint8Array(tailles[`${type}@${q ?? ''}`] ?? 10)], { type });
    };
    const png = await encoderSousLimite(faux({ 'image/png@': 500_000 }), 'image/png');
    expect(png.type).toBe('image/png');
    appels.length = 0;
    const jpeg = await encoderSousLimite(faux({ 'image/png@': 5_000_000, 'image/jpeg@0.92': 2_500_000, 'image/jpeg@0.85': 1_900_000 }), 'image/png');
    expect(jpeg.type).toBe('image/jpeg');
    expect(jpeg.size).toBeLessThan(MINIATURE.maxOctets);
    expect(appels).toEqual(['image/png@', 'image/jpeg@0.92', 'image/jpeg@0.85']);
  });
});

describe('cascade 16:9', () => {
  it('débits conseillés par YouTube : 8 Mb/s en 1080p, 16 en 1440p, 5 en 720p', () => {
    expect(cascadePour(false)).toBe(CASCADE);
    const parQualite = (q: string) => CASCADE_169.filter((e) => e.qualite === q);
    expect(parQualite('1080p').every((e) => e.largeur === 1920 && e.debit === 8_000_000)).toBe(true);
    expect(parQualite('1440p').every((e) => e.largeur === 2560 && e.hauteur === 1440 && e.debit === 16_000_000)).toBe(true);
    expect(CASCADE_169.at(-1)).toMatchObject({ largeur: 1280, hauteur: 720, debit: 5_000_000 });
    expect(CASCADE_169.every((e, i) => e.rang === i)).toBe(true);
  });

  it('le 1440p n\'est essayé que si on le demande', () => {
    const e1440 = CASCADE_169[0]!;
    expect(essaiPermis(e1440, false, false)).toBe(false);
    expect(essaiPermis(e1440, false, true)).toBe(true);
    expect(essaiPermis(CASCADE_169.at(-1)!, true)).toBe(true);
  });
});

/** Segment de test : image = remplit un tableau, son = valeur constante. */
function segment(duree: number, valeur: number, vus: string[], nom: string): Segment {
  return {
    duree,
    image: async (t) => void vus.push(`${nom}@${t.toFixed(2)}`),
    audio: async (_t0, n) => [new Float32Array(n).fill(valeur), new Float32Array(n).fill(valeur)],
    fermer: async () => undefined,
  };
}

describe('intro + montage + outro dans le même rendu', () => {
  it('durée, image au bon endroit, son recollé sans trou', async () => {
    const vus: string[] = [];
    const corps = { ...segment(10, 0.5, vus, 'corps'), scenario: {} as Rendu['scenario'], effetsPrets: Promise.resolve() } as Rendu;
    const r = assembler(corps, segment(2, 0.1, vus, 'intro'), segment(5, 0.9, vus, 'outro'));
    expect(r.duree).toBe(17);
    const ctx = {} as never;
    const env = { l: 1920, h: 1080, echelle: 1 };
    await r.image(1, ctx, env);
    await r.image(2.5, ctx, env);
    await r.image(16, ctx, env);
    expect(vus).toEqual(['intro@1.00', 'corps@0.50', 'outro@4.00']);
    // Bloc à cheval sur la fin de l'intro (1,5 → 2,5 s).
    const n = FREQUENCE_SORTIE;
    const [g] = await r.audio(1.5, n);
    expect(g![0]).toBeCloseTo(0.1);
    expect(g![n / 2 - 1]).toBeCloseTo(0.1);
    expect(g![n / 2]).toBeCloseTo(0.5);
    expect(g![n - 1]).toBeCloseTo(0.5);
  });

  it('une vidéo d\'intro devient une mini-recette (un plan, fond flou, même destination)', () => {
    const s1 = { id: 's1', nom: 'a.mp4', taille: 1, emp: 'a', duree: 60, type: 'video' as const };
    const g1 = { id: 'g1', nom: 'i.mp4', taille: 1, emp: 'i', duree: 8, type: 'video' as const };
    const r = normaliser({ sources: [s1, g1], plans: [{ de: 0, a: 30 }], destination: 'youtube', intro: { src: 'g1', dur: 3 } }, { sources: [s1, g1] }).recette;
    const mini = recetteGeneriqueVideo(r, 'intro')!;
    expect(mini.plans).toEqual([{ src: 'g1', de: 0, a: 3 }]);
    expect(mini.destination).toBe('youtube');
    expect(recetteGeneriqueVideo(r, 'outro')).toBeNull();
  });
});

describe('textes en 16:9', () => {
  it('une accroche tient dans la zone sûre YouTube (référence 1920 × 1080)', () => {
    const mp = mettreEnPageTexte('Il ne s\'attendait pas du tout à ça, regarde bien', 'accroche', YOUTUBE)!;
    expect(mp.l).toBeLessThanOrEqual(YOUTUBE.largeurTexte);
    const { cx, cy } = centreTexte(mp, 0.5, 0.97, YOUTUBE);
    expect(cx).toBe(960);
    expect(cy + mp.h / 2).toBeLessThanOrEqual((1 - YOUTUBE.zone.bas) * 1080 + 0.01);
  });
});
