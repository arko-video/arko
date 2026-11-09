import { describe, expect, it } from 'vitest';
import { recetteVide } from '../../recette/defauts';
import { normaliser } from '../../recette/normaliser';
import type { Recette } from '../../recette/types';
import { SOURCE_TEST } from '../habillage/montage-test';
import { ACCENTS, proposerAccents, sonsAccent } from './accents';

function recette(plans: Recette['plans']): Recette {
  return normaliser({ ...recetteVide(), sources: [SOURCE_TEST], plans }).recette;
}

describe('accents sonores (dynamisme)', () => {
  it('un whoosh à chaque transition, juste avant ; un impact sur un gros zoom ; écart respecté', () => {
    const r = recette([
      { de: 0, a: 10 },
      { de: 20, a: 30, trans: 'glisse' },
      { de: 40, a: 41, zoomFixe: { force: 1.32 } },
      { de: 41, a: 50, zoomFixe: { force: 1.12 } },
      { de: 60, a: 61, trans: 'flash' },
    ]);
    const a = proposerAccents(r);
    expect(a.map((x) => x.famille)).toEqual(['whoosh', 'impact', 'whoosh']);
    expect(a[0]!.t).toBeCloseTo(10 - ACCENTS.avance, 2);
    for (let i = 1; i < a.length; i++) expect(a[i]!.t - a[i - 1]!.t).toBeGreaterThanOrEqual(ACCENTS.ecart);
  });

  it('rien pendant l\'accroche', () => {
    const r = recette([{ de: 0, a: 5 }, { de: 20, a: 30, trans: 'glisse' }]);
    expect(proposerAccents(r, { apres: 6 })).toEqual([]);
  });

  it('les sons de la bibliothèque reconnus par leur nom, courts seulement', () => {
    const sons = [
      { id: 'a', nom: 'Whoosh transition 2', etiquette: 'SFX', duree: 0.8 },
      { id: 'b', nom: 'vine boom', etiquette: '', duree: 1.2 },
      { id: 'c', nom: 'swoosh long ambiance', etiquette: '', duree: 9 },
      { id: 'd', nom: 'bubble pop', etiquette: '', duree: 0.3 },
    ];
    expect(sonsAccent('whoosh', sons).map((s) => s.id)).toEqual(['a']);
    expect(sonsAccent('impact', sons).map((s) => s.id)).toEqual(['b']);
    expect(sonsAccent('pop', sons).map((s) => s.id)).toEqual(['d']);
  });
});
