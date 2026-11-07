// D. Corps des 6 styles « Persos » : bras et jambes (effilés en BD, tuyaux souples en dessin animé, bâtons du
// bonhomme raté, pièces articulées du papier découpé, mini bras de la mascotte), torse, mains, pieds, robe. Les
// couleurs viennent de la tenue (tenues.ts : habits), comme pour les chibis.

import type { DefinitionChibi } from '../../recette/types';
import { assombrir } from '../couleurs';
import type { Pt } from '../courbes';
import type { Pinceau } from '../pinceau';
import { habits, poignet } from '../tenues';
import type { Fiche } from './fiches';
import type { Membre } from './squelette';

/** Contour d'un ruban le long de points, avec une demi-largeur par point. */
export function ruban(pts: readonly Pt[], larg: readonly number[]): Pt[] {
  const g: Pt[] = [];
  const d: Pt[] = [];
  pts.forEach((p, i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)]!;
    const o = pts[Math.max(i - 1, 0)]!;
    const tx = q[0] - o[0];
    const ty = q[1] - o[1];
    const tl = Math.hypot(tx, ty) || 1;
    const w = larg[i] ?? larg[larg.length - 1]!;
    g.push([p[0] - (ty / tl) * w, p[1] + (tx / tl) * w]);
    d.push([p[0] + (ty / tl) * w, p[1] - (tx / tl) * w]);
  });
  return [...g, ...d.reverse()];
}

/** Point sur une courbe douce a → b → c (pour les bras « tuyaux »). */
function courbe(m: Membre, n = 6): Pt[] {
  const res: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    res.push([u * u * m.a[0] + 2 * u * t * m.b[0] + t * t * m.c[0], u * u * m.a[1] + 2 * u * t * m.b[1] + t * t * m.c[1]]);
  }
  return res;
}

/** Un bras ou une jambe (sans la main ni le pied). */
export function membre(pi: Pinceau, f: Fiche, nom: string, m: Membre, couleur: string, w: number) {
  switch (f.membres) {
    case 'batons':
      return pi.ligne(nom, [m.a, m.b, m.c], { epais: 1.7 });
    case 'tuyaux':
      return pi.forme(nom, ruban(courbe(m), [w * 1.1, w, w, w, w, w, w * 0.95]), couleur, { epais: 0.85 });
    case 'pieces': {
      pi.forme(`${nom}1`, ruban([m.a, m.b], [w * 1.05, w * 0.95]), couleur, { lisse: false });
      pi.forme(`${nom}2`, ruban([m.b, m.c], [w * 0.95, w * 0.85]), assombrir(couleur, 0.06), { lisse: false });
      pi.rond(m.b[0], m.b[1], w * 0.32, '#C9A24A');
      return pi.rond(m.a[0], m.a[1], w * 0.32, '#C9A24A');
    }
    case 'moignons':
      return pi.forme(nom, ruban([m.a, m.c], [w, w * 0.85]), couleur, { epais: 0.9 });
    default:
      return pi.forme(nom, ruban([m.a, m.b, m.c], [w * 1.08, w * 0.9, w * 0.78]), couleur, { ombre: true });
  }
}

/** Main au bout d'un bras (poing, doigt pointé, pouce levé). */
export function main(pi: Pinceau, f: Fiche, nom: string, m: Membre, couleur: string) {
  const r = f.main * (m.forme === 'poing' ? 1.08 : 1);
  const dx = m.c[0] - m.b[0];
  const dy = m.c[1] - m.b[1];
  const l = Math.hypot(dx, dy) || 1;
  const u: Pt = [dx / l, dy / l];
  const c = m.c;
  if (m.forme === 'doigt') pi.forme(`doigt${nom}`, ruban([c, [c[0] + u[0] * r * 2.1, c[1] + u[1] * r * 2.1]], [r * 0.36, r * 0.3]), couleur, { epais: 0.7 });
  if (m.forme === 'pouce') pi.forme(`pouce${nom}`, ruban([c, [c[0], c[1] - r * 2]], [r * 0.38, r * 0.32]), couleur, { epais: 0.7 });
  if (f.membres === 'batons') return pi.forme(`main${nom}`, pi.ovale(`main${nom}`, c[0], c[1], r, r * 0.9, 6, 0.2), couleur, { epais: 0.9 });
  pi.forme(`main${nom}`, pi.ovale(`main${nom}`, c[0], c[1], r, r * 0.95, f.membres === 'pieces' ? 11 : 8, 0.05), couleur, { epais: 0.85, lisse: f.membres !== 'pieces' });
  if (m.forme === 'poing' && f.main > 3.2) pi.ligne(`phalanges${nom}`, [[c[0] - r * 0.45, c[1] - r * 0.35], [c[0] - r * 0.05, c[1]], [c[0] - r * 0.45, c[1] + r * 0.35]], { epais: 0.4, encre: assombrir(couleur, 0.5) });
}

