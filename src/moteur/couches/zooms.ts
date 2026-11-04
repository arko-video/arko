// Zooms « punch » et « doux » (phase 3). Les zooms sont posés en temps source dans la recette ;
// la chronologie (poser) les a déjà convertis en temps de sortie : ici on ne voit que des temps de sortie.
//  - punch : entrée en 0,08 s, maintien, sortie en 0,12 s ;
//  - doux : montée lente avec une courbe douce (effet Ken Burns), puis retour doux à la fin.
// Échelle = 1 + (force − 1) × courbe, centrée sur (x, y) de l'image finale (le point qu'on fait glisser sur l'aperçu).
// En jeu + webcam, `zone` cam ou jeu ne zoome QUE cette bande (découpe + transformation de la seule bande).

import { ZOOM } from '../../recette/defauts';
import type { MiseEnPage, Zoom } from '../../recette/types';
import type { Ctx2D, Env } from '../canevas';
import type { ZoomActif } from '../etat-image';
import type { Rect } from '../mises-en-page/flou';

export const PUNCH_ENTREE = 0.08;
export const PUNCH_SORTIE = 0.12;
/** Zoom doux : part de la durée pour monter (le reste sert à revenir). */
const DOUX_MONTEE = 0.75;

/** Courbe douce de 0 à 1 (départ et arrivée sans à-coup). */
function douce(x: number): number {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
}

/** Part du zoom (0 = pas de zoom, 1 = force maximale) à `ecoule` secondes d'un zoom de `dur` secondes. */
export function courbeZoom(style: Zoom['style'], ecoule: number, dur: number): number {
  if (ecoule < 0 || ecoule > dur) return 0;
  if (style === 'doux') {
    const a = ecoule / dur;
    return a < DOUX_MONTEE ? douce(a / DOUX_MONTEE) : douce((1 - a) / (1 - DOUX_MONTEE));
  }
  // punch : entrée très rapide (fin adoucie), maintien, sortie rapide.
  const entree = Math.min(PUNCH_ENTREE, dur / 2);
  const sortie = Math.min(PUNCH_SORTIE, dur / 2);
  if (ecoule < entree) return 1 - (1 - ecoule / entree) ** 2;
  if (ecoule > dur - sortie) return douce((dur - ecoule) / sortie);
  return 1;
}

/** Agrandissement du zoom actif (1 = aucun). */
export function echelleZoom(z: ZoomActif | null): number {
  if (!z) return 1;
  const dur = z.zoom.dur ?? ZOOM.dur;
  const force = z.zoom.force ?? ZOOM.force;
  return 1 + (force - 1) * courbeZoom(z.zoom.style ?? ZOOM.style, z.avancement * dur, dur);
}

/** Bande réellement zoomée : cam ou jeu seulement en Jeu + webcam ; sinon toute l'image. */
export function zoneDuZoom(z: ZoomActif | null, mise: MiseEnPage): 'tout' | 'cam' | 'jeu' {
  if (!z || mise.type !== 'jeuCam') return 'tout';
  return z.zoom.zone ?? 'cam';
}

/**
 * Applique la transformation du zoom au contexte (avant le dessin de la mise en page).
 * `cadre` = rectangle zoomé (toute l'image par défaut) : le centre (x, y) y est ramené.
 */
export function appliquerZoom(ctx: Ctx2D, zoom: ZoomActif | null, env: Env, cadre?: Rect): void {
  const e = echelleZoom(zoom);
  if (!zoom || e <= 1.0001) return;
  const r = cadre ?? { x: 0, y: 0, l: env.l, h: env.h };
  const px = Math.min(r.x + r.l, Math.max(r.x, (zoom.zoom.x ?? ZOOM.x) * env.l));
  const py = Math.min(r.y + r.h, Math.max(r.y, (zoom.zoom.y ?? ZOOM.y) * env.h));
  // Agrandir autour d'un point situé DANS le cadre garde le cadre entièrement couvert.
  ctx.translate(px, py);
  ctx.scale(e, e);
  ctx.translate(-px, -py);
}
