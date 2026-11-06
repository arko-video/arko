// Ma bibliothèque : ouvre une vidéo importée (Fonds verts, Mèmes) pour la vérifier (lisible ici ? durée, taille),
// en tirer une petite image et chercher un fond vert (ou bleu) sur les bords d'une image du milieu du début.
// Tout se passe sur l'appareil.

import { ErreurArko } from '../moteur/erreurs';
import { fermerMedia, ouvrirMedia } from '../moteur/media';
import { imageDeSample } from '../moteur/rendre';
import { detecterFond } from '../moteur/incrustation/chroma';
import type { MonClip } from '../stockage/clips';

/** Un clip de bibliothèque dure 10 minutes au plus. */
export const DUREE_MAX_CLIP_S = 600;

export interface InfosClip {
  duree: number;
  l: number;
  h: number;
  fond: MonClip['fond'];
  vignette?: string;
}

async function enDataUrl(b: Blob): Promise<string> {
  const octets = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return `data:${b.type};base64,${btoa(s)}`;
}

/** Vérifie et décrit un clip. Lève ErreurArko (format, codec_video, pas_de_video, trop_long). */
export async function inspecterClip(f: Blob): Promise<InfosClip> {
  const media = await ouvrirMedia(f, 'video');
  try {
    if (media.duree > DUREE_MAX_CLIP_S) throw new ErreurArko('Ce clip dure plus de 10 minutes.', 'trop_long');
    const infos: InfosClip = { duree: Math.round(media.duree * 100) / 100, l: media.largeur, h: media.hauteur, fond: null };
    const sample = await media.sinkVideo?.getSample(Math.min(0.5, media.duree / 2)).catch(() => null);
    if (!sample || typeof OffscreenCanvas === 'undefined') return infos;
    try {
      const img = imageDeSample(sample);
      // Image d'analyse : 320 px de large au plus.
      const e = Math.min(1, 320 / img.largeur);
      const l = Math.max(2, Math.round(img.largeur * e));
      const h = Math.max(2, Math.round(img.hauteur * e));
      const c = new OffscreenCanvas(l, h);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return infos;
      img.dessiner(ctx, 0, 0, img.largeur, img.hauteur, 0, 0, l, h);
      const fond = detecterFond(ctx.getImageData(0, 0, l, h).data, l, h);
      if (fond) infos.fond = { couleur: fond.couleur, type: fond.type };
      // Vignette : 96 px de haut, JPEG.
      const ev = 96 / h;
      const v = new OffscreenCanvas(Math.max(2, Math.round(l * ev)), 96);
      v.getContext('2d')?.drawImage(c, 0, 0, v.width, v.height);
      infos.vignette = await enDataUrl(await v.convertToBlob({ type: 'image/jpeg', quality: 0.7 }));
    } finally {
      sample.close();
    }
    return infos;
  } finally {
    fermerMedia(media);
  }
}
