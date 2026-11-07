// D. Tête des styles « Persos » : repères (tête, visage, torse) qui reposent les dessins des chibis sur les
// proportions du style, forme de la tête selon le style, et la tête complète (oreilles, teintes, visage, cheveux,
// chapeaux, signes). Le papier découpé a son visage goofy (papier.ts).

import type { DefinitionChibi } from '../../recette/types';
import type { StylePerso } from '../catalogue';
import { bulle, sousLesYeux, surLaTete, surLesYeux } from '../chapeaux';
import { cheveuxAvant } from '../coiffures';
import type { Pt } from '../courbes';
import type { PoseChibi } from '../dessin';
import type { Expression } from '../expressions';
import { TETE, VISAGE } from '../geometrie';
import type { Pinceau } from '../pinceau';
import { signesVisage, teintes } from '../signes';
import { habits, tenueDevant } from '../tenues';
import { bouche, sourcils, unOeil, yeux } from '../visage';
import type { Fiche } from './fiches';
import { visageGoofy } from './papier';

/** Repère de la tête : la tête des chibis (centre (0, −66), rayons 33 × 29) posée sur celle du perso. */
export function repereTete(pi: Pinceau, f: Fiche): Pinceau {
  const ex = f.tete.rx / TETE.rx;
  const ey = f.tete.ry / TETE.ry;
  return pi.repere(0, f.tete.cy - TETE.cy * ey, ex, ey, f.traitTete);
}

/** Repère du visage (dans celui de la tête) : yeux et bouche agrandis de `k` autour du milieu du visage. */
export function repereVisage(t: Pinceau, f: Fiche): Pinceau {
  const k = f.visage.k;
  return t.repere(0, -60 + f.visage.dy + 60 * k, k, k, 1);
}

/** Repère du torse : le torse des chibis (x ± 15, y −39 à −11) posé sur celui du perso. */
export function repereTorse(pi: Pinceau, f: Fiche): Pinceau {
  const t = f.torse;
  const ex = (t.lh + t.lb) / 2 / 15;
  const ey = (t.bas - t.haut) / 28;
  return pi.repere(0, t.haut + 39 * ey, ex, ey, 0.8);
}

/** Forme de la tête selon le style (repère de la tête des chibis). */
function formeTete(t: Pinceau, style: StylePerso, def: DefinitionChibi) {
  switch (style) {
    case 'bd':
      return t.forme('tete', [[0, -95.5], [22, -91], [32, -76], [31, -60], [22, -44], [8, -37.5], [-8, -37.5], [-22, -44], [-31, -60], [-32, -76], [-22, -91]], def.peau, { ombre: true });
    case 'rate':
      return t.forme('tete', t.ovale('tete', 0, -66, 33, 29, 9, 0.16), def.peau);
    case 'papier':
      return t.forme('tete', t.ovale('tete', 0, -66, 33, 29, 11, 0.02), def.peau, { lisse: false });
    case 'pixel':
      return t.forme('tete', [[-24, -95], [24, -95], [33, -84], [33, -48], [22, -37], [-22, -37], [-33, -48], [-33, -84]], def.peau, { lisse: false });
    default:
      return t.forme('tete', t.ovale('tete', 0, -66, 33, 29, 12, 0.015), def.peau);
  }
}

/** Mascotte : le bas du rond prend la couleur de la tenue (comme une grenouillère). */
function habitMascotte(t: Pinceau, def: DefinitionChibi) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = ((32 + (116 * i) / 12) * Math.PI) / 180;
    pts.push([Math.cos(a) * 32.6, -66 + Math.sin(a) * 28.6]);
  }
  pts.push([-18, -49.5], [0, -48], [18, -49.5]);
  t.forme('habit', pts, habits(def).torse, { epais: 0.8 });
}

/** Bonhomme raté : les deux yeux ne font pas la même taille ni la même hauteur (tiré de la graine). */
function yeuxRates(v: Pinceau, def: DefinitionChibi, ex: Expression) {
  const h = v.hasard('yeuxRates');
  const gros = h() < 0.5 ? 1 : -1;
  for (const s of [-1, 1] as const) {
    const k = s === gros ? 1.22 : 0.86;
    const x = s * VISAGE.yeuxX;
    const y = VISAGE.yeuxY + (s === gros ? -1.5 : 1.5);
    unOeil(v.repere(x * (1 - k), y * (1 - k), k, k), def, ex.yeux, s, x, y);
  }
}

export function tete(t: Pinceau, f: Fiche, style: StylePerso, def: DefinitionChibi, ex: Expression, pose: PoseChibi, ph: number, lunettes = false) {
  if (f.oreilles) for (const s of [-1, 1]) t.forme(`oreille${s}`, t.ovale(`oreille${s}`, s * (TETE.rx - 1), TETE.cy + 2, 5, 6.5, 7), def.peau, { epais: 0.85 });
  formeTete(t, style, def);
  if (style === 'mascotte') {
    habitMascotte(t, def);
    // Les gilets (cow-boy, pirate) ressembleraient à des mains sur un si petit ventre : seulement les autres détails.
    if (def.tenue !== 'cowboy' && def.tenue !== 'pirate') tenueDevant(t.repere(0, -35, 1.45, 0.4, 1), def);
  }
  // Papier avec une barbe : les teintes (rage, malade, choqué) passent APRÈS la barbe, sinon elle les cache.
  const teintesApres = style === 'papier' && def.accessoire === 'barbe';
  if (!teintesApres) teintes(t, ex.signes);
  const v = repereVisage(t, f);
  if (style === 'papier') visageGoofy(v, def, ex, pose.emo, pose.bouche, ph, lunettes, teintesApres ? () => teintes(t, ex.signes) : undefined);
  else {
    sousLesYeux(v, def);
    if (style === 'rate') yeuxRates(v, def, ex);
    else yeux(v, def, ex);
    surLesYeux(v, def, pose.emo);
    bouche(v, ex.bouche[pose.bouche ? 1 : 0]);
  }
  cheveuxAvant(t, def);
  surLaTete(t, def, pose.emo);
  sourcils(v, ex.sourcils);
  signesVisage(v, ex.signes, ph);
  bulle(t, def);
}
