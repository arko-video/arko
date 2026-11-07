// Opérations des persos (dev-persos) : émotion d'un passage (menu « Émotion » sous chaque phrase de « Qui parle ? »),
// un seul Annuler ; « parle » = l'émotion d'office (la situation choisit alors la sienne).
import { describe, expect, it } from 'vitest';
import { emotionAvecSituation } from '../chibis/persos/situations';
import { annuler, nouvelHistorique, pousser } from './historique';
import { normaliser } from './normaliser';
import { emotionDe, emotionDuPassage, situationDuPassage } from './operations-chibis';
import type { Recette, Source } from './types';

const s1: Source = { id: 's1', nom: 'live.mp4', taille: 1e9, emp: 'e1', duree: 3600, type: 'video', l: 1920, h: 1080 };
const s2: Source = { ...s1, id: 's2', emp: 'e2' };
const base = (): Recette =>
  normaliser({
    format: 'arko.recette/1', sources: [s1, s2], plans: [{ de: 0, a: 60 }],
    personnes: [{ id: 'p1', nom: 'Guts' }, { id: 'p2', nom: 'Romain' }],
    paroles: [{ ts: 1, fin: 3, p: 'p1', emo: 'surpris' }, { ts: 3, fin: 5, p: 'p2' }, { ts: 6, fin: 8, p: 'p1', sit: 'bombe' }, { ts: 1, fin: 3, p: 'p2', src: 's2' }],
  }, { sources: [s1, s2] }).recette;

/** Émotions dans l'ordre : p1 1–3, p2 3–5, p1 6–8 (vidéo 1), p2 1–3 (vidéo 2). */
const emos = (r: Recette) => {
  const t = r.paroles!;
  const un = (ts: number, p: string, src?: string) => t.find((x) => x.ts === ts && x.p === p && x.src === src)!;
  return [un(1, 'p1'), un(3, 'p2'), un(6, 'p1'), un(1, 'p2', 's2')];
};

describe('emotionDuPassage', () => {
  it('donne l\'émotion aux phrases qui chevauchent le passage (la vidéo choisie seulement)', () => {
    const r = emotionDuPassage(base(), 3.5, 4.5, 'hurle');
    expect(emos(r).map((t) => t.emo)).toEqual(['surpris', 'hurle', undefined, undefined]);
    expect(emotionDe(r, 3.5, 4.5)).toBe('hurle');
    const s = emotionDuPassage(base(), 1.5, 2, 'rit', 's2');
    expect(emos(s).map((t) => t.emo)).toEqual(['surpris', undefined, undefined, 'rit']);
  });

  it('« parle » retire l\'émotion : la situation de la phrase choisit la sienne (règle de partout)', () => {
    const r = emotionDuPassage(emotionDuPassage(base(), 6.5, 7, 'frime'), 6.5, 7, 'parle');
    const bombe = emos(r)[2]!;
    expect(bombe).not.toHaveProperty('emo');
    expect(emotionAvecSituation(bombe.emo, bombe.sit)).toBe('panique');
    expect(emotionDe(r, 1, 3)).toBe('surpris');
    expect(emotionDe(r, 20, 30)).toBe('parle');
  });

  it('rien ne change (même émotion, aucun tour, passage vide) : la recette d\'origine', () => {
    const r0 = base();
    expect(emotionDuPassage(r0, 1.5, 2, 'surpris')).toBe(r0);
    expect(emotionDuPassage(r0, 20, 30, 'rit')).toBe(r0);
    expect(emotionDuPassage(r0, 4, 4, 'rit')).toBe(r0);
  });

  it('un seul Annuler revient à l\'émotion d\'avant ; la situation reste à part', () => {
    const r0 = base();
    let h = nouvelHistorique(r0);
    h = pousser(h, emotionDuPassage(r0, 1, 8, 'crie'));
    expect(emos(h.present).slice(0, 3).every((t) => t.emo === 'crie')).toBe(true);
    expect(annuler(h).present).toBe(r0);
    const avecSit = situationDuPassage(emotionDuPassage(r0, 3, 5, 'rit'), 3, 5, 'peche');
    expect(emos(avecSit)[1]).toMatchObject({ emo: 'rit', sit: 'peche' });
  });
});
