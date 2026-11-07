// D. Casquette à l'envers du papier découpé goofy (perso 2, 7/11/2026). Lisible même en petit : visière bien
// visible derrière la tête (d'une couleur vive qui tranche), ouverture de réglage devant (on voit les cheveux) avec
// sa sangle. Gags : elle saute de la tête (surpris, choqué, hurle, victoire) et part de travers (confus, mort de
// rire, frime…).
// Les anciens styles gardent leur casquette d'origine (chapeaux.ts).

import type { DefinitionChibi, Emotion } from '../../recette/types';
import { assombrir } from '../couleurs';
import { TETE } from '../geometrie';
import type { Pinceau, Pt } from '../pinceau';

/** La casquette saute de la tête (en unités, vers le haut). */
const SAUTE: Partial<Record<Emotion, number>> = { surpris: 7, choque: 8, hurle: 5, victoire: 4 };
/** La casquette part de travers (degrés, autour du bas de la casquette). */
const BIAIS: Partial<Record<Emotion, number>> = { confus: -9, mortDeRire: 9, defaite: -10, dort: 8, malade: -6, frime: 10 };

/** Couleur vive de la visière et de la sangle : jaune, ou rouge si la casquette est déjà jaune / orange. */
export function vifCasquette(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r > 200 && g > 120 && b < 110 ? '#E74C3C' : '#FFD23F';
}

/** Bord du crâne (comme les cheveux), agrandi de `plus`, de l'angle a0 à a1 (degrés). */
function calotte(a0: number, a1: number, plus: number, n = 9): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([Math.cos(a) * (TETE.rx + plus), TETE.cy + Math.sin(a) * (TETE.ry + plus)]);
  }
  return pts;
}

/** Casquette à l'envers du papier (repère de la tête des chibis). `haut` = haut des cheveux. */
export function casquetteEnversPapier(pi: Pinceau, def: DefinitionChibi, emo: Emotion, haut: number) {
  const c = def.couleur;
  const vif = vifCasquette(c);
  const saute = SAUTE[emo] ?? 0;
  const q = saute ? pi.repere(0, -saute, 1, 1) : pi;
  q.tourner(BIAIS[emo] ?? 0, 0, -82, () => {
    // Visière derrière la tête : elle sort en haut, côté gauche, avec son dessous foncé.
    const visiere: Pt[] = [[-4, haut + 2], [-16, haut - 5], [-30, haut - 8], [-41, haut - 5], [-44, haut + 1], [-36, haut + 7], [-22, haut + 12]];
    q.forme('visiereDessous', visiere.map(([x, y]) => [x - 0.5, y + 3] as Pt), assombrir(c, 0.5), { epais: 0.8 });
    q.forme('visiere', visiere, vif, { epais: 0.85 });
    q.forme('casquette', [...calotte(196, 344, 3.5), [31, -80], [0, -82], [-31, -80]], c, { ombre: true });
    // Couture du dessus, un peu de travers.
    q.ligne('couture', [[-1, -82.5], [-2, -90], [0.5, -96.5]], { epais: 0.4, encre: assombrir(c, 0.3) });
    // Ouverture de réglage : on voit les cheveux, et la sangle par-dessus.
    q.forme('ouverture', [[-9, -81.6], [-7.5, -88.5], [0, -91.5], [7.5, -88.5], [9, -81.6]], def.cheveux, { epais: 0.6 });
    q.forme('sangle', [[-11, -86.2], [11, -86.6], [11, -82.4], [-11, -82]], vif, { epais: 0.55, lisse: false });
    for (const x of [-5.5, 0, 5.5]) q.rond(x, -84.3, 0.95, assombrir(vif, 0.4));
  });
  // Traits de saut, de part et d'autre de la casquette.
  if (saute) for (const s of [-1, 1]) pi.ligne(`saut${s}`, [[s * 33, -88], [s * 39, -93]], { epais: 0.55 });
}
