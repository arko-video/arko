// D. Bonnet du papier découpé goofy (perso 4, 7/11/2026). Un bonnet mou dont la pointe retombe sur le côté avec
// son pompon (côté tiré de la graine) : le pompon ne se pose plus pile sur le dessus de la tête (trophée, flammes).
// Une rayure claire et un revers côtelé plus sombre le rendent lisible en petit, même s'il a la couleur du t-shirt.
// Gags : la pointe se dresse d'un coup (surpris, choqué, hurle) ; elle pend jusqu'à l'épaule en bonnet de nuit
// (dort). Les anciens styles gardent leur bonnet d'origine (chapeaux.ts).

import type { Emotion } from '../../recette/types';
import { assombrir, eclaircir } from '../couleurs';
import type { Pinceau, Pt } from '../pinceau';

/** Pointe du bonnet (côté droit ; miroir à gauche) : angles où elle part du dôme et bout de la pointe. */
interface Pointe { a1: number; a2: number; bout: Pt; ressort?: boolean }

const MOLLE: Pointe = { a1: 255, a2: 335, bout: [44, -96] };
const DRESSEE: Pointe = { a1: 256, a2: 284, bout: [0, -125], ressort: true };
const DE_NUIT: Pointe = { a1: 262, a2: 345, bout: [49, -60] };

/** Le bonnet de nuit pend toujours du côté où la tête penche (dort, triste, défaite : vers la droite du perso). */
const POINTES: Partial<Record<Emotion, Pointe>> = { surpris: DRESSEE, choque: DRESSEE, hurle: DRESSEE, dort: DE_NUIT, triste: DE_NUIT, defaite: DE_NUIT };

/** Point du dôme (ellipse posée sur le revers), angle en degrés (180 = gauche, 270 = haut, 360 = droite). */
function dome(a: number, ry: number): Pt {
  const r = (a * Math.PI) / 180;
  return [Math.cos(r) * 35.5, -80 + Math.sin(r) * ry];
}

/** Bonnet du papier. `haut` = haut des cheveux de la coiffure (une grosse coiffure soulève le bonnet). */
export function bonnetPapier(pi: Pinceau, c: string, emo: Emotion, haut: number) {
  const p = POINTES[emo] ?? MOLLE;
  const s = p === DE_NUIT || pi.hasard('bonnetPapier')() >= 0.5 ? 1 : -1;
  const ry = 22 + Math.max(0, -(haut + 96));
  // Côté gauche : les angles de la pointe sont pris en miroir (a → 540 − a).
  const a1 = s > 0 ? p.a1 : 540 - p.a2;
  const a2 = s > 0 ? p.a2 : 540 - p.a1;
  const bout: Pt = [s * p.bout[0], p.bout[1] - (ry - 22)];
  const pts: Pt[] = [];
  let mise = false;
  for (let a = 180; a <= 360; a += 12) {
    if (a > a1 && a < a2) continue;
    if (!mise && a >= a2) {
      pts.push(dome(a1, ry), bout, dome(a2, ry));
      mise = true;
    }
    pts.push(dome(a, ry));
  }
  pi.forme('bonnet', pts, c, { ombre: true, lisse: false });
  // Rayure claire qui suit le dôme.
  const rayure: Pt[] = [];
  for (let a = 180; a <= 360; a += 15) rayure.push(dome(a, ry * 0.8));
  for (let a = 360; a >= 180; a -= 15) rayure.push(dome(a, ry * 0.58));
  pi.forme('rayure', rayure, eclaircir(c, 0.55), { epais: 0.5, lisse: false });
  pi.forme('revers', [[-35, -85], [35, -84], [34.5, -75.5], [-34.5, -76]], assombrir(c, 0.18), { epais: 0.8, lisse: false });
  for (let i = -28; i <= 28; i += 7) pi.ligne(`cote${i}`, [[i, -83], [i, -77.5]], { epais: 0.4, encre: assombrir(c, 0.45) });
  pi.forme('pompon', pi.ovale('pompon', bout[0] + s * 1.5, bout[1] + 1, 6.8, 6.4, 12, 0.2), '#FFFFFF', { epais: 0.7, ombre: true });
  if (p.ressort) for (const k of [-1, 1]) {
    pi.ligne(`boing${k}a`, [[k * 9, bout[1] + 2], [k * 13, bout[1] - 4]], { epais: 0.6 });
    pi.ligne(`boing${k}b`, [[k * 10, bout[1] + 9], [k * 15, bout[1] + 6]], { epais: 0.6 });
  }
}
