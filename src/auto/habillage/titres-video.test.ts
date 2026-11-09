import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import { indicesVideo, proposerTitres, textesMiniature } from './titres-video';

const mots = (texte: string): Mot[] => texte.split(' ').map((w, i) => [w, i, i + 0.4]);

describe('titres de vidéo proposés', () => {
  const m = mots('bon on lance minecraft one block on va tenir 100 jours le creeper arrive le creeper encore ce creeper');

  it('repère le jeu, le mode, les jours et le sujet', () => {
    expect(indicesVideo(m)).toEqual({ jeu: 'Minecraft', mode: 'ONE BLOCK', jours: 100, sujet: 'creeper' });
  });

  it('« 100 Jours sur Minecraft ONE BLOCK ! » en premier, 5 titres au plus, 70 caractères au plus', () => {
    const t = proposerTitres(m);
    expect(t[0]).toBe('100 Jours sur Minecraft ONE BLOCK !');
    expect(t.length).toBeLessThanOrEqual(5);
    expect(t.every((x) => x.length <= 70)).toBe(true);
  });

  it('sans rien reconnaître : des titres quand même', () => {
    expect(proposerTitres(mots('salut ça va')).length).toBeGreaterThan(1);
    expect(textesMiniature(m)).toContain('100 JOURS');
  });
});
