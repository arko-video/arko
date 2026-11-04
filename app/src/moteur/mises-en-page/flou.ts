// Mise en page « Fond flou » : la vidéo entière ajustée à la largeur, sur un fond flou de la même image.
// Le fond est dessiné dans un canevas FIXE de 90 × 160 (identique en aperçu et en export) puis agrandi :
// c'est ce qui rend le flou peu coûteux et l'aperçu fidèle à l'export.

import { contexte2D, creerCanevas, type Canevas, type Ctx2D, type Env, type ImageSource } from '../canevas';

export const FLOU_L = 90;
export const FLOU_H = 160;
const RAYON_FLOU = 2.5;
const ASSOMBRISSEMENT = 0.35;
/** Marge pour que les bords flous ne laissent pas de liseré sombre. */
const MARGE_FOND = 1.08;

export interface Rect {
  x: number;
  y: number;
  l: number;
  h: number;
}

/** Position de la vidéo au premier plan : ajustée (contain), centrée horizontalement, centre vertical en y (0 à 1). */
export function placementFlou(srcL: number, srcH: number, l: number, h: number, y = 0.5): Rect {
  const e = Math.min(l / srcL, h / srcH);
  const lv = srcL * e;
  const hv = srcH * e;
  const haut = Math.min(Math.max(y * h - hv / 2, 0), h - hv);
  return { x: (l - lv) / 2, y: haut, l: lv, h: hv };
}

/** Rectangle du fond dans le petit canevas : la vidéo « couvre » tout le cadre, avec 8 % de marge. */
export function placementFond(srcL: number, srcH: number, l = FLOU_L, h = FLOU_H): Rect {
  const e = Math.max(l / srcL, h / srcH) * MARGE_FOND;
  return { x: (l - srcL * e) / 2, y: (h - srcH * e) / 2, l: srcL * e, h: srcH * e };
}

/** Petit canevas de travail du fond flou (un par rendu) : 90 × 160, ou 160 × 90 pour une vidéo 16:9. */
export class FondFlou {
  // Créé au premier dessin seulement (le rendu peut ainsi être construit dans Node, pour les tests du son).
  private petit: { canevas: Canevas; ctx: Ctx2D; filtreDispo: boolean; l: number; h: number } | null = null;

  get canevas(): Canevas {
    return this.preparer(false).canevas;
  }

  private preparer(paysage: boolean) {
    const [l, h] = paysage ? [FLOU_H, FLOU_L] : [FLOU_L, FLOU_H];
    if (!this.petit || this.petit.l !== l) {
      const canevas = creerCanevas(l, h);
      const ctx = contexte2D(canevas);
      this.petit = { canevas, ctx, filtreDispo: typeof ctx.filter === 'string', l, h };
    }
    return this.petit;
  }

  /** Dessine le fond flou de `img` sur toute la destination. */
  dessiner(ctx: Ctx2D, img: ImageSource, env: Env) {
    const { ctx: f, filtreDispo, l, h, canevas } = this.preparer(env.l > env.h);
    const r = placementFond(img.largeur, img.hauteur, l, h);
    f.filter = 'none';
    f.fillStyle = '#000';
    f.fillRect(0, 0, l, h);
    if (filtreDispo) f.filter = `blur(${RAYON_FLOU}px)`;
    img.dessiner(f, 0, 0, img.largeur, img.hauteur, r.x, r.y, r.l, r.h);
    f.filter = 'none';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canevas, 0, 0, env.l, env.h);
    ctx.fillStyle = `rgba(0, 0, 0, ${ASSOMBRISSEMENT})`;
    ctx.fillRect(0, 0, env.l, env.h);
  }
}

/** Dessine la mise en page « Fond flou ». */
export function dessinerFlou(ctx: Ctx2D, img: ImageSource, y: number | undefined, env: Env, fond: FondFlou) {
  fond.dessiner(ctx, img, env);
  const r = placementFlou(img.largeur, img.hauteur, env.l, env.h, y);
  img.dessiner(ctx, 0, 0, img.largeur, img.hauteur, r.x, r.y, r.l, r.h);
}
