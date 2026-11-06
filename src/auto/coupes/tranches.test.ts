// Transcription longue : ce qui reste à faire, tranches de 5 min, fusion des tranches (reprise sans doublon).

import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import { ajouterTranche, dureePlages, enTranches, gardeeUtilisable, motsCouverts, motsDansPlage, plagesDans, plagesManquantes, transcriptionVide, unionPlages } from './tranches';

const mot = (txt: string, ts: number): Mot => [txt, ts, ts + 0.3];

describe('tranches', () => {
  it('une vidéo de 2 h = 24 tranches de 5 min', () => {
    const t = enTranches(plagesManquantes({ de: 0, a: 7200 }, []));
    expect(t).toHaveLength(24);
    expect(t[0]).toEqual({ de: 0, a: 300 });
    expect(t[23]).toEqual({ de: 6900, a: 7200 });
  });

  it('une plage « de 0:20:00 à 1:10:00 » : 10 tranches, la dernière finit à 1:10:00', () => {
    const t = enTranches(plagesManquantes({ de: 1200, a: 4200 }, []));
    expect(t).toHaveLength(10);
    expect(t[9]!.a).toBe(4200);
  });

  it('reprise : seules les parties pas encore faites restent', () => {
    const faites = [{ de: 0, a: 600 }, { de: 900, a: 1200 }];
    expect(plagesManquantes({ de: 0, a: 1800 }, faites)).toEqual([{ de: 600, a: 900 }, { de: 1200, a: 1800 }]);
    expect(plagesManquantes({ de: 100, a: 500 }, faites)).toEqual([]);
    expect(dureePlages(plagesManquantes({ de: 0, a: 1800 }, faites))).toBe(900);
  });

  it('unionPlages fusionne ce qui se touche', () => {
    expect(unionPlages([{ de: 300, a: 600 }, { de: 0, a: 300 }, { de: 700, a: 800 }])).toEqual([{ de: 0, a: 600 }, { de: 700, a: 800 }]);
  });
});

describe('fusion des tranches', () => {
  it('ajoute les mots d\'une tranche, triés, et retient la tranche faite', () => {
    let g = transcriptionVide(7200, 'fr');
    g = ajouterTranche(g, { de: 300, a: 600 }, [mot('deux', 310)]);
    g = ajouterTranche(g, { de: 0, a: 300 }, [mot('un', 10), mot('hors', 400)]);
    expect(g.mots.map((m) => m[0])).toEqual(['un', 'deux']); // « hors » n'est pas dans sa tranche
    expect(g.plages).toEqual([{ de: 0, a: 600 }]);
  });

  it('une tranche refaite (Worker arrêté au milieu puis relancé) ne double jamais ses mots', () => {
    let g = transcriptionVide(7200, 'fr');
    g = ajouterTranche(g, { de: 0, a: 300 }, [mot('salut', 10), mot('ça', 20)]);
    g = ajouterTranche(g, { de: 0, a: 300 }, [mot('salut', 10.02), mot('ça', 20), mot('va', 21)]);
    expect(g.mots.map((m) => m[0])).toEqual(['salut', 'ça', 'va']);
  });

  it('un mot à cheval entre deux tranches appartient à celle de son milieu', () => {
    let g = transcriptionVide(7200, 'fr');
    g = ajouterTranche(g, { de: 0, a: 300 }, [['long', 299.8, 300.4]]);
    g = ajouterTranche(g, { de: 300, a: 600 }, [['long', 299.8, 300.4]]);
    expect(g.mots).toHaveLength(1);
  });

  it('mots et plages d\'une partie demandée', () => {
    const g = ajouterTranche(transcriptionVide(7200, 'fr'), { de: 0, a: 600 }, [mot('a', 10), mot('b', 500)]);
    expect(motsDansPlage(g.mots, { de: 0, a: 300 }).map((m) => m[0])).toEqual(['a']);
    expect(plagesDans(g.plages, { de: 100, a: 4000 })).toEqual([{ de: 100, a: 600 }]);
  });

  it('une transcription gardée ne sert que pour la même vidéo et la même langue', () => {
    const g = transcriptionVide(7200, 'fr');
    expect(gardeeUtilisable(g, 7200.2, 'fr')).toBe(true);
    expect(gardeeUtilisable(g, 7300, 'fr')).toBe(false);
    expect(gardeeUtilisable(g, 7200, 'en')).toBe(false);
    expect(gardeeUtilisable({ version: 99 }, 7200, 'fr')).toBe(false);
  });
});

describe('motsCouverts (sous-titres après Couper les blancs)', () => {
  const g = { plages: [{ de: 0, a: 300 }], mots: [['a', 1, 1.2], ['b', 150, 150.3], ['c', 299, 299.4]] as Mot[] };
  it('toutes les plages transcrites : les mots de ces plages', () => {
    expect(motsCouverts(g, [{ de: 0, a: 10 }, { de: 140, a: 160 }])?.map((m) => m[0])).toEqual(['a', 'b']);
  });
  it('une plage pas encore transcrite : null (il faut transcrire)', () => {
    expect(motsCouverts(g, [{ de: 290, a: 320 }])).toBeNull();
    expect(motsCouverts(g, [])).toBeNull();
  });
});
