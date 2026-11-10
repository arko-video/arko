// Placement des persos de qui parle (7/11/2026) : 16:9, 9:16, 1:1, de 1 à 4 voix, sans chevauchement, hors des
// zones de TikTok, au-dessus des sous-titres ; une punchline qui toucherait un perso le fait rétrécir / se décaler ;
// rien pendant un plan inséré plein écran ; la même voix garde sa place.
import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { TIKTOK, YOUTUBE } from '../../recette/destination';
import { normaliser } from '../../recette/normaliser';
import type { PlaceAvatar, Recette } from '../../recette/types';
import { avatarsAffiches, placerAvatars, placesAuto } from './avatars';
import { boitePerso, eviterTextes, placeAuto, recouvrement, type Boite } from './places-persos';

const CARRE = { l: 1080, h: 1080 };
const places = (n: number, gab: { l: number; h: number }, yST: number | null = null) => Array.from({ length: n }, (_, r) => placeAuto(r, n, gab, true, yST));
const aucunChevauchement = (liste: PlaceAvatar[], gab: { l: number; h: number }) => {
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) expect(recouvrement(boitePerso(liste[i]!, gab), boitePerso(liste[j]!, gab)), `${i} et ${j}`).toBe(0);
};

describe('places automatiques', () => {
  it('16:9 : en bas, au-dessus de l\'interface du jeu ; voix 1 à gauche, voix 2 à droite, 3 et 4 à côté, sans chevauchement (1 à 4 voix)', () => {
    for (const n of [1, 2, 3, 4]) {
      const l = places(n, YOUTUBE);
      expect(l.every((p) => p.y === 1 && p.taille <= 0.42)).toBe(true);
      expect(l[0]!.x).toBe(0.13);
      if (n >= 2) expect(l[1]!.x).toBe(0.87);
      if (n >= 3) expect(l[2]!.x).toBeGreaterThan(l[0]!.x);
      if (n >= 4) expect(l[3]!.x).toBeLessThan(l[1]!.x);
      aucunChevauchement(l, YOUTUBE);
      for (const p of l) expect(boitePerso(p, YOUTUBE).x0).toBeGreaterThanOrEqual(0);
    }
    // Beaucoup de voix : plus petites, toujours sans chevauchement.
    const huit = places(8, YOUTUBE);
    aucunChevauchement(huit, YOUTUBE);
    expect(huit[0]!.taille).toBeLessThan(0.3);
  });

  it('9:16 : plus petits, au-dessus des sous-titres, hors du bas (20 %) et de la bande de droite (15 %) ; 1 à 4 voix', () => {
    for (const n of [1, 2, 3, 4]) {
      const l = places(n, TIKTOK, 0.66);
      aucunChevauchement(l, TIKTOK);
      for (const p of l) {
        const b = boitePerso(p, TIKTOK);
        expect(p.taille).toBeLessThan(0.16);
        expect(b.y1).toBeLessThanOrEqual(0.66 - 0.045); // pieds au-dessus de la ligne de sous-titres
        expect(b.y1).toBeLessThanOrEqual(0.8);
        expect(b.x1).toBeLessThanOrEqual(0.85);
        expect(b.x0).toBeGreaterThanOrEqual(0);
      }
      expect(l[0]!.x).toBeLessThan(0.2);
      if (n >= 2) expect(l[1]!.x).toBeGreaterThan(0.6); // la voix 2 plus à droite
    }
    // Sans sous-titres en bas : au-dessus de la zone cachée seulement.
    expect(placeAuto(0, 2, TIKTOK, true, null).y).toBeLessThanOrEqual(0.8);
    expect(placeAuto(0, 2, TIKTOK, true, 0.3).y).toBeLessThanOrEqual(0.8);
  });

  it('1:1 : en bas collés au bord, plus petits qu\'en 16:9, sans chevauchement', () => {
    for (const n of [1, 2, 3, 4]) {
      const l = places(n, CARRE);
      aucunChevauchement(l, CARRE);
      expect(l.every((p) => p.y === 1 && p.taille <= 0.22)).toBe(true);
      expect(l[0]!.x).toBeLessThan(0.5);
      if (n >= 2) expect(l[1]!.x).toBeGreaterThan(0.5);
    }
  });
});

