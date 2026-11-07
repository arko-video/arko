// D. Visage des chibis (dev 3) : yeux (15 formes), sourcils (7) et bouches (29), très expressifs, dessinés au trait
// tremblé. Côté droit = x positif ; le gauche est son reflet (sauf les formes voulues de travers).

import type { DefinitionChibi } from '../recette/types';
import type { Expression, FormeBouche, FormeYeux, Sourcils } from './expressions';
import { VISAGE } from './geometrie';
import type { Pinceau, Pt } from './pinceau';

const NOIR = '#18181C';
const BLANC = '#FFFFFF';
const GORGE = '#5B1720';
const LANGUE = '#F06C7E';
const ROUGE_COEUR = '#E8344E';
const JAUNE = '#FFD23F';

export function yeux(pi: Pinceau, def: DefinitionChibi, ex: Expression) {
  for (const s of [-1, 1] as const) unOeil(pi, def, ex.yeux, s, s * VISAGE.yeuxX, VISAGE.yeuxY);
}

export function unOeil(pi: Pinceau, def: DefinitionChibi, f: FormeYeux, s: 1 | -1, x: number, y: number) {
  const n = s < 0 ? 'g' : 'd';
  const peau = def.peau;
  const ovale = (rx: number, ry: number) => pi.ovale(`oeil${n}`, x, y, rx, ry, 8, 0.05);
  switch (f) {
    case 'normaux': return oeilNormal(pi, def, n, x, y, 0);
    case 'cote': return oeilNormal(pi, def, n, x, y, 2.6);
    case 'heureux': return pi.ligne(`oeil${n}`, [[x - 6, y + 2], [x, y - 4.5], [x + 6, y + 2]], { epais: 0.85 });
    case 'fermes': return pi.ligne(`oeil${n}`, [[x - 6, y - 1], [x, y + 3], [x + 6, y - 1]], { epais: 0.8 });
    case 'plisses': return pi.ligne(`oeil${n}`, [[x + s * 5, y - 5], [x - s * 4.5, y], [x + s * 5, y + 5]], { epais: 0.9, lisse: false });
    case 'croix':
      pi.ligne(`croixA${n}`, [[x - 5, y - 5], [x + 5, y + 5]], { epais: 0.9, lisse: false });
      return pi.ligne(`croixB${n}`, [[x + 5, y - 5], [x - 5, y + 5]], { epais: 0.9, lisse: false });
    case 'ecarquilles':
      pi.forme(`oeil${n}`, ovale(7.8, 9.4), BLANC, { epais: 0.6 });
      return pi.rond(x, y, 1.7, NOIR);
    case 'vides':
      pi.forme(`oeil${n}`, ovale(6.6, 6.6), BLANC, { epais: 0.6 });
      return paupiere(pi, n, peau, x, y, s, 7, 4.5);
    case 'spirales': {
      const pts: Pt[] = [];
      for (let i = 0; i <= 26; i++) {
        const a = i * 0.55 * s;
        const r = 7 * (1 - i / 28);
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      }
      pi.forme(`fondSpirale${n}`, ovale(7.4, 7.4), BLANC, { epais: 0.6 });
      return pi.ligne(`spirale${n}`, pts, { epais: 0.5 });
    }
    case 'coeurs': return coeur(pi, `oeil${n}`, x, y + 1, 8, ROUGE_COEUR);
    case 'etoiles': {
      const pts: Pt[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 8.5 : 3.8;
        pts.push([x + Math.cos(a) * r, y + 0.5 + Math.sin(a) * r]);
      }
      return pi.forme(`oeil${n}`, pts, JAUNE, { lisse: false, epais: 0.6 });
    }
    case 'larmes':
      pi.forme(`flaque${n}`, pi.ovale(`flaque${n}`, x, y + 3.5, 7, 3, 8), '#7FD3F7', { epais: 0.4, alpha: 0.9 });
      return pi.ligne(`oeil${n}`, [[x - 6.5, y + 1], [x - 2, y - 3], [x + 2, y - 3], [x + 6.5, y + 1]], { epais: 1 });
    case 'miClos':
      oeilNormal(pi, def, n, x, y + 1, 0.8);
      return paupiere(pi, n, peau, x, y + 1, 0, 8, 0.6);
    case 'determines':
      oeilNormal(pi, def, n, x, y, 0);
      return paupiere(pi, n, peau, x, y, s, 6, 3.5);
    case 'tristes':
      oeilNormal(pi, def, n, x, y + 1, 0);
      pi.rond(x + 2.2, y + 3.2, 1.3, BLANC);
      return paupiere(pi, n, peau, x, y + 1, -s, 6, 3.5);
  }
}

