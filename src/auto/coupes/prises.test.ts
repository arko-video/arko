import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import { retirerPrisesRatees } from './prises';

const phrase = (t: number, texte: string): Mot[] => texte.split(' ').map((w, i) => [w, t + i * 0.35, t + i * 0.35 + 0.3]);

describe('prises ratées : seule la dernière prise est gardée', () => {
  it('la même phrase redite pour l\'intonation', () => {
    const m = [...phrase(0, 'salut tout le monde on se retrouve'), ...phrase(4, 'salut tout le monde on se retrouve aujourd\'hui'), ...phrase(10, 'on lance la partie')];
    const r = retirerPrisesRatees(m);
    expect(r.retirees).toHaveLength(1);
    expect(r.retirees[0]!.de).toBe(0);
    expect(r.mots.map((x) => x[0]).join(' ')).toBe("salut tout le monde on se retrouve aujourd'hui on lance la partie");
  });

  it('une phrase commencée puis reprise depuis le début', () => {
    const m = [...phrase(0, 'ok on va jouer à'), ...phrase(3, 'ok on va jouer à Counter Strike')];
    expect(retirerPrisesRatees(m).mots.map((x) => x[0]).join(' ')).toBe('ok on va jouer à Counter Strike');
  });

  it('prudent : deux phrases différentes, ou trop éloignées, restent', () => {
    const m = [...phrase(0, 'il est derrière la porte'), ...phrase(3, 'non il est sur le toit')];
    expect(retirerPrisesRatees(m).retirees).toHaveLength(0);
    const loin = [...phrase(0, 'salut tout le monde on se retrouve'), ...phrase(40, 'salut tout le monde on se retrouve')];
    expect(retirerPrisesRatees(loin).retirees).toHaveLength(0);
    expect(retirerPrisesRatees([...phrase(0, 'oui oui'), ...phrase(2, 'oui oui')]).retirees).toHaveLength(0);
  });
});
