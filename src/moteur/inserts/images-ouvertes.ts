// B. Images fixes décodées (dev 2), partagées par l'aperçu, la miniature et le Worker d'export (chacun les siennes) :
// on décode le fichier une fois (createImageBitmap : marche aussi dans le Worker), rangé par empreinte, puis
// `imagesDe(recette)` donne la table id → ImageSource passée à rendre() (OptionsRendu.images).
// Contrat : conception/contrat-wankil.md §4.1.

import type { Recette } from '../../recette/types';
import type { ImageSource } from '../canevas';
import { ErreurArko } from '../erreurs';

interface ImageOuverte {
  bitmap: ImageBitmap;
  /** Le fichier (envoyé au Worker d'export). */
  fichier: Blob;
  source: ImageSource;
}

const ouvertes = new Map<string, ImageOuverte>();

export const MESSAGE_IMAGE_ILLISIBLE = "Cette image ne s'ouvre pas. Choisis un PNG, un JPEG ou un WebP.";

/** ImageSource d'une image décodée (dessinée telle quelle). */
export function sourceDeBitmap(b: ImageBitmap | { width: number; height: number }): ImageSource {
  return {
    largeur: b.width,
    hauteur: b.height,
    dessiner: (ctx, sx, sy, sl, sh, dx, dy, dl, dh) =>
      ctx.drawImage(b as ImageBitmap, sx, sy, sl, sh, dx, dy, dl, dh),
  };
}

/** Décode une image (GIF : la 1re image). Lève ErreurArko « image » si le fichier ne s'ouvre pas. */
export async function decoderImage(fichier: Blob): Promise<ImageBitmap> {
  try {
    const b = await createImageBitmap(fichier);
    if (b.width > 0 && b.height > 0) return b;
    b.close();
  } catch {
    /* illisible : message ci-dessous */
  }
  throw new ErreurArko(MESSAGE_IMAGE_ILLISIBLE, 'image');
}

/** Décode et garde l'image (empreinte `emp`). Lève ErreurArko « image » si le fichier ne s'ouvre pas. */
export async function ouvrirImage(emp: string, fichier: Blob): Promise<void> {
  if (ouvertes.has(emp)) return;
  const bitmap = await decoderImage(fichier);
  if (ouvertes.has(emp)) return bitmap.close();
  ouvertes.set(emp, { bitmap, fichier, source: sourceDeBitmap(bitmap) });
}

/** true si l'image d'empreinte `emp` est déjà ouverte ici. */
export function imageOuverte(emp: string): boolean {
  return ouvertes.has(emp);
}

/**
 * Oublie les images que la recette n'utilise plus (ferme les ImageBitmap). À appeler quand on change de montage,
 * pas après chaque geste (Annuler doit pouvoir faire revenir une image retirée).
 */
export function garderImagesDe(recette: Recette): void {
  const gardees = new Set((recette.images ?? []).map((i) => i.emp));
  for (const [emp, o] of ouvertes) {
    if (gardees.has(emp)) continue;
    o.bitmap.close();
    ouvertes.delete(emp);
  }
}

/** Table id d'image de la recette → image décodée (les images pas encore ouvertes sont absentes). */
export function imagesDe(recette: Recette): ReadonlyMap<string, ImageSource> {
  const res = new Map<string, ImageSource>();
  for (const i of recette.images ?? []) {
    const o = ouvertes.get(i.emp);
    if (o) res.set(i.id, o.source);
  }
  return res;
}

/** Fichiers des images de la recette déjà ouvertes, par empreinte (pour le Worker d'export). */
export function fichiersImagesDe(recette: Recette): Record<string, Blob> {
  const res: Record<string, Blob> = {};
  for (const i of recette.images ?? []) {
    const o = ouvertes.get(i.emp);
    if (o) res[i.emp] = o.fichier;
  }
  return res;
}