/** Œil selon la forme choisie pour le chibi (ronds, points, fatigués, grands) ; `regard` décale la pupille. */
function oeilNormal(pi: Pinceau, def: DefinitionChibi, n: string, x: number, y: number, regard: number) {
  const forme = def.yeux ?? 'ronds';
  if (forme === 'points') {
    pi.forme(`oeil${n}`, pi.ovale(`oeil${n}`, x + regard * 0.6, y, 2.9, 3.9, 6, 0.06), NOIR, { trait: false });
    return pi.rond(x + regard * 0.6 + 0.9, y - 1.4, 0.9, BLANC);
  }
  const grand = forme === 'grands';
  const rx = grand ? 7.6 : 6.2;
  const ry = grand ? 9 : 7.4;
  pi.forme(`oeil${n}`, pi.ovale(`oeil${n}`, x, y, rx, ry, 8, 0.05), BLANC, { epais: 0.6 });
  const rp = grand ? 5.2 : 3.7;
  pi.rond(x + 0.7 + regard, y + 0.9, rp, NOIR);
  pi.rond(x + regard - rp * 0.25, y - rp * 0.35, grand ? 1.8 : 1.25, BLANC);
  if (grand) pi.rond(x + regard + 2, y + 2.4, 0.9, BLANC);
  if (forme === 'fatigues') paupiere(pi, n, def.peau, x, y, 0, rx + 0.6, 0.2);
}

/**
 * Paupière : la peau recouvre le haut de l'œil jusqu'à une ligne penchée (`pente` = 1 : coin intérieur plus bas,
 * colère ; −1 : coin intérieur plus haut, tristesse ; 0 : à plat). `bas` = hauteur de la ligne sous le centre.
 */
function paupiere(pi: Pinceau, n: string, peau: string, x: number, y: number, pente: number, l: number, h: number) {
  const interieur = x > 0 ? -1 : 1;
  const yi = y - h + pente * 2.6 + 2.5;
  const ye = y - h - pente * 2.6 + 2.5;
  const xi = x + interieur * l;
  const xe = x - interieur * l;
  pi.forme(`paupiere${n}`, [[xi, yi], [xe, ye], [xe, y - 11], [xi, y - 11]], peau, { trait: false, lisse: false });
  pi.ligne(`bordPaupiere${n}`, [[xi, yi], [xe, ye]], { epais: 0.8, lisse: false });
}

export function sourcils(pi: Pinceau, f: Sourcils) {
  if (f === 'aucun') return;
  const y = VISAGE.sourcilsY;
  for (const s of [-1, 1] as const) {
    const xi = s * 6.5;
    const xe = s * 18;
    const n = s < 0 ? 'g' : 'd';
    let pts: Pt[];
    switch (f) {
      case 'neutres': pts = [[xi, y], [s * 12, y - 1.8], [xe, y]]; break;
      case 'hauts': pts = [[xi, y - 4], [s * 12, y - 7.5], [xe, y - 4.5]]; break;
      case 'fronces': pts = [[xi, y + 3], [s * 12, y - 0.5], [xe, y - 4]]; break;
      case 'tristes': pts = [[xi, y - 4], [s * 12, y - 1.5], [xe, y + 1.5]]; break;
      case 'unHaut': pts = s > 0 ? [[xi, y - 4.5], [s * 12, y - 8], [xe, y - 5]] : [[xi, y + 1], [xe, y + 1]]; break;
      case 'inquiets': pts = [[xi, y - 3], [s * 10, y - 1], [s * 14, y - 2.5], [xe, y]]; break;
    }
    pi.ligne(`sourcil${n}`, pts, { epais: 1 });
  }
}

