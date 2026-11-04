// Mise en page « Plein écran » (recadré) : on garde une bande 9:16 de la source, qui remplit tout l'écran.
// x = centre HORIZONTAL du cadrage dans la source (0 = bord gauche, 1 = bord droit), borné pour ne pas sortir.

import type { Ctx2D, Env, ImageSource } from '../canevas';
import type { Rect } from './flou';

/** Rectangle gardé dans la source (pixels affichés) pour remplir une destination l × h. */
export function cadrageRecadre(srcL: number, srcH: number, l: number, h: number, x = 0.5): Rect {
  const rapport = l / h;
  if (srcL / srcH > rapport) {
    // Source plus large que la destination : on coupe à gauche et à droite.
    const lc = srcH * rapport;
    const gauche = Math.min(Math.max(x * srcL - lc / 2, 0), srcL - lc);
    return { x: gauche, y: 0, l: lc, h: srcH };
  }
  // Source plus haute (déjà verticale) : on coupe en haut et en bas, centré.
  const hc = srcL / rapport;
  return { x: 0, y: (srcH - hc) / 2, l: srcL, h: hc };
}

/** Bornes utiles de x pour l'interface : en dehors, le cadrage ne bouge plus. */
export function bornesX(srcL: number, srcH: number, l: number, h: number): { min: number; max: number } {
  const part = Math.min(1, (srcH * (l / h)) / srcL);
  return { min: part / 2, max: 1 - part / 2 };
}

export function dessinerRecadre(ctx: Ctx2D, img: ImageSource, x: number | undefined, env: Env) {
  const r = cadrageRecadre(img.largeur, img.hauteur, env.l, env.h, x);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  img.dessiner(ctx, r.x, r.y, r.l, r.h, 0, 0, env.l, env.h);
}