/** Pied (chaussure) au bout d'une jambe, pointé vers l'extérieur. */
export function pied(pi: Pinceau, f: Fiche, nom: string, m: Membre, cote: 1 | -1, couleur: string) {
  const p = f.pied;
  const x = m.c[0] + cote * p.l * 0.35;
  const y = m.c[1] - p.h * 0.45;
  if (f.membres === 'pieces') return pi.forme(nom, [[x - p.l, y + p.h], [x - p.l, y - p.h * 0.6], [x + p.l * 0.3, y - p.h], [x + p.l, y + p.h]], couleur, { lisse: false });
  pi.forme(nom, pi.ovale(nom, x, y, p.l, p.h, 8, 0.05), couleur, { epais: 0.9 });
}

/** Points du torse selon sa forme (repère du corps). */
function pointsTorse(f: Fiche, robe: boolean): Pt[] {
  const { haut: h, bas: b, lh, lb } = f.torse;
  const m = h + (b - h) * 0.55;
  if (robe) return [[-lh * 0.8, h], [lh * 0.8, h], [lh, h + 4], [lb * 1.9, -5], [0, -4], [-lb * 1.9, -5], [-lh, h + 4]];
  switch (f.torse.forme) {
    case 'poire': return [[-lh * 0.7, h], [lh * 0.7, h], [lh, h + 4], [lb, m + 4], [lb * 0.9, b], [-lb * 0.9, b], [-lb, m + 4], [-lh, h + 4]];
    case 'sac': return [[-lh, h + 1], [0, h - 0.5], [lh, h + 1.5], [lb * 1.05, m], [lb, b], [0, b + 1.5], [-lb, b - 0.5], [-lb * 0.95, m]];
    case 'bloc': return [[-lh, h], [lh, h], [lh, h + 3], [lb, b], [-lb, b], [-lh, h + 3]];
    case 'decoupe': return [[-lh, h + 1], [lh, h], [lb, b], [-lb, b + 0.5]];
    default: return [[-lh * 0.75, h], [lh * 0.75, h], [lh, h + 2.5], [lh * 0.92, m - 4], [lb, b], [-lb, b], [-lh * 0.92, m - 4], [-lh, h + 2.5]];
  }
}

/** Bassin (short / pantalon) entre le torse et les jambes. */
function bassin(pi: Pinceau, f: Fiche, couleur: string) {
  const { bas: b, lb } = f.torse;
  const hx = f.hanche.x + f.larg.jambe;
  const y = f.hanche.y + 2.5;
  const lisse = f.membres !== 'pieces' && f.torse.forme !== 'bloc';
  pi.forme('bassin', [[-lb, b - 2.5], [lb, b - 2.5], [Math.max(lb, hx), y], [-Math.max(lb, hx), y]], couleur, { lisse, ombre: true });
}

/** Cou, torse (ou robe) et bassin. */
export function torse(pi: Pinceau, f: Fiche, def: DefinitionChibi) {
  const h = habits(def);
  if (f.torse.forme === 'aucun') return;
  const lc = f.tete.rx * 0.33;
  if (f.membres !== 'batons') pi.forme('cou', [[-lc, f.cou - 3], [lc, f.cou - 3], [lc * 1.1, f.torse.haut + 2], [-lc * 1.1, f.torse.haut + 2]], def.peau, { lisse: false });
  else pi.ligne('cou', [[0, f.cou - 2], [0, f.torse.haut + 1]], { epais: 1.7 });
  if (!h.robe && !f.buste) bassin(pi, f, h.jambes);
  const lisse = f.torse.forme !== 'bloc' && f.torse.forme !== 'decoupe';
  pi.forme('torse', pointsTorse(f, !!h.robe), h.torse, { ombre: true, lisse });
}

/** Un bras complet (manche, main, détail de poignet). */
export function brasComplet(pi: Pinceau, f: Fiche, def: DefinitionChibi, m: Membre, cote: 1 | -1) {
  const h = habits(def);
  const n = cote > 0 ? 'd' : 'g';
  const couleur = f.membres === 'batons' ? h.bras : h.bras;
  membre(pi, f, `bras${n}`, m, couleur, f.larg.bras);
  if (h.mancheCourte && f.membres !== 'batons') {
    const t = f.membres === 'moignons' ? 0.5 : 0.45;
    const mc: Pt = [m.a[0] + (m.b[0] - m.a[0]) * t, m.a[1] + (m.b[1] - m.a[1]) * t];
    pi.forme(`manche${n}`, ruban([m.a, mc], [f.larg.bras * 1.35, f.larg.bras * 1.3]), h.mancheCourte, { epais: 0.8 });
  }
  if (f.membres !== 'batons' && f.membres !== 'moignons') poignet(pi, def, n, m.b, m.c);
  main(pi, f, n, m, h.mains);
}

/** Une jambe complète (et son pied). Sous une robe : le pied seul. */
export function jambeComplete(pi: Pinceau, f: Fiche, def: DefinitionChibi, m: Membre, cote: 1 | -1) {
  const h = habits(def);
  const n = cote > 0 ? 'd' : 'g';
  if (!h.robe && f.membres !== 'moignons') membre(pi, f, `jambe${n}`, m, h.jambes, f.larg.jambe);
  pied(pi, f, `pied${n}`, m, cote, h.chaussures);
}
