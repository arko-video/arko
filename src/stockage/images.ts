// B. Images fixes du montage (dev 2) : gardées sur l'appareil (IndexedDB, rangées par empreinte), jamais dans la
// recette. Rouvertes à la reprise d'un projet et passées au Worker d'export. Contrat : conception/contrat-wankil.md §4.1.

import { createStore, get, set } from 'idb-keyval';
import { ErreurArko } from '../moteur/erreurs';
import { decoderImage, MESSAGE_IMAGE_ILLISIBLE } from '../moteur/inserts/images-ouvertes';
import type { ImageRecette } from '../recette/types';
import { calculerEmpreinte } from './fichiers';

/** 25 Mo au plus par image (une photo de téléphone en fait 3 à 8). */
export const IMAGE_MAX = 25 * 1024 * 1024;
const TYPES = /^image\/(png|jpeg|webp|gif)$/;
const EXTENSIONS = /\.(png|jpe?g|webp|gif)$/i;

let base: ReturnType<typeof createStore> | null = null;
const magasin = () => (base ??= createStore('arko-images', 'images'));

/** true si le fichier a l'air d'une image lisible par Arko (type ou extension). */
export function estImageAcceptee(f: Pick<File, 'type' | 'name'>): boolean {
  return TYPES.test(f.type) || EXTENSIONS.test(f.name);
}

/** Garde le fichier image (PNG, JPEG, WebP, GIF : 1re image) et renvoie sa fiche (sans id : c'est l'opération qui le donne). */
export async function garderImage(fichier: File): Promise<Omit<ImageRecette, 'id'>> {
  if (!estImageAcceptee(fichier) || fichier.size > IMAGE_MAX)
    throw new ErreurArko(MESSAGE_IMAGE_ILLISIBLE, 'image');
  const bitmap = await decoderImage(fichier);
  const fiche = {
    nom: (fichier.name || 'image').slice(0, 120),
    emp: `i${await calculerEmpreinte(fichier)}`,
    taille: fichier.size,
    l: bitmap.width,
    h: bitmap.height,
  };
  bitmap.close();
  if (!(await get(fiche.emp, magasin()))) await set(fiche.emp, fichier, magasin());
  return fiche;
}

/** Le fichier d'une image gardée (par empreinte), ou null s'il n'est plus sur l'appareil. */
export async function lireImage(emp: string): Promise<Blob | null> {
  try {
    return (await get<Blob>(emp, magasin())) ?? null;
  } catch {
    return null;
  }
}