/** Intérieur de bouche : gorge sombre + langue en bas. */
function ouverte(pi: Pinceau, nom: string, pts: Pt[], langue = true, dentsHaut = false) {
  pi.forme(nom, pts, GORGE, { epais: 0.8 });
  const ys = pts.map((p) => p[1]);
  const xs = pts.map((p) => p[0]);
  const y1 = Math.max(...ys);
  const y0 = Math.min(...ys);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const l = Math.max(...xs) - Math.min(...xs);
  if (langue && y1 - y0 > 3.5) pi.forme(`${nom}Langue`, pi.ovale(`${nom}L`, cx, y1 - (y1 - y0) * 0.22, l * 0.3, (y1 - y0) * 0.22, 6), LANGUE, { trait: false });
  if (dentsHaut) pi.forme(`${nom}Dents`, [[cx - l * 0.36, y0 + 0.6], [cx + l * 0.36, y0 + 0.6], [cx + l * 0.3, y0 + 2.6], [cx - l * 0.3, y0 + 2.6]], BLANC, { trait: false, lisse: false });
}

/** Rectangle de dents serrées. */
function dents(pi: Pinceau, nom: string, l: number, h: number, y: number) {
  pi.forme(nom, [[-l, y - h], [l, y - h], [l * 0.9, y + h], [-l * 0.9, y + h]], BLANC, { epais: 0.8, lisse: false });
  pi.ligne(`${nom}Milieu`, [[-l + 1, y], [l - 1, y]], { epais: 0.45, lisse: false });
  for (const x of [-l / 2, 0, l / 2]) pi.ligne(`${nom}D${x}`, [[x, y - h + 0.5], [x + 0.3, y + h - 0.5]], { epais: 0.35, lisse: false });
}

