// B. Image d'un élément inséré sans vidéo (dev 2), dans LE chemin de rendu (rendre.ts → compositeur) : l'élément
// devient une ImageSource ordinaire, dessinée avec la mise en page du plan (image : fond flou ; carton et chibi :
// plein écran), puis transitions, zooms, textes et sous-titres comme pour une vidéo. Aperçu = export.
// Contrat : conception/contrat-wankil.md §4.1. Les images fixes arrivent déjà décodées (OptionsRendu.images).
// Carton et chibi : dessinés une fois par (plan, taille) dans un canevas gardé (8 au plus), puis recopiés.

import type { PlanPlace } from '../../recette/chronologie';
import type { Recette } from '../../recette/types';
import { creerCanevas, type Canevas, type Ctx2D, type Env, type ImageSource } from '../canevas';
import { policesChargees } from '../polices';
import { dessinerCarton, dessinerChibiPleinEcran } from './carton';

export interface Inserts {
  /** Image du plan s'il est un élément sans vidéo (image, carton, chibi) ; null pour un plan vidéo. */
  image(plan: PlanPlace, env: Env): ImageSource | null;
}

/** Nombre de canevas de cartons / chibis gardés par rendu. */
export const CACHE_INSERTS = 8;

/** Image vide (noire : le compositeur peint le fond en noir) : image fixe pas encore ouverte. */
function vide(env: Env): ImageSource {
  return { largeur: env.l, hauteur: env.h, dessiner: () => undefined };
}

/** Dessine l'élément (carton ou chibi) sur un contexte l × h. */
export function dessinerElement(ctx: Ctx2D, recette: Recette, plan: Pick<PlanPlace, 'ins'>, env: Env): void {
  const el = plan.ins;
  if (el?.type === 'carton') dessinerCarton(ctx, el, env.l, env.h, env.echelle);
  else if (el?.type === 'chibi')
    dessinerChibiPleinEcran(ctx, el, recette.personnes ?? [], env.l, env.h, env.echelle);
}

/**
 * Prépare les éléments insérés de la recette. null s'il n'y en a aucun (le rendu est alors exactement celui d'avant).
 * `images` : id d'image de la recette → image décodée.
 */
export function preparerInserts(recette: Recette, images?: ReadonlyMap<string, ImageSource>): Inserts | null {
  if (!recette.plans.some((p) => p.ins && p.ins.type !== 'clip')) return null;
  const canevas = new Map<string, Canevas>();

  function fabriquee(plan: PlanPlace, env: Env): ImageSource {
    const cle = `${plan.i}|${env.l}x${env.h}`;
    return {
      largeur: env.l,
      hauteur: env.h,
      dessiner(ctx, sx, sy, sl, sh, dx, dy, dl, dh) {
        let c = canevas.get(cle);
        if (!c) {
          c = creerCanevas(Math.max(1, Math.round(env.l)), Math.max(1, Math.round(env.h)));
          const cc = c.getContext('2d') as Ctx2D | null;
          if (!cc) return;
          dessinerElement(cc, recette, plan, env);
          // Gardé seulement avec les vraies polices (sinon redessiné à l'image suivante).
          if (policesChargees()) {
            if (canevas.size >= CACHE_INSERTS) canevas.delete(canevas.keys().next().value!);
            canevas.set(cle, c);
          }
        }
        ctx.drawImage(c, sx, sy, sl, sh, dx, dy, dl, dh);
      },
    };
  }

  return {
    image(plan, env) {
      const el = plan.ins;
      if (!el || el.type === 'clip') return null;
      if (el.type === 'image') return images?.get(el.img) ?? vide(env);
      return fabriquee(plan, env);
    },
  };
}
