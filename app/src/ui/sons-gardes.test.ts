// Reprise d'un projet avec des sons : un son introuvable est retiré de la recette, avec un message.
import { describe, expect, it, vi } from 'vitest';
import { recetteVide } from '../recette/defauts';
import type { Recette } from '../recette/types';

vi.mock('../moteur/api', () => ({
  sauverFichierAudio: vi.fn(async () => {}),
  rouvrirSourcesAudio: vi.fn(async () => ({ sources: [], manquants: ['a1', 'a2'] })),
}));

const { rouvrirSons } = await import('./sons-gardes');

function recette(): Recette {
  const r = recetteVide();
  r.sources = [
    { id: 's1', nom: 'clip.mp4', taille: 1, emp: 'v', duree: 5, type: 'video' },
    { id: 'a1', nom: 'bip.wav', taille: 1, emp: 'x', duree: 1, type: 'audio' },
    { id: 'a2', nom: 'tendance.mp3', taille: 1, emp: 'y', duree: 9, type: 'audio' },
  ];
  r.plans = [{ de: 0, a: 5 }];
  r.sons = [{ id: 'impact.boom', ts: 1 }, { id: 'a1', ts: 2 }];
  r.guide = { src: 'a2', t: 0, debut: 3 };
  return r;
}

describe('rouvrirSons', () => {
  it('retire le son importé et le son guide introuvables, avec un message chacun', async () => {
    const res = await rouvrirSons(recette());
    expect(res.recette.sons.map((s) => s.id)).toEqual(['impact.boom']);
    expect(res.recette.guide).toBeNull();
    expect(res.messages).toEqual([
      'Le son « bip.wav » n\'a pas été retrouvé : il est retiré.',
      'Le son « tendance.mp3 » n\'a pas été retrouvé : il est retiré.',
    ]);
  });
});
