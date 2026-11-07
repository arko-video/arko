// Habiller → Sons → Musique, « Remplacer » un morceau (même place, un seul Annuler) ; les réglages v4 de la piste
// (baisseSur) restent.
import { describe, expect, it } from 'vitest';
import { normaliserRecette } from './normaliser';
import { annuler, nouvelHistorique, pousser } from './historique';
import { remplacerMorceauMusique } from './operations-son-auto';

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video' as const };
const audio = (id: string, nom = `${id}.m4a`) => ({ id, nom, taille: 1, emp: id, duree: 90, type: 'audio' as const });

describe('remplacer un morceau de musique', () => {
  const r = normaliserRecette(
    { plans: [{ de: 0, a: 40 }], musique: { morceaux: [{ src: 'a1', t: 6 }, { src: 'a2', t: 20, debut: 12, fin: 35, boucle: false }], baisseSur: 'parole', vol: 0.2 } },
    { sources: [v, audio('a1'), audio('a2')] },
  );

  it('même place (début, fin, boucle), lu depuis son début ; la nouvelle source est ajoutée ; réglages gardés', () => {
    const k = audio('a3', 'Kevin MacLeod - Investigations.m4a');
    const x = remplacerMorceauMusique(r, 1, k);
    expect(x.musique?.morceaux).toEqual([{ src: 'a1', t: 6 }, { src: 'a3', t: 20, fin: 35, boucle: false }]);
    expect(x.sources.some((s) => s.id === 'a3')).toBe(true);
    expect(x.musique?.baisseSur).toBe('parole');
    expect(x.musique?.vol).toBe(0.2);
  });

  it('indice inconnu ou pas de musique : la recette d\'origine', () => {
    expect(remplacerMorceauMusique(r, 5, audio('a3'))).toBe(r);
    const sans = normaliserRecette({ plans: [{ de: 0, a: 40 }] }, { sources: [v] });
    expect(remplacerMorceauMusique(sans, 0, audio('a3'))).toBe(sans);
  });

  it('un seul Annuler revient au morceau d\'avant', () => {
    let h = nouvelHistorique(r);
    h = pousser(h, remplacerMorceauMusique(r, 0, audio('a3')));
    expect(h.present.musique?.morceaux[0]?.src).toBe('a3');
    expect(annuler(h).present).toEqual(r);
  });
});
