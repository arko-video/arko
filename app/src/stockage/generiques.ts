// « Mes génériques » : intros et outros réutilisables d'un montage à l'autre, gardées SUR L'APPAREIL
// (base IndexedDB à part). Un modèle animé ne garde que ses réglages ; une vidéo importée garde son fichier
// (rangé par empreinte, 200 Mo au plus en tout). Rien n'est jamais envoyé.

import { createStore, del, get, getMany, keys, set } from 'idb-keyval';
import type { Generique, Source } from '../recette/types';
import { ErreurArko } from '../moteur/erreurs';

export const LIMITE_GENERIQUES = 200 * 1024 * 1024;

/** Fiche d'un générique gardé. */
export interface MonGenerique {
  id: string;
  nom: string;
  /** Réglages (sans `src` : la vidéo est retrouvée par son empreinte). */
  g: Omit<Generique, 'src'>;
  /** Vidéo importée : ses infos (empreinte, durée, taille) ; absent pour un modèle. */
  video?: Omit<Source, 'id'>;
  ajouteLe: number;
}

let base: ReturnType<typeof createStore> | null = null;
const magasin = () => (base ??= createStore('arko-generiques', 'generiques'));
const cleFiche = (id: string) => `fiche:${id}`;
const cleFichier = (emp: string) => `fichier:${emp}`;

export async function listerGeneriques(): Promise<MonGenerique[]> {
  const cles = (await keys<string>(magasin())).filter((k) => k.startsWith('fiche:'));
  const fiches = (await getMany<MonGenerique>(cles, magasin())).filter((f): f is MonGenerique => !!f);
  return fiches.sort((a, b) => b.ajouteLe - a.ajouteLe);
}

/** Garde un générique (et le fichier de sa vidéo, une seule fois par empreinte). Lève ErreurArko "place". */
export async function garderGenerique(fiche: Omit<MonGenerique, 'id' | 'ajouteLe'>, fichier?: Blob): Promise<MonGenerique> {
  if (fichier && fiche.video) {
    const deja = await get<Blob>(cleFichier(fiche.video.emp), magasin());
    if (!deja) {
      const place = (await listerGeneriques()).reduce((t, x) => t + (x.video?.taille ?? 0), 0);
      if (place + fichier.size > LIMITE_GENERIQUES) {
        throw new ErreurArko('Plus de place pour garder cette vidéo (200 Mo au plus). Supprime une ancienne intro ou outro.', 'place');
      }
      await set(cleFichier(fiche.video.emp), fichier, magasin());
    }
  }
  const complete: MonGenerique = { ...fiche, id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, ajouteLe: Date.now() };
  await set(cleFiche(complete.id), complete, magasin());
  return complete;
}

/** Fichier vidéo gardé pour cette empreinte (null s'il n'est plus là). */
export async function fichierGenerique(emp: string, nom: string): Promise<File | null> {
  const blob = await get<Blob>(cleFichier(emp), magasin());
  if (!blob) return null;
  return blob instanceof File ? blob : new File([blob], nom, { type: blob.type || 'video/mp4' });
}

/** Supprime une fiche ; le fichier vidéo part aussi si plus aucune fiche ne l'utilise. */
export async function supprimerGenerique(id: string): Promise<void> {
  const fiche = await get<MonGenerique>(cleFiche(id), magasin());
  await del(cleFiche(id), magasin());
  const emp = fiche?.video?.emp;
  if (emp && !(await listerGeneriques()).some((x) => x.video?.emp === emp)) await del(cleFichier(emp), magasin());
}
