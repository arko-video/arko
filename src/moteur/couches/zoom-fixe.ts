// C. Zoom fixe d'un plan (dev 2) : « punch-in » tenu pendant tout le plan (×1,32 sur un moment fort,
// ×1,12 un plan sur trois). Appliqué au contexte AVANT la mise en page, comme un zoom (couches/zooms.ts),
// et combiné avec lui (les échelles se multiplient). Branché dans compositeur.ts (aperçu = export).
// En Jeu + webcam, il ne zoome que la bande du jeu (le compositeur passe le rectangle de la bande).

import { CENTRE_ZOOMS_AUTO as CENTRE } from '../../auto/habillage/zooms-auto';
import type { ZoomFixe } from '../../recette/types';
import type { Ctx2D, Env } from '../canevas';
import type { Rect } from '../mises-en-page/flou';

/**
 * Applique le zoom fixe du plan au contexte. Centre (x, y) RELATIF au cadre zoomé (toute l'image par défaut) :
 * x 0,5 ; y 0,45, un peu au-dessus du milieu. Agrandir autour d'un point du cadre garde le cadre couvert.
 */
export function appliquerZoomFixe(ctx: Ctx2D, zoom: ZoomFixe | undefined, env: Env, cadre?: Rect): void {
  if (!zoom || !(zoom.force > 1.0001)) return;
  const r = cadre ?? { x: 0, y: 0, l: env.l, h: env.h };
  const px = r.x + Math.min(1, Math.max(0, zoom.x ?? CENTRE.x)) * r.l;
  const py = r.y + Math.min(1, Math.max(0, zoom.y ?? CENTRE.y)) * r.h;
  ctx.translate(px, py);
  ctx.scale(zoom.force, zoom.force);
  ctx.translate(-px, -py);
}
