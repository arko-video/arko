// I-2 (QA finale) : « Trouver le moment fort » prend le pic le PLUS FORT, pas le premier.
import { describe, expect, it } from 'vitest';
import { picLePlusFort } from '../../recette/rythme';
import { Enveloppe, trouverPics, trouverPicsForts } from './pics-calcul';

/** Bruit faible + claquements aux temps donnés, chacun avec son volume. */
function claques(duree: number, liste: [t: number, volume: number][], f = 48000): Float32Array {
  const x = new Float32Array(Math.round(duree * f));
  let graine = 7;
  for (let k = 0; k < x.length; k++) {
    graine = (graine * 16807) % 2147483647;
    x[k] = ((graine / 2147483647) * 2 - 1) * 0.02;
  }
  for (const [t, v] of liste) for (let k = 0; k < 0.06 * f; k++) x[Math.round(t * f) + k] = Math.sin(k / 3) * v;
  return x;
}

describe('pics avec leur force', () => {
  const env = new Enveloppe(0, 10);
  env.ajouter([claques(10, [[1, 0.4], [4, 0.9], [7, 0.5]])], 48000, 0);
  const placee = [{ t0: 0, pas: 0.02, valeurs: env.valeurs() }];

  it('donne la force de chaque pic, triés par temps, aux mêmes temps que trouverPics', () => {
    const forts = trouverPicsForts(placee);
    expect(forts.map((p) => p.t)).toEqual(trouverPics(placee));
    expect(forts).toHaveLength(3);
    expect(forts[1]!.force).toBeGreaterThan(forts[0]!.force);
    expect(forts[1]!.force).toBeGreaterThan(forts[2]!.force);
  });

  it('le moment fort est le pic le plus fort, pas le premier', () => {
    const t = picLePlusFort(trouverPicsForts(placee));
    expect(Math.abs(t! - 4)).toBeLessThan(0.1);
  });

  it('à force égale : le plus entouré, puis le plus tôt ; aucun pic → null', () => {
    expect(picLePlusFort([])).toBeNull();
    expect(picLePlusFort([{ t: 1, force: 0.5 }, { t: 5, force: 0.5 }, { t: 5.5, force: 0.2 }])).toBe(5);
    expect(picLePlusFort([{ t: 1, force: 0.5 }, { t: 5, force: 0.5 }])).toBe(1);
  });
});
