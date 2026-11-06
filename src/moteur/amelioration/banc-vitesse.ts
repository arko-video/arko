// Améliorer l'image — banc de vitesse (navigateur) : temps par image de CET appareil, mesuré sur une image fabriquée
// de la taille de la vidéo, avec le même moteur et le même plan que l'export. Sert au panneau (conseil « seulement à
// l'export » sur téléphone, temps d'export en plus) et à l'e2e.

import { moteurGpu } from './image-amelioree';
import { mediane } from './mesures';
import { choisirPlan, type ModeMoteur, type PlanTraitement, type ReglagesAmelioration } from './reglages';

export interface ResultatVitesse {
  /** Temps par image (ms, médiane). */
  ms: number;
  /** Première image (compilation des shaders comprise). */
  premiereMs: number;
  mode: ModeMoteur;
  plan: PlanTraitement | null;
}

/** Image de jeu fabriquée (carrés de couleurs) de l × h, dessinée une fois. */
function imageFabriquee(l: number, h: number): OffscreenCanvas | HTMLCanvasElement | null {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(l, h) : document.createElement('canvas');
  c.width = l;
  c.height = h;
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) return null;
  for (let y = 0; y < h; y += 16) {
    for (let x = 0; x < l; x += 16) {
      const v = ((x * 7 + y * 13) % 97) / 97;
      ctx.fillStyle = `rgb(${Math.round(60 + 120 * v)}, ${Math.round(140 - 60 * v)}, ${Math.round(40 + 40 * v)})`;
      ctx.fillRect(x, y, 16, 16);
    }
  }
  return c;
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Mesure le temps par image pour une vidéo `l` × `h` dessinée agrandie `echelle` fois (ex. 720p → 1440p : 2).
 * null si l'appareil ne sait pas (pas de WebGL2) ou si l'amélioration n'a rien à faire.
 */
export async function mesurerVitesse(reglages: ReglagesAmelioration, l: number, h: number, echelle: number, n = 5): Promise<ResultatVitesse | null> {
  const m = moteurGpu();
  if (!m) return null;
  const plan = choisirPlan(reglages, m.mode, l, h, echelle);
  const image = plan ? imageFabriquee(l, h) : null;
  if (!plan || !image) return { ms: 0, premiereMs: 0, mode: m.mode, plan: null };
  try {
    let t0 = performance.now();
    m.traiter(image, l, h, plan, true);
    const premiereMs = performance.now() - t0;
    const temps: number[] = [];
    for (let i = 0; i < n; i++) {
      await pause();
      t0 = performance.now();
      m.traiter(image, l, h, plan, true);
      temps.push(performance.now() - t0);
    }
    return { ms: mediane(temps), premiereMs, mode: m.mode, plan };
  } catch (e) {
    console.warn('[Arko] Améliorer l’image : mesure impossible.', e);
    return null;
  }
}
