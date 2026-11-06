// D. Rogner une capture d'écran (dev 1) : le moteur dessine la source SANS ses bords fixes (barre de titre,
// barre des tâches). On enveloppe l'image décodée : la partie gardée devient « toute l'image », donc toutes les
// mises en page (flou, recadre, jeu + webcam), les zooms et les transitions marchent sans rien changer.
// Branché dans rendre.ts (un seul chemin de rendu : aperçu = export). Fichier du dev 1.

import type { Recette, Rognage } from '../recette/types';
import type { ImageSource } from './canevas';

/** Rognages de la recette, par id de source vidéo (pure). */
export function rognagesParSource(recette: Pick<Recette, 'rognages'>): ReadonlyMap<string, Rognage> {
  return new Map((recette.rognages ?? []).map((r) => [r.src, r]));
}

/**
 * Image source vue à travers le rognage `r` : largeur et hauteur = celles de la partie gardée (pixels entiers), et
 * dessiner(sx, sy, …) lit dans cette partie. Sans rognage : l'image telle quelle (même objet).
 */
export function imageRognee(image: ImageSource, r: Rognage | undefined): ImageSource {
  if (!r) return image;
  const L = image.largeur;
  const H = image.hauteur;
  const x0 = Math.min(L - 1, Math.max(0, Math.round(r.x * L)));
  const y0 = Math.min(H - 1, Math.max(0, Math.round(r.y * H)));
  const largeur = Math.max(1, Math.min(L - x0, Math.round(r.l * L)));
  const hauteur = Math.max(1, Math.min(H - y0, Math.round(r.h * H)));
  if (x0 === 0 && y0 === 0 && largeur === L && hauteur === H) return image;
  return {
    largeur,
    hauteur,
    dessiner: (ctx, sx, sy, sl, sh, dx, dy, dl, dh) => image.dessiner(ctx, x0 + sx, y0 + sy, sl, sh, dx, dy, dl, dh),
  };
}
