// D. Éléments du perso 1 en « Papier découpé » (7/11/2026) : cheveux hérissés, casque audio, détails du sweat.
// Appelés seulement quand le pinceau est en style papier : les anciens styles (feutre, crayon, paint) dessinent
// toujours leur version d'origine (coiffures.ts, chapeaux.ts, tenues.ts), au trait près.
// Ce fichier n'importe ni coiffures.ts, ni chapeaux.ts, ni tenues.ts (pas d'import en boucle).

import type { DefinitionChibi, Emotion } from '../../recette/types';
import { assombrir, eclaircir, melanger } from '../couleurs';
import { TETE } from '../geometrie';
import type { Pinceau, Pt } from '../pinceau';

const NOIR = '#1D1D22';

/**
 * Hérissés : 7 pointes inégales qui s'écartent vers l'extérieur (la plus haute au milieu), un épi rebelle, un reflet
 * bleuté en croissant et des éclats clairs sur les pointes : des cheveux noirs restent lisibles sur un fond de jeu
 * sombre, même à la taille d'un avatar.
 */
export function herissesPapier(pi: Pinceau, c: string) {
  const h = pi.hasard('herissesPapier');
  const n = 7;
  const pts: Pt[] = [];
  const pointes: Pt[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const pointe = i % 2 === 1;
    const milieu = 1 - Math.abs(i - n) / n;
    const a0 = 190 + (160 * i) / (n * 2);
    const a = ((a0 + (pointe ? Math.cos((a0 * Math.PI) / 180) * 7 : 0)) * Math.PI) / 180;
    const r = pointe ? 1.3 + 0.11 * milieu + (h() - 0.5) * 0.08 : 1.0;
    const p: Pt = [Math.cos(a) * TETE.rx * r, TETE.cy + Math.sin(a) * TETE.ry * r * 1.05];
    pts.push(p);
    if (pointe) pointes.push(p);
  }
  const frange: Pt[] = [[32, -71], [24, -80], [15, -75], [7, -84], [-2, -77], [-11, -85], [-19, -78], [-27, -80], [-32, -71]];
  // Pièce de papier claire collée sous les cheveux (même frange) : un liseré qui détache les pointes d'un fond sombre.
  const fond = pts.map(([x, y]): Pt => [x * 1.06, TETE.cy + (y - TETE.cy) * 1.06 - 0.6]);
  pi.forme('cheveuxFond', [...fond, ...frange], melanger(c, '#A9B8CF', 0.5), { lisse: false, trait: false });
  // Épi rebelle (derrière les cheveux : il dépasse à côté de la pointe du milieu).
  pi.forme('epi', [[3, -94], [14.5, -110.5], [9, -95]], c, { lisse: false });
  pi.forme('cheveux', [...pts, ...frange], c, { lisse: false, ombre: true });
  const lune: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = ((210 + i * 8.5) * Math.PI) / 180;
    lune.push([Math.cos(a) * TETE.rx * 0.94, TETE.cy + Math.sin(a) * TETE.ry * 0.97]);
  }
  for (let i = 6; i >= 0; i--) {
    const a = ((212 + i * 7.8) * Math.PI) / 180;
    const e = 0.88 - Math.sin((i / 6) * Math.PI) * 0.1;
    lune.push([Math.cos(a) * TETE.rx * e, TETE.cy + Math.sin(a) * TETE.ry * e]);
  }
  pi.forme('refletCheveux', lune, melanger(c, '#8FB4E8', 0.55), { trait: false });
  // Éclats clairs sur le flanc des pointes (pièces de papier plus claires collées dessus).
  pointes.forEach(([x, y], k) => {
    if (k === 0 || k === n - 1) return;
    const bx = x * 0.8;
    const by = TETE.cy + (y - TETE.cy) * 0.8;
    pi.forme(`eclat${k}`, [[bx - 2.2, by + 1], [x * 0.97, y + 1.2], [bx + 1.2, by + 0.6]], eclaircir(c, 0.3), { trait: false, lisse: false });
  });
}

/**
 * Sweat (repère du torse des chibis : x ± 15, y −39 à −11) : grande poche kangourou, bas côtelé plus foncé, cordons
 * clairs avec leurs embouts (un peu dépareillés : goofy), lisibles en petit.
 */