export function bouche(pi: Pinceau, f: FormeBouche) {
  const y = VISAGE.boucheY;
  const ligne = (pts: Pt[], e = 0.85) => pi.ligne('bouche', pts, { epais: e });
  switch (f) {
    case 'sourire': return ligne([[-5.5, y - 1.5], [0, y + 2], [5.5, y - 1.5]]);
    case 'parle': return ouverte(pi, 'bouche', pi.ovale('bParle', 0, y + 1, 5.2, 4.3, 8));
    case 'grandSourire': return ligne([[-9, y - 3], [-4, y + 2], [4, y + 2], [9, y - 3]]);
    case 'rire': return ouverte(pi, 'bouche', [[-8.5, y - 3], [8.5, y - 3], [6, y + 4], [0, y + 6.5], [-6, y + 4]], true, true);
    case 'sourireDents':
      pi.forme('bouche', [[-10, y - 3], [10, y - 3], [6, y + 4], [0, y + 5.5], [-6, y + 4]], BLANC, { epais: 0.85 });
      return pi.ligne('boucheMilieu', [[-8, y - 0.5], [0, y + 1.2], [8, y - 0.5]], { epais: 0.4 });
    case 'fouRire': return ouverte(pi, 'bouche', [[-11, y - 4], [11, y - 4], [8, y + 6], [0, y + 9.5], [-8, y + 6]], true, true);
    case 'grimace': return dents(pi, 'bouche', 6.5, 2.4, y + 0.5);
    case 'cri': return ouverte(pi, 'bouche', pi.ovale('bCri', 0, y + 2, 5.6, 7.2, 9), true);
    case 'dents': return dents(pi, 'bouche', 9, 3.2, y + 0.5);
    case 'hurlement':
      return ouverte(pi, 'bouche', [[-10, y - 5], [10, y - 5], [9, y + 6], [5, y + 10], [-5, y + 10], [-9, y + 6]], true, true);
    case 'colere': return ligne([[-6.5, y + 2.5], [0, y - 1.5], [6.5, y + 2.5]], 1);
    case 'grogne': return ouverte(pi, 'bouche', [[-7, y + 3], [-3, y - 2.5], [3, y - 2.5], [7, y + 3], [0, y + 4.5]], false, true);
    case 'vague': return ligne([[-6, y], [-3, y - 1.8], [0, y + 0.8], [3, y - 1.8], [6, y]], 0.8);
    case 'o': return ouverte(pi, 'bouche', pi.ovale('bO', 0, y + 2, 4, 6.5, 8), false);
    case 'petitO': return ouverte(pi, 'bouche', pi.ovale('bPetitO', 0, y + 1, 2.3, 2.6, 6), false);
    case 'sourireCoin': return ligne([[-4, y + 1], [2, y + 0.5], [6.5, y - 3]]);
    case 'parleCoin': return ouverte(pi, 'bouche', [[-4, y], [6.5, y - 3.5], [5, y + 2.5], [0, y + 3.5]], true);
    case 'langue':
      pi.forme('boucheLangue', pi.ovale('bLangue', 2.5, y + 2.6, 3, 3.6, 6), LANGUE, { epais: 0.7 });
      return ligne([[-6, y - 0.5], [0, y + 0.8], [6, y - 1.5]]);
    case 'triste': return ligne([[-5.5, y + 2.5], [0, y - 1], [5.5, y + 2.5]]);
    case 'gemit': return ouverte(pi, 'bouche', [[-5.5, y + 3.5], [0, y - 1.5], [5.5, y + 3.5], [0, y + 4.5]], false);
    case 'tremble': return ligne([[-7, y + 3], [-4, y], [-1, y + 1.5], [2, y - 0.5], [5, y + 1.5], [7, y + 3]], 0.9);
    case 'pleurs': return ouverte(pi, 'bouche', [[-9, y + 5], [-6, y - 3], [6, y - 3], [9, y + 5], [0, y + 6]], true);
    case 'cote': return ligne([[1, y + 0.5], [5, y - 0.5], [8, y + 0.5]], 0.85);
    case 'coteOuverte': return ouverte(pi, 'bouche', pi.ovale('bCote', 5, y + 0.5, 2.4, 2.8, 6), false);
    case 'moue': return ligne([[-2.5, y + 0.5], [2.5, y + 0.5]], 0.8);
    case 'chat': return ligne([[-6, y - 1.5], [-3, y + 1.5], [0, y - 0.5], [3, y + 1.5], [6, y - 1.5]]);
    case 'nausee': return ouverte(pi, 'bouche', [[-6, y], [-3, y - 2.5], [0, y - 1], [3, y - 2.5], [6, y], [0, y + 4]], false);
    case 'plate': return ligne([[-6, y + 0.5], [6, y - 0.3]], 1);
    case 'soupir': return ouverte(pi, 'bouche', pi.ovale('bSoupir', -1, y + 1.5, 3.2, 2.2, 6), false);
  }
}

/** Cœur plein (yeux amoureux, cœurs qui montent). */
export function coeur(pi: Pinceau, nom: string, x: number, y: number, t: number, couleur: string, epais = 0.6) {
  const k = t / 8;
  const pts: Pt[] = [[0, 6], [-6, 0], [-7, -4], [-4, -6.5], [0, -3.8], [4, -6.5], [7, -4], [6, 0]];
  pi.forme(nom, pts.map(([a, b]) => [x + a * k, y + b * k] as Pt), couleur, { epais });
}
