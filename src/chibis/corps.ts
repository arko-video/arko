// D. Corps des chibis (dev 3) : jambes courtes, torse en poire, bras en saucisse attachés aux épaules (jamais de
// membre qui flotte : chaque bras part de l'intérieur du torse), mains rondes (poing, doigt pointé, pouce levé).

import type { DefinitionChibi } from '../recette/types';
import { assombrir } from './couleurs';
import type { PoseBras } from './expressions';
import { EPAULE, TORSE } from './geometrie';
import type { Pinceau, Pt } from './pinceau';
import { habits, poignet } from './tenues';

type Main = 'ouverte' | 'poing' | 'doigt' | 'pouce';

interface Bras {
  main: Pt;
  /** Coude poussé vers l'extérieur (unités). */
  coude: number;
  forme: Main;
  /** Dessiné devant la tête (main au menton, sur les joues). */
  devant?: boolean;
}

/** Position des mains (côté droit = x positif ; le gauche est donné tel quel, x négatif). */
export function posesBras(p: PoseBras): [Bras, Bras] {
  const bas: Bras = { main: [20, -19], coude: 1, forme: 'ouverte' };
  const sym = (b: Bras): Bras => ({ ...b, main: [-b.main[0], b.main[1]] });
  switch (p) {
    case 'bas': return [bas, sym(bas)];
    case 'leves': { const b: Bras = { main: [34, -54], coude: 3, forme: 'ouverte' }; return [b, sym(b)]; }
    case 'poings': { const b: Bras = { main: [10, -26], coude: 5, forme: 'poing' }; return [b, sym(b)]; }
    case 'ventre': { const b: Bras = { main: [7, -21], coude: 5, forme: 'ouverte' }; return [b, sym(b)]; }
    case 'joues': { const b: Bras = { main: [25, -50], coude: 6, forme: 'ouverte', devant: true }; return [b, sym(b)]; }
    case 'ecartes': { const b: Bras = { main: [30, -35], coude: -2, forme: 'ouverte' }; return [b, sym(b)]; }
    case 'menton': return [{ main: [6, -41], coude: 8, forme: 'poing', devant: true }, sym(bas)];
    case 'tete': return [{ main: [31, -66], coude: 4, forme: 'ouverte' }, sym(bas)];
    case 'pointe': return [{ main: [33, -39], coude: -1, forme: 'doigt' }, { main: [-7, -21], coude: 5, forme: 'ouverte' }];
    case 'pouce': return [{ main: [24, -39], coude: 3, forme: 'pouce' }, sym(bas)];
    case 'unLeve': return [{ main: [31, -58], coude: 2, forme: 'poing' }, sym({ main: [10, -26], coude: 5, forme: 'poing' })];
  }
}

/** Jambes et chaussures (ou bas de la robe). */
export function jambes(pi: Pinceau, def: DefinitionChibi) {
  const h = habits(def);
  for (const s of [-1, 1] as const) {
    const n = s < 0 ? 'g' : 'd';
    if (!h.robe) {
      const j: Pt[] = [[s * 2, -15], [s * 11, -15], [s * 10.5, -3.5], [s * 2.5, -3.5]];
      pi.forme(`jambe${n}`, j, h.jambes, { lisse: false, ombre: true });
    }
    pi.forme(`pied${n}`, pi.ovale(`pied${n}`, s * 8, -3, 7, 3.6, 8), h.chaussures, { epais: 0.9 });
  }
}

/** Torse (ou robe). */
export function torse(pi: Pinceau, def: DefinitionChibi) {
  const h = habits(def);
  const pts: readonly Pt[] = h.robe ? [[-11, -39], [11, -39], [15, -27], [19, -6], [0, -4.5], [-19, -6], [-15, -27]] : TORSE;
  pi.forme('torse', pts, h.torse, { ombre: true });
}

/** Un bras : saucisse de l'épaule à la main, coude un peu poussé, main au bout. */
export function bras(pi: Pinceau, def: DefinitionChibi, b: Bras, cote: 1 | -1) {
  const h = habits(def);
  const n = cote > 0 ? 'd' : 'g';
  const a: Pt = [cote * EPAULE[0], EPAULE[1]];
  const m = b.main;
  const dx = m[0] - a[0];
  const dy = m[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  // Normale vers l'extérieur (côté du bras).
  let nx = -dy / l;
  let ny = dx / l;
  if (nx * cote < 0) {
    nx = -nx;
    ny = -ny;
  }
  const c: Pt = [(a[0] + m[0]) / 2 + nx * b.coude, (a[1] + m[1]) / 2 + ny * b.coude];
  const pts = [a, c, m];
  const larg = [3.9, 3.4, 3.1];
  const g: Pt[] = [];
  const d: Pt[] = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, 2)]!;
    const o = pts[Math.max(i - 1, 0)]!;
    const tx = q[0] - o[0];
    const ty = q[1] - o[1];
    const tl = Math.hypot(tx, ty) || 1;
    const w = larg[i]!;
    g.push([p[0] - (ty / tl) * w, p[1] + (tx / tl) * w]);
    d.push([p[0] + (ty / tl) * w, p[1] - (tx / tl) * w]);
  });
  // L'épaule rentre dans le torse (pas de bras qui flotte).
  const epaule: Pt = [a[0] - cote * 2, a[1] + 1];
  pi.forme(`bras${n}`, [epaule, ...g, ...d.reverse()], h.bras, { epais: 0.85 });
  if (h.mancheCourte) {
    const mc: Pt = [a[0] + (c[0] - a[0]) * 0.55, a[1] + (c[1] - a[1]) * 0.55];
    pi.forme(`manche${n}`, pi.ovale(`manche${n}`, (a[0] + mc[0]) / 2, (a[1] + mc[1]) / 2, 5, 4.6, 7), h.mancheCourte, { epais: 0.8 });
  }
  poignet(pi, def, n, c, m);
  main(pi, h.mains, b.forme, m, [dx / l, dy / l], cote, n);
}

function main(pi: Pinceau, couleur: string, forme: Main, m: Pt, dir: Pt, cote: 1 | -1, n: string) {
  const r = forme === 'poing' ? 5 : 4.7;
  if (forme === 'doigt') {
    const f: Pt = [m[0] + dir[0] * 7, m[1] + dir[1] * 7];
    pi.forme(`doigt${n}`, [[m[0], m[1] - 1.4], [f[0], f[1] - 1.1], [f[0] + 1, f[1]], [f[0], f[1] + 1.1], [m[0], m[1] + 1.4]], couleur, { epais: 0.7 });
  }
  if (forme === 'pouce') pi.forme(`pouce${n}`, [[m[0] - 1.6, m[1]], [m[0] - 1.5, m[1] - 7], [m[0], m[1] - 8], [m[0] + 1.5, m[1] - 7], [m[0] + 1.6, m[1]]], couleur, { epais: 0.7 });
  pi.forme(`main${n}`, pi.ovale(`main${n}`, m[0], m[1], r, r * 0.95, 7, 0.08), couleur, { epais: 0.85 });
  if (forme === 'poing') pi.ligne(`phalanges${n}`, [[m[0] - cote * 2.2, m[1] - 2], [m[0] - cote * 0.2, m[1] - 0.5], [m[0] - cote * 2.2, m[1] + 1.6]], { epais: 0.4, encre: assombrir(couleur, 0.5) });
}
