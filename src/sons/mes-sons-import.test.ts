// Import d'un pack : mesure avant import (le .zip n'est lu que par sa fin) et plafonds (2 000 sons, 600 Mo, place).
import { describe, expect, it } from 'vitest';
import { LIMITE_MES_SONS } from '../stockage/mes-sons';
import { TEXTES_SON_AUTO } from '../ui/auto/son/textes';
import { mesurerImport, refusPlace } from './mes-sons-import';

const Mo = 1024 * 1024;

describe('plafonds d\'un vrai pack', () => {
  it('1 500 sons, 500 Mo : accepté si le navigateur laisse la place (× 1,2)', () => {
    expect(refusPlace(1500, 500 * Mo, 0, 2000 * Mo)).toBeNull();
    expect(refusPlace(1500, 500 * Mo, 0, null)).toBeNull();
    expect(refusPlace(1500, 500 * Mo, 0, 550 * Mo)).toBe(TEXTES_SON_AUTO.import.parDossier);
  });

  it('trop de sons, ou plus de 600 Mo avec ce qui est déjà gardé → « dossier par dossier »', () => {
    expect(refusPlace(2001, Mo, 0, null)).toContain('dossier par dossier');
    expect(refusPlace(10, 200 * Mo, LIMITE_MES_SONS - 100 * Mo, null)).toBe(TEXTES_SON_AUTO.import.parDossier);
  });

  it('mesure : sons, vidéos, autres fichiers refusés', async () => {
    const m = await mesurerImport([
      new File([new Uint8Array(100)], 'a.mp3'),
      new File([new Uint8Array(300)], 'b.mp4'),
      new File([new Uint8Array(5)], 'c.txt'),
    ]);
    expect(m).toEqual({ nombre: 2, octets: 400, refuses: 1 });
  });
});
