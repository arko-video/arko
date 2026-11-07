// D. Objets des situations de jeu (1/2) : épée, arc, bouclier, pioche, marteau, bombe, manette, micro, canne à
// pêche. Formes GÉNÉRIQUES en papier découpé, dessinées par le code (CC0) : aucun objet d'un jeu connu.
// Repère « en main » : la main en (0, 0), le haut de l'objet vers −y (dans l'axe de l'avant-bras).

import type { DefinitionChibi } from '../../recette/types';
import { assombrir, eclaircir } from '../couleurs';
import type { Pt } from '../courbes';
import type { Pinceau } from '../pinceau';
import { etoile } from '../tenues';
import type { Fiche } from './fiches';
import type { Membre, Squelette } from './squelette';

export const ACIER = '#D5DCE4';
export const BOIS = '#9A6A3A';
export const OR = '#F2C230';
export const NOIR_OBJET = '#2B2D3A';

/** Ce qu'un objet sait de la scène : pinceau du corps, squelette, fiche, perso, phase d'animation. */
export interface Scene {
  pi: Pinceau;
  sq: Squelette;
  f: Fiche;
  def: DefinitionChibi;
  ph: number;
}

/** Bras droit (1) ou gauche (−1). */
export const bras = (sc: Scene, cote: 1 | -1): Membre => sc.sq.bras[cote > 0 ? 0 : 1];

/** Dessine dans le repère de la main : (0, 0) = la main ; −y = dans l'axe de l'avant-bras (si `suit`). */
export function enMain(sc: Scene, cote: 1 | -1, dessin: (q: Pinceau) => void, suit = true, angle = 0) {
  const m = bras(sc, cote);
  const q = sc.pi.repere(m.c[0], m.c[1], 1, 1);
  const ux = m.c[0] - m.b[0];
  const uy = m.c[1] - m.b[1];
  const deg = suit ? (Math.atan2(ux, -uy) * 180) / Math.PI : 0;
  q.tourner(deg + angle * cote, 0, 0, () => dessin(q));
}

/** Manche (bande de bois) de y0 à y1. */
function manche(q: Pinceau, nom: string, y0: number, y1: number, l = 1.6) {
  q.forme(nom, [[-l, y0], [l, y0], [l * 0.9, y1], [-l * 0.9, y1]], BOIS, { lisse: false });
}

export function epee(sc: Scene) {
  enMain(sc, 1, (q) => {
    manche(q, 'poignee', 7, -4, 1.7);
    q.rond(0, 8, 2.4, OR);
    q.forme('lame', [[-2.6, -5], [2.6, -5], [2.4, -36], [0, -43], [-2.4, -36]], ACIER, { lisse: false });
    q.ligne('fil', [[0, -7], [0, -37]], { epais: 0.35, encre: '#9AA6B4' });
    q.forme('garde', [[-8, -6.5], [8, -6.5], [8.5, -3.2], [-8.5, -3.2]], OR, { lisse: false });
  });
}

export function pioche(sc: Scene) {
  enMain(sc, 1, (q) => {
    manche(q, 'manche', 9, -30, 1.7);
    q.forme('fer', [[-17, -24], [-7, -32.5], [0, -34], [7, -32.5], [17, -24], [15, -22.5], [0, -28.5], [-15, -22.5]], '#8E98A6', { lisse: false });
  });
  gemmeEnMain(sc, -1, 5);
}

export function marteau(sc: Scene) {
  enMain(sc, 1, (q) => {
    manche(q, 'manche', 9, -24, 1.7);
    q.forme('tete', [[-10, -32], [10, -32], [10, -23], [-10, -23]], '#6E7683', { lisse: false });
    q.forme('face', [[7, -32.5], [11, -32.5], [11, -22.5], [7, -22.5]], '#A5ADB8', { lisse: false });
  });
}

/** Petite pierre précieuse (facettes). */
export function gemmeEnMain(sc: Scene, cote: 1 | -1, r = 6.5) {
  enMain(sc, cote, (q) => {
    q.forme('gemme', [[-r, -r * 0.9], [-r * 0.5, -r * 1.6], [r * 0.5, -r * 1.6], [r, -r * 0.9], [0, r * 0.3]], '#38D1C9', { lisse: false });
    q.forme('facette', [[-r * 0.5, -r * 1.6], [r * 0.5, -r * 1.6], [r * 0.25, -r * 0.9], [-r * 0.25, -r * 0.9]], eclaircir('#38D1C9', 0.5), { lisse: false, trait: false });
    etoile(q, 'eclatGemme', r * 1.3, -r * 2 - sc.ph * 2, 1.6 + sc.ph * 1.6, '#FFFFFF', 0.4);
  }, false);
}

export function bombe(sc: Scene) {
  enMain(sc, 1, (q) => {
    q.forme('bombe', q.ovale('bombe', 0, -8, 9.5, 9.5, 12, 0.01), NOIR_OBJET);
    q.forme('bouchon', [[-3, -18.5], [3, -18.5], [3, -16], [-3, -16]], '#6E7683', { lisse: false });
    q.forme('reflet', q.ovale('refletBombe', -3.5, -11.5, 2.4, 1.6, 6), '#7A8094', { trait: false });
    q.ligne('meche', [[0, -18.5], [2.5, -23], [6.5, -24.5]], { epais: 0.8, encre: '#C8A26A' });
    const k = 1 + sc.ph * 0.8;
    etoile(q, 'etincelle', 7, -25.5, 3.4 * k, '#FFB020', 0.4);
    etoile(q, 'etincelle2', 7, -25.5, 1.6 * k, '#FFF3A0', 0.3);
  }, false);
}

