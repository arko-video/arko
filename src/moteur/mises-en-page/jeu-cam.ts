// Mise en page « Jeu + webcam » (phase 2) : l'image 9:16 est coupée en deux bandes.
//  - la bande webcam (partCam × hauteur) montre le cadre `cam` de la source, recadré pour remplir la largeur ;
//    elle est en haut si camEnHaut (par défaut), sinon en bas ;
//  - le reste montre le jeu, recadré pour remplir, centré sur x ;
//  - une séparation noire de 6 px (à 1080 px de large) entre les deux.
// Aucun pixel n'est copié à la main : seulement deux drawImage de rectangles.

import { JEU_CAM } from '../../recette/defauts';
import type { MiseEnPage } from '../../recette/types';
import type { Ctx2D, Env, ImageSource } from '../canevas';
import type { Rect } from './flou';
import { cadrageRecadre } from './recadre';

type MiseJeuCam = Extract<MiseEnPage, { type: 'jeuCam' }>;

/** Épaisseur de la séparation noire, en px de référence (1080 de large). */
export const SEPARATION = 6;

/** Un morceau de la source (src, en pixels affichés) dessiné dans un rectangle de la destination (dst). */
export interface Morceau {
  src: Rect;
  dst: Rect;
}

/** Partie de `cadre` (pixels source) au rapport largeur/hauteur `rapport`, centrée : remplit sans déformer. */
function couvrir(cadre: Rect, rapport: number): Rect {
  if (cadre.l / cadre.h > rapport) {
    const l = cadre.h * rapport;
    return { x: cadre.x + (cadre.l - l) / 2, y: cadre.y, l, h: cadre.h };
  }
  const h = cadre.l / rapport;
  return { x: cadre.x, y: cadre.y + (cadre.h - h) / 2, l: cadre.l, h };
}

/** Calcule les deux morceaux (webcam et jeu) pour une source srcL × srcH et une destination l × h. */
export function placementJeuCam(srcL: number, srcH: number, mise: MiseJeuCam, l: number, h: number): { cam: Morceau; jeu: Morceau } {
  const part = mise.partCam ?? JEU_CAM.partCam;
  const camEnHaut = mise.camEnHaut !== false;
  const demiSep = (SEPARATION * (l / 1080)) / 2;
  const jointure = camEnHaut ? part * h : (1 - part) * h;
  const hCam = part * h - demiSep;
  const hJeu = h - part * h - demiSep;
  const dstCam: Rect = { x: 0, y: camEnHaut ? 0 : jointure + demiSep, l, h: hCam };
  const dstJeu: Rect = { x: 0, y: camEnHaut ? jointure + demiSep : 0, l, h: hJeu };

  // Cadre webcam en pixels source, gardé dans l'image.
  const c = mise.cam ?? JEU_CAM.cam;
  const cl = Math.min(1, Math.max(c.l, 0.01)) * srcL;
  const ch = Math.min(1, Math.max(c.h, 0.01)) * srcH;
  const cx = Math.min(Math.max(c.x * srcL, 0), srcL - cl);
  const cy = Math.min(Math.max(c.y * srcH, 0), srcH - ch);
  const srcCam = couvrir({ x: cx, y: cy, l: cl, h: ch }, dstCam.l / dstCam.h);

  const srcJeu = cadrageRecadre(srcL, srcH, dstJeu.l, dstJeu.h, mise.x ?? 0.5);
  return { cam: { src: srcCam, dst: dstCam }, jeu: { src: srcJeu, dst: dstJeu } };
}

/** Zoom limité à une seule bande (phase 3) : `appliquer` pose la transformation pour le rectangle de la bande. */
export interface ZoomBande {
  zone: 'cam' | 'jeu';
  appliquer(ctx: Ctx2D, bande: Rect): void;
}

/** Dessine la mise en page « Jeu + webcam » (le fond noir est déjà posé par le compositeur). */
export function dessinerJeuCam(ctx: Ctx2D, img: ImageSource, mise: MiseJeuCam, env: Env, zoom?: ZoomBande) {
  const { cam, jeu } = placementJeuCam(img.largeur, img.hauteur, mise, env.l, env.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const [nom, m] of [['jeu', jeu], ['cam', cam]] as const) {
    const zoome = zoom?.zone === nom;
    if (zoome) {
      // On découpe la bande, puis on l'agrandit : le zoom ne déborde jamais sur l'autre bande.
      ctx.save();
      ctx.beginPath();
      ctx.rect(m.dst.x, m.dst.y, m.dst.l, m.dst.h);
      ctx.clip();
      zoom.appliquer(ctx, m.dst);
    }
    img.dessiner(ctx, m.src.x, m.src.y, m.src.l, m.src.h, m.dst.x, m.dst.y, m.dst.l, m.dst.h);
    if (zoome) ctx.restore();
  }
}
