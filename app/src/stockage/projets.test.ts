// « Mes montages » : index, migration de l'ancienne clé, copie, et projet courant (IndexedDB simulée en mémoire).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoire = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => structuredClone(memoire.get(k)),
  set: async (k: string, v: unknown) => void memoire.set(k, structuredClone(v)),
  del: async (k: string) => void memoire.delete(k),
  getMany: async (ks: string[]) => ks.map((k) => structuredClone(memoire.get(k))),
}));
const nettoyer = vi.fn(async (_r: unknown[]) => 0);
vi.mock('./sons', () => ({ nettoyerFichiersAudio: (r: unknown[]) => nettoyer(r) }));

import type { ProjetSauvegarde } from '../moteur/api';
import { normaliserRecette } from '../recette/normaliser';
import type { Source } from '../recette/types';
import { chargerProjet, effacerProjet, sauverProjet } from './projet';
import { dupliquerProjet, listerProjets, nouveauProjet, ouvrirProjet, renommerProjet, supprimerProjet } from './projets';
import { CLE_ANCIENNE, CLE_INDEX, copieDe, migrerAncien, nouvelId, resumeDe, retirerDuIndex, titreParDefaut } from './projets-index';

const source = (nom: string): Source => ({ id: 's1', nom, taille: 1, emp: nom, duree: 60, type: 'video' });
const projet = (nom: string, modifieLe = 1000): ProjetSauvegarde => ({
  recette: normaliserRecette({ plans: [{ de: 0, a: 4, fige: 1 }] }, { sources: [source(nom)] }),
  etape: 'couper',
  modifieLe,
});
const attendre = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  memoire.clear();
  nettoyer.mockClear();
});

describe('partie pure', () => {
  it('titre par défaut = nom du fichier sans extension', () => {
    expect(titreParDefaut(projet('partie ranked.mp4').recette)).toBe('partie ranked');
    expect(titreParDefaut({ ...projet('a.mov').recette, titre: 'Mon clutch' })).toBe('Mon clutch');
  });

  it('résumé : durée finale (avec l\'arrêt sur image) et nom de la source', () => {
    expect(resumeDe('x', projet('clip.mp4'), 'clip')).toEqual({ id: 'x', titre: 'clip', duree: 5, modifieLe: 1000, etape: 'couper', nomSource: 'clip.mp4' });
  });

  it('migration, retrait du courant, copie, ids différents', () => {
    const m = migrerAncien(projet('vieux.mp4'), 'id1')!;
    expect(m.index).toMatchObject({ courant: 'id1', projets: [{ id: 'id1', titre: 'vieux' }] });
    expect(migrerAncien({ pas: 'un projet' }, 'id2')).toBeNull();
    expect(retirerDuIndex(m.index, 'id1')).toEqual({ courant: null, projets: [] });
    const c = copieDe(m.projet, m.index.projets[0]!, 'id3', 5000);
    expect(c.resume).toMatchObject({ id: 'id3', titre: 'vieux (copie)', modifieLe: 5000 });
    expect(nouvelId(1, 0.1)).not.toBe(nouvelId(1, 0.2));
  });
});

describe('projets dans IndexedDB', () => {
  it('migre l\'ancienne clé arko.projet', async () => {
    memoire.set(CLE_ANCIENNE, projet('ancien.mp4'));
    const liste = await listerProjets();
    expect(liste.map((p) => p.titre)).toEqual(['ancien']);
    expect(memoire.has(CLE_ANCIENNE)).toBe(false);
    expect((await chargerProjet())?.recette.sources[0]!.nom).toBe('ancien.mp4');
  });

  it('sauver / charger / effacer visent le projet courant ; nouveauProjet en commence un autre', async () => {
    await sauverProjet(projet('a.mp4', 1));
    await sauverProjet(projet('a.mp4', 2)); // même projet, mis à jour
    await nouveauProjet();
    expect(await chargerProjet()).toBeNull();
    await sauverProjet(projet('b.mp4', 3));
    const liste = await listerProjets();
    expect(liste.map((p) => p.titre)).toEqual(['b', 'a']);
    await attendre();
    // Nettoyage des sons avec les recettes de TOUS les projets.
    expect(nettoyer.mock.calls.at(-1)![0].length).toBe(2);
    expect((await ouvrirProjet(liste[1]!.id))?.recette.sources[0]!.nom).toBe('a.mp4');
    await effacerProjet();
    expect((await listerProjets()).map((p) => p.titre)).toEqual(['b']);
  });

  it('renommer, dupliquer, supprimer', async () => {
    await sauverProjet(projet('clip.mp4'));
    const [p] = await listerProjets();
    await renommerProjet(p!.id, '  Mon   top 3 ');
    await sauverProjet(projet('clip.mp4', 2000)); // le titre choisi est gardé
    const id2 = await dupliquerProjet(p!.id);
    const liste = await listerProjets();
    expect(liste.map((x) => x.titre).sort()).toEqual(['Mon top 3', 'Mon top 3 (copie)']);
    await supprimerProjet(id2);
    expect((await listerProjets()).map((x) => x.id)).toEqual([p!.id]);
    expect(memoire.get(CLE_INDEX)).toMatchObject({ courant: p!.id });
  });
});
