// Améliorer l'image — le même traitement que gpu.ts, sur le processeur (pur). Référence des tests : qualité mesurée
// (Vitest) et comparaison avec la carte graphique (e2e). Trop lent pour la vidéo : jamais utilisé au rendu.

import { agrandirBicubique, debloquer, renforcer } from './classique';
import { RESTORE_CNN_S } from './poids-restore-cnn-s';
import { UPSCALE_CNN_X2_S } from './poids-upscale-cnn-x2-s';
import type { PlanTraitement } from './reglages';
import { appliquerReseau, borner, type ImageF } from './reseau';

/** Arrondit au 1/255 (comme une texture 8 bits de la carte graphique). */
export function quantifier(img: ImageF): ImageF {
  const d = new Float32Array(img.d.length);
  for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.min(1, Math.max(0, img.d[i]!)) * 255) / 255;
  return { l: img.l, h: img.h, d };
}

/** Applique un plan de traitement à une image (valeurs 0 à 1), étape par étape comme la carte graphique. */
export function executerPlanCpu(source: ImageF, plan: PlanTraitement): ImageF {
  let cur = quantifier(source);
  if (plan.deblocage) cur = quantifier(debloquer(cur, 0.07));
  if (plan.mode === 'ia' && plan.nettoyage > 0) cur = quantifier(appliquerReseau(cur, RESTORE_CNN_S, plan.nettoyage));
  if (plan.agrandissement === 'ia') cur = quantifier(appliquerReseau(cur, UPSCALE_CNN_X2_S, 1));
  else if (plan.agrandissement === 'bicubique') cur = quantifier(agrandirBicubique(cur));
  return quantifier(borner(renforcer(cur, plan.contours)));
}
