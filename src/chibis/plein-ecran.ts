// D. Chibi plein écran (dev 3), pour l'élément inséré « chibi » du dev 2 (moteur/inserts/carton.ts) : le chibi
// centré, grand, passé par le cache d'images (aperçu = export). Fonction publique, signature stable.

import type { Ctx2D } from '../moteur/canevas';
import type { DefinitionChibi, Emotion, Sec } from '../recette/types';
import { BOUCHE } from './bouche';
import { dessinerChibiCache } from './cache';

/** Hauteur du chibi (tête + corps) en part de l'image ; avec un chapeau ou des signes, ≈ 70 % de l'image au plus. */
export const CHIBI_PLEIN_ECRAN = { taille: 0.5, pieds: 0.78 } as const;

/**
 * Dessine le chibi centré dans une image l × h (fond NON dessiné : c'est au carton de le poser).
 * `t` = temps depuis le début de l'élément (signes animés) ; `parle` = bouche qui bat 6 fois par seconde.
 */
export function dessinerChibiCentre(ctx: Ctx2D, def: DefinitionChibi, emo: Emotion, l: number, h: number, t: Sec = 0, parle = false) {
  const taille = Math.min(h * CHIBI_PLEIN_ECRAN.taille, l * 0.7);
  const bouche = parle && Math.floor(t * BOUCHE.battementSansMots * 2 + 1e-9) % 2 === 0;
  dessinerChibiCache(ctx, def, { emo, bouche, t }, { x: l / 2, y: h * CHIBI_PLEIN_ECRAN.pieds, h: taille });
}
