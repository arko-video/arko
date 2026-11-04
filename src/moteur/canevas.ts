// Types et outils de canevas communs à la page et au Worker.

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Canevas = HTMLCanvasElement | OffscreenCanvas;

/** Une image source à dessiner (image vidéo décodée, ou <video> pour le mode de secours). */
export interface ImageSource {
  /** Dimensions affichées (après rotation). */
  largeur: number;
  hauteur: number;
  /** Dessine le rectangle source (en pixels affichés) dans le rectangle destination. */
  dessiner(ctx: Ctx2D, sx: number, sy: number, sl: number, sh: number, dx: number, dy: number, dl: number, dh: number): void;
}

/** Environnement de dessin : taille de la destination et échelle par rapport à 1080 px de large. */
export interface Env {
  l: number;
  h: number;
  echelle: number;
}

/** Crée un canevas hors écran (OffscreenCanvas si possible, sinon un <canvas>). */
export function creerCanevas(l: number, h: number): Canevas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(l, h);
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  return c;
}

export function contexte2D(c: Canevas): Ctx2D {
  const ctx = c.getContext('2d', { alpha: false }) as Ctx2D | null;
  if (!ctx) throw new Error('Canevas 2D indisponible');
  return ctx;
}
