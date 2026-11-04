// Tests des parties pures : choix des fichiers audio à retirer, et ids libres des sons importés.
import { describe, expect, it } from 'vitest';
import { premierIdLibre } from '../sons/ids';
import { choisirFichiersARetirer, GRACE_MS, type FicheAudio } from './sons';

const MO = 1024 * 1024;
const fiche = (emp: string, taille: number, utiliseLe: number): FicheAudio => ({ emp, nom: `${emp}.mp3`, type: 'audio/mpeg', taille, utiliseLe });

describe('choisirFichiersARetirer', () => {
  const maintenant = 10 * GRACE_MS;

  it('retire les fichiers qu\'aucun projet n\'utilise, sauf ceux importés il y a moins d\'une heure', () => {
    const fiches = [fiche('vieux', MO, 0), fiche('recent', MO, maintenant - 60_000), fiche('utilise', MO, 0)];
    expect(choisirFichiersARetirer(fiches, new Set(['utilise']), maintenant)).toEqual(['vieux']);
  });

  it('au-delà de 200 Mo, retire les moins récemment utilisés, même s\'ils servent', () => {
    const fiches = [fiche('a', 90 * MO, 3), fiche('b', 90 * MO, 1), fiche('c', 90 * MO, 2)];
    const tous = new Set(['a', 'b', 'c']);
    expect(choisirFichiersARetirer(fiches, tous, maintenant)).toEqual(['b']);
    expect(choisirFichiersARetirer(fiches, tous, maintenant, 100 * MO)).toEqual(['b', 'c']);
  });

  it('ne retire rien quand tout est utilisé et sous la limite', () => {
    expect(choisirFichiersARetirer([fiche('a', MO, 0)], new Set(['a']), maintenant)).toEqual([]);
    expect(choisirFichiersARetirer([], new Set(), maintenant)).toEqual([]);
  });
});

describe('premierIdLibre', () => {
  it('prend le premier « aN » libre, sans jamais reprendre un id déjà pris', () => {
    expect(premierIdLibre([])).toBe('a1');
    expect(premierIdLibre(['s1', 'a1', 'a2'])).toBe('a3');
    expect(premierIdLibre(['a2', 'a3'])).toBe('a1');
  });
});
