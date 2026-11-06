// Ma bibliothèque, rayons Fonds verts et Mèmes : garder (sans doublon), lire, renommer, supprimer, place
// (IndexedDB simulée en mémoire ; ici pas d'OPFS : le fichier va dans IndexedDB, comme sur un navigateur sans OPFS).
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

import { garderClip, lireClip, listerClips, MARGE_APPAREIL, modifierClip, placeClips, refusPlaceClips, supprimerClip } from './clips';

const video = (octet: number, taille = 1000) => new Blob([new Uint8Array(taille).fill(octet)], { type: 'video/mp4' });
const infos = (rayon: 'fondsVerts' | 'memes', nom: string) => ({ rayon, nom, etiquette: 'Boutons', duree: 3, l: 1920, h: 1080, fond: { couleur: [40, 185, 70] as [number, number, number], type: 'vert' as const } });

beforeEach(() => memoire.clear());

describe('clips de Ma bibliothèque', () => {
  it('gardé en entier, relu tel quel, sans doublon ; rangé par rayon', async () => {
    const a = await garderClip(video(1), infos('fondsVerts', 'abonne'), { libre: null });
    expect(a.nouveau).toBe(true);
    expect(a.clip.ou).toBe('idb');
    expect(a.clip.id).toMatch(/^v[0-9a-f]+$/);
    expect((await garderClip(video(1), infos('memes', 'autre nom'), { libre: null })).nouveau).toBe(false);
    await garderClip(video(2), infos('memes', 'bruh'), { libre: null });
    expect((await listerClips('memes')).map((c) => c.nom)).toEqual(['bruh']);
    expect((await listerClips()).length).toBe(2);
    const f = await lireClip(a.clip.id);
    expect(f?.size).toBe(1000);
    expect(new Uint8Array(await f!.arrayBuffer())[10]).toBe(1);
    expect(await placeClips()).toBe(2000);
  });

  it('renommer, changer d\'étiquette ; supprimer', async () => {
    const { clip } = await garderClip(video(3), infos('memes', 'x'), { libre: null });
    expect((await modifierClip(clip.id, { nom: '  Mon\tmème  ', etiquette: 'Drôles' }))?.nom).toBe('Mon mème');
    await supprimerClip(clip.id);
    expect(await lireClip(clip.id)).toBeNull();
    expect(await listerClips()).toEqual([]);
  });

  it('place : refus clair si l\'appareil n\'a plus la place (marge gardée)', async () => {
    expect(refusPlaceClips(1000, null)).toBeNull();
    expect(refusPlaceClips(1000, MARGE_APPAREIL + 5000)).toBeNull();
    expect(refusPlaceClips(10 * 1024 * 1024, MARGE_APPAREIL + 1024 * 1024)).toMatch(/Pas assez de place.*10 Mo.*1 Mo/);
    await expect(garderClip(video(4, 5000), infos('memes', 'gros'), { libre: MARGE_APPAREIL })).rejects.toMatchObject({ code: 'place' });
    expect(await listerClips()).toEqual([]);
  });
});