export function sweatPapier(pi: Pinceau, c: string) {
  const cote = assombrir(c, 0.2);
  pi.forme('bordCote', [[-13.6, -13.8], [13.6, -13.8], [13.4, -11], [-13.4, -11]], cote, { lisse: false, epais: 0.6 });
  for (let x = -11; x <= 11; x += 2.75) pi.ligne(`cote${x}`, [[x, -13.3], [x, -11.5]], { epais: 0.3, encre: assombrir(c, 0.38) });
  pi.forme('poche', [[-8.5, -23.5], [8.5, -23.5], [12, -15], [-12, -15]], assombrir(c, 0.12), { epais: 0.6, ombre: true });
  pi.ligne('couturePoche', [[-7.5, -22.6], [7.5, -22.6]], { epais: 0.3, encre: eclaircir(c, 0.35) });
  const blanc = '#F7F1E6';
  pi.ligne('cordon1', [[-3, -38], [-3.4, -33], [-3.9, -29.5]], { epais: 0.8, encre: blanc });
  pi.ligne('cordon2', [[3, -38], [3.5, -34], [3.9, -32]], { epais: 0.8, encre: blanc });
  pi.rond(-3.9, -29.2, 1.05, blanc);
  pi.rond(3.9, -31.7, 1.05, blanc);
}

/** Bord-côte au bout d'une manche du sweat (`a` = coude, `b` = main), juste avant la main (qui couvre le bout). */
export function poignetSweat(pi: Pinceau, c: string, nom: string, a: Pt, b: Pt) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / l, dx / l];
  const w = 4.5;
  const p = (t: number, s: number): Pt => [a[0] + dx * t + nx * w * s, a[1] + dy * t + ny * w * s];
  pi.forme(`poignet${nom}`, [p(0.5, 1), p(0.74, 1), p(0.74, -1), p(0.5, -1)], assombrir(c, 0.2), { lisse: false, epais: 0.6 });
}

/** Points du bord de la tête agrandi de `plus`, de a0 à a1 (degrés), le haut monté de `monte` (< 0). */
function arcCrane(a0: number, a1: number, plus: number, monte: number, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    const s = Math.sin(a);
    pts.push([Math.cos(a) * (TETE.rx + plus), TETE.cy + s * (TETE.ry + plus) + Math.min(0, monte) * (s < 0 ? -s : 0)]);
  }
  return pts;
}

/** Émotions où le casque saute au-dessus de la tête (gag de dessin animé). */
export const CASQUE_SAUTE: ReadonlySet<Emotion> = new Set(['surpris', 'choque']);

/**
 * Casque audio : arceau en bande de papier épaisse (lisible sur des cheveux noirs), grosses coques avec coussinet
 * sombre et pastille claire, micro plus épais avec un reflet. Surpris ou choqué : le casque saute au-dessus de la
 * tête, avec deux petits traits de saut de chaque côté. `monte` : l'afro soulève l'arceau.
 */
export function casquePapier(pi: Pinceau, def: DefinitionChibi, emo: Emotion, monte: number) {
  const c = def.couleur;
  const dy = CASQUE_SAUTE.has(emo) ? -9 : 0;
  const bouge = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x, y + dy]);
  const ext = bouge(arcCrane(198, 342, 4, monte, 10));
  const int = bouge(arcCrane(198, 342, 1.3, monte, 10)).reverse();
  pi.forme('arceau', [...ext, ...int], assombrir(c, 0.12), { ombre: true });
  pi.ligne('arceauRaie', bouge(arcCrane(206, 334, 2.7, monte, 8)), { epais: 0.5, encre: eclaircir(c, 0.5) });
  for (const s of [-1, 1]) {
    pi.forme(`coussinet${s}`, pi.ovale(`coussinet${s}`, s * 31.5, -66 + dy, 3.4, 8.4, 8), '#2B2B30', { epais: 0.6 });
    pi.forme(`oreillette${s}`, pi.ovale(`oreillette${s}`, s * 35.5, -66 + dy, 6.6, 10.2, 9, 0.04), c, { ombre: true });
    pi.rond(s * 36.5, -66 + dy, 2.4, eclaircir(c, 0.55));
  }
  // Micro : devant la bouche ; quand le casque saute, il pend dans le vide à côté de la joue.
  const bout: Pt = dy ? [-39, -45] : [-17.5, -46 + dy];
  pi.ligne('micro', dy ? [[-37, -58 + dy], [-40.5, -52], [-39.5, -47]] : bouge([[-37, -58], [-31, -48], [-19, -46]]), { epais: 1.05 });
  pi.rond(bout[0], bout[1], 3, NOIR);
  pi.rond(bout[0] - 0.9, bout[1] - 1, 0.9, '#FFFFFF');
  if (dy) {
    for (const s of [-1, 1]) {
      pi.ligne(`saut${s}a`, [[s * 44, -64], [s * 45.5, -56]], { epais: 0.6 });
      pi.ligne(`saut${s}b`, [[s * 48.5, -70], [s * 50.5, -61]], { epais: 0.6 });
    }
  }
}