describe('évitement des punchlines', () => {
  it('16:9 : une punchline large en bas → le perso rétrécit / se décale vers le bord et ne la touche plus', () => {
    const p = placeAuto(0, 2, YOUTUBE, true);
    const punch: Boite = { x0: 0.13, x1: 0.87, y0: 0.74, y1: 0.86 };
    expect(recouvrement(boitePerso(p, YOUTUBE), punch)).toBeGreaterThan(0);
    const q = eviterTextes(p, [punch], YOUTUBE);
    expect(recouvrement(boitePerso(q, YOUTUBE), punch)).toBe(0);
    expect(q.taille).toBeGreaterThanOrEqual(p.taille * 0.78);
    expect(q.x).toBeLessThanOrEqual(p.x);
    expect(q.y).toBe(1); // toujours collé au bord
  });
  it('9:16 : une punchline sur 2 rangées qui monte jusqu\'aux pieds → le perso monte un peu', () => {
    const p = placeAuto(1, 2, TIKTOK, true, 0.66);
    const punch: Boite = { x0: 0.08, x1: 0.92, y0: 0.58, y1: 0.74 };
    const q = eviterTextes(p, [punch], TIKTOK);
    expect(recouvrement(boitePerso(q, TIKTOK), punch)).toBe(0);
    expect(q.y).toBeLessThan(p.y);
    expect(q.x).toBe(p.x); // jamais vers la bande de droite de TikTok
  });
  it('aucun texte : place inchangée', () => {
    const p = placeAuto(0, 2, TIKTOK, true, 0.66);
    expect(eviterTextes(p, [], TIKTOK)).toBe(p);
    expect(eviterTextes(p, [{ x0: 0.3, x1: 0.7, y0: 0.1, y1: 0.2 }], TIKTOK)).toBe(p);
  });
});

const sources = [{ id: 's1', nom: 'v', taille: 1, emp: '', duree: 120, type: 'video' as const, l: 1920, h: 1080 }];
function recette(o: Record<string, unknown> = {}): Recette {
  return normaliser(
    {
      format: 'arko.recette/1', sources, destination: 'youtube', plans: [{ de: 0, a: 20 }, { de: 20, a: 40 }],
      personnes: [{ id: 'p1', nom: 'Moi' }, { id: 'p2', nom: 'Guts' }],
      paroles: [{ ts: 2, fin: 30, p: 'p1' }, { ts: 3, fin: 30, p: 'p2' }],
      avatars: { mode: 'parle', rebond: true },
      ...o,
    },
    { sources },
  ).recette;
}

describe('dans le rendu', () => {
  it('pas de perso pendant un plan inséré plein écran (carton, perso plein écran)', () => {
    const r = recette();
    const sc = compiler(r);
    const pl = placerAvatars(r, sc);
    expect(avatarsAffiches(r, pl, 10, sc, { plan: sc.plans[0]!, sousTitres: null })).toHaveLength(2);
    const carton = { ...sc.plans[0]!, src: '', ins: { type: 'carton' as const, txt: 'Plus tard' } };
    expect(avatarsAffiches(r, pl, 10, sc, { plan: carton, sousTitres: null })).toEqual([]);
  });
  it('une même voix garde la même place dans tout le montage, en 16:9 comme en 9:16', () => {
    for (const destination of ['youtube', 'tiktok'] as const) {
      const r = recette({ destination });
      const sc = compiler(r);
      const pl = placerAvatars(r, sc);
      const a = avatarsAffiches(r, pl, 5, sc);
      const b = avatarsAffiches(r, pl, 25, sc);
      expect(a.map((v) => [v.p, v.place])).toEqual(b.map((v) => [v.p, v.place]));
      expect(placesAuto(r, sc.gab, null).get('p1')!.x).toBeLessThan(placesAuto(r, sc.gab, null).get('p2')!.x);
    }
  });
  it('une place choisie à la main est gardée', () => {
    const r = recette({ personnes: [{ id: 'p1', nom: 'Moi', place: { x: 0.5, y: 0.5, taille: 0.2 } }, { id: 'p2', nom: 'Guts' }] });
    expect(placesAuto(r, YOUTUBE, null).get('p1')).toEqual({ x: 0.5, y: 0.5, taille: 0.2 });
    expect(placesAuto(r, YOUTUBE, null).get('p2')!.x).toBe(0.87);
  });
});
