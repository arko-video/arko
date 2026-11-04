// « Mes sons » : garder (sans doublon), plafond de 100 Mo, renommer, étiquette, supprimer (IndexedDB simulée en mémoire).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoire = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  createStore: () => 'magasin',
  get: async (k: string) => memoire.get(k),
  set: async (k: string, v: unknown) => void memoire.set(k, v),
  del: async (k: string) => void memoire.delete(k),
  keys: async () => [...memoire.keys()],
  getMany: async (ks: string[]) => ks.map((k) => memoire.get(k)),
}));

import { garderMonSon, LIMITE_MES_SONS, lireMonSon, listerMesSons, modifierMonSon, nettoyerNom, nomDepuisFichier, supprimerMonSon } from './mes-sons';

const son = (octet: number, taille = 100) => new Blob([new Uint8Array(taille).fill(octet)], { type: 'audio/mpeg' });

beforeEach(() => memoire.clear());

describe('Mes sons', () => {
  it('garde un son une seule fois, le relit, le renomme puis le supprime', async () => {
    const a = await garderMonSon(son(1), { nom: 'boum', etiquette: 'Memes', duree: 1.2 });
    expect(a.nouveau).toBe(true);
    expect((await garderMonSon(son(1), { nom: 'autre nom', duree: 1.2 })).nouveau).toBe(false);
    await garderMonSon(son(2), { nom: 'rire', duree: 2 });
    expect((await listerMesSons()).map((s) => s.nom).sort()).toEqual(['boum', 'rire']);
    const f = await lireMonSon(a.son.id);
    expect(f?.name).toBe('boum');
    expect(f?.size).toBe(100);
    await modifierMonSon(a.son.id, { nom: '  Gros   boum ', etiquette: 'Drôle' });
    expect((await listerMesSons()).find((s) => s.id === a.son.id)).toMatchObject({ nom: 'Gros boum', etiquette: 'Drôle' });
    await supprimerMonSon(a.son.id);
    expect((await listerMesSons()).map((s) => s.nom)).toEqual(['rire']);
    expect(await lireMonSon(a.son.id)).toBeNull();
  });

  it('refuse un son qui ferait dépasser 100 Mo', async () => {
    await garderMonSon(son(1, LIMITE_MES_SONS - 50), { nom: 'gros', duree: 600 });
    await expect(garderMonSon(son(2, 100), { nom: 'de trop', duree: 1 })).rejects.toMatchObject({ code: 'place' });
  });

  it('noms propres, venus d\'un fichier ou tapés', () => {
    expect(nomDepuisFichier('../dossier/vine_boom.MP3')).toBe('vine boom');
    expect(nomDepuisFichier('.mp3')).toBe('Son sans nom');
    expect(nettoyerNom('a\nb\tc')).toBe('a b c');
    expect(nettoyerNom('x'.repeat(100))).toHaveLength(60);
  });
});