export function manette(sc: Scene) {
  enMain(sc, 1, (q) => {
    const corps: Pt[] = [[-12, -4], [-6, -8], [6, -8], [12, -4], [13, 4], [9, 6], [5, 2], [-5, 2], [-9, 6], [-13, 4]];
    q.forme('manette', corps, NOIR_OBJET);
    q.forme('croix1', [[-9.5, -2.8], [-4.5, -2.8], [-4.5, -1.6], [-9.5, -1.6]], '#C9CDD6', { trait: false, lisse: false });
    q.forme('croix2', [[-7.6, -5], [-6.4, -5], [-6.4, 0.6], [-7.6, 0.6]], '#C9CDD6', { trait: false, lisse: false });
    q.rond(6, -4, 1.4, '#E74C3C');
    q.rond(9, -1.6, 1.4, '#2ECC71');
  }, false, -25);
  // Traits de vitesse : la manette part en l'air.
  const m = bras(sc, 1);
  for (const i of [0, 1, 2]) sc.pi.ligne(`vitesseManette${i}`, [[m.c[0] - 10 - i * 2, m.c[1] + 6 + i * 5], [m.c[0] - 20 - i * 2, m.c[1] + 12 + i * 5]], { epais: 0.6 });
}

export function micro(sc: Scene) {
  enMain(sc, 1, (q) => {
    q.forme('microManche', [[-2, 6], [2, 6], [2.6, -4], [-2.6, -4]], NOIR_OBJET, { lisse: false });
    q.forme('grille', q.ovale('grille', 0, -8, 5.2, 5.6, 10, 0.01), '#9AA3AF');
    for (const y of [-11, -8, -5]) q.ligne(`maille${y}`, [[-4, y], [4, y]], { epais: 0.3, encre: '#5F6773' });
  });
}

export function arc(sc: Scene) {
  const g = bras(sc, -1);
  const d = bras(sc, 1);
  const s = g.c[0] < 0 ? -1 : 1;
  const haut: Pt = [g.c[0] - s * 2, g.c[1] - 22];
  const bas: Pt = [g.c[0] - s * 2, g.c[1] + 22];
  sc.pi.ligne('corde', [haut, d.c, bas], { epais: 0.35, encre: '#F4EEDC', lisse: false });
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([g.c[0] + s * Math.sin(t * Math.PI) * 7 - s * 2, g.c[1] - 22 + t * 44]);
  }
  sc.pi.forme('arc', [...pts, ...pts.slice().reverse().map(([x, y]) => [x - s * 2.2, y] as Pt)], BOIS, { lisse: true });
  // Flèche : de la main qui tire vers l'arc, pointe au-delà.
  const dx = g.c[0] - d.c[0];
  const dy = g.c[1] - d.c[1];
  const l = Math.hypot(dx, dy) || 1;
  const bout: Pt = [g.c[0] + (dx / l) * 9, g.c[1] + (dy / l) * 9];
  sc.pi.ligne('fleche', [d.c, bout], { epais: 0.7, encre: '#6B4A2A', lisse: false });
  sc.pi.forme('pointe', [[bout[0] + (dx / l) * 5, bout[1] + (dy / l) * 5], [bout[0] - (dy / l) * 2.6, bout[1] + (dx / l) * 2.6], [bout[0] + (dy / l) * 2.6, bout[1] - (dx / l) * 2.6]], ACIER, { lisse: false });
}

export function bouclier(sc: Scene) {
  const g = bras(sc, -1);
  const c = sc.def.couleur;
  sc.pi.forme('bouclier', sc.pi.ovale('bouclier', g.c[0], g.c[1] - 3, 15, 16.5, 12, 0.02), '#A5ADB8');
  sc.pi.forme('bouclierFond', sc.pi.ovale('bouclierFond', g.c[0], g.c[1] - 3, 12, 13.5, 12, 0.02), c);
  sc.pi.forme('bande', [[g.c[0] - 2, g.c[1] - 16], [g.c[0] + 2, g.c[1] - 16], [g.c[0] + 2, g.c[1] + 10], [g.c[0] - 2, g.c[1] + 10]], assombrir(c, 0.3), { lisse: false, trait: false });
  sc.pi.rond(g.c[0], g.c[1] - 3, 3.2, OR);
}

export function canne(sc: Scene, f: Fiche) {
  const m = bras(sc, 1);
  const bout: Pt = [m.c[0] + 26, m.c[1] - 46];
  sc.pi.forme('canne', [[m.c[0] - 1.4, m.c[1] + 6], [m.c[0] + 1.4, m.c[1] + 6], [bout[0] + 0.5, bout[1]], [bout[0] - 0.5, bout[1]]], BOIS, { lisse: false });
  const flotteur: Pt = [bout[0] + 6, f.torse.bas + 2 + Math.sin(sc.ph * Math.PI * 2) * 2];
  sc.pi.ligne('fil', [bout, [bout[0] + 7, bout[1] + 20], flotteur], { epais: 0.3, encre: '#F4F4F4' });
  sc.pi.forme('flotteur', sc.pi.ovale('flotteur', flotteur[0], flotteur[1], 3, 3.4, 8), '#E74C3C');
  sc.pi.forme('flotteurBas', [[flotteur[0] - 3, flotteur[1]], [flotteur[0] + 3, flotteur[1]], [flotteur[0] + 2, flotteur[1] + 3], [flotteur[0] - 2, flotteur[1] + 3]], '#FFFFFF', { trait: false });
}
