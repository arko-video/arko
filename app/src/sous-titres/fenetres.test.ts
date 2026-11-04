import { describe, expect, it } from 'vitest';
import type { Recette } from '../recette/types';
import { fusionner, motEnSource, plagesAEcouter, sourceDesSousTitres, versSource, type Piece } from './fenetres';

function recette(plans: Recette['plans']): Recette {
  return {
    format: 'arko.recette/1',
    sources: [
      { id: 's1', nom: 'a.mp4', taille: 1, emp: 'x', duree: 60, type: 'video' },
      { id: 's2', nom: 'b.mp4', taille: 1, emp: 'y', duree: 60, type: 'video' },
    ],
    plans,
    mise: { type: 'flou' },
    textes: [],
    sousTitres: null,
    sons: [],
    zooms: [],
    guide: null,
    boucle: false,
    export: {},
  };
}

describe('plagesAEcouter', () => {
  it('garde les plans de la source, triés et fusionnés, en ignorant la vitesse', () => {
    const r = recette([
      { de: 10, a: 12, vit: 2 },
      { de: 0, a: 3 },
      { src: 's2', de: 0, a: 5 },
      { de: 2, a: 4 },
      { de: 10, a: 12 },
    ]);
    expect(sourceDesSousTitres(r)).toBe('s1');
    expect(plagesAEcouter(r, 's1')).toEqual([{ de: 0, a: 4 }, { de: 10, a: 12 }]);
    expect(plagesAEcouter(r, 's2')).toEqual([{ de: 0, a: 5 }]);
  });
  it('fusionne aussi des plages qui se touchent à 50 ms près', () => {
    expect(fusionner([{ de: 3, a: 5 }, { de: 0, a: 2.97 }])).toEqual([{ de: 0, a: 5 }]);
  });
});

describe('versSource / motEnSource', () => {
  // Fenêtre : [4 s → 6 s de la source] puis un blanc de 0,2 s puis [20 s → 23 s].
  const pieces: Piece[] = [
    { decalage: 0, de: 4, a: 6 },
    { decalage: 2.2, de: 20, a: 23 },
  ];
  it('retrouve le temps source grâce à la table des décalages', () => {
    expect(versSource(1, pieces)).toEqual({ ts: 5, i: 0 });
    expect(versSource(3.2, pieces)).toEqual({ ts: 21, i: 1 });
    // Dans le blanc : début de la pièce suivante.
    expect(versSource(2.1, pieces)).toEqual({ ts: 20, i: 1 });
  });
  it('borne la fin du mot à sa pièce', () => {
    expect(motEnSource(1.5, 2.5, pieces)).toEqual({ ts: 5.5, fin: 6 });
    expect(motEnSource(2.5, 2.9, pieces)).toEqual({ ts: 20.3, fin: 20.7 });
  });
});
