// D. Objets et décors des situations de jeu (2/2) : trophée, cuisse de poulet, potion, coffre, pierre précieuse,
// cœur de soin, petit fantôme, panneau « AFK », monstre d'ombre, flammes, traits de vitesse et de chute.
// Formes GÉNÉRIQUES en papier découpé, dessinées par le code (CC0).

import type { Pt } from '../courbes';
import { assombrir } from '../couleurs';
import { etoile } from '../tenues';
import { coeur } from '../visage';
import { BOIS, bras, enMain, gemmeEnMain, NOIR_OBJET, OR, type Scene } from './objets-armes';

export function trophee(sc: Scene) {
  const d = bras(sc, 1);
  const g = bras(sc, -1);
  const x = (d.c[0] + g.c[0]) / 2;
  // Coupe portée haut sur un long pied : on voit les cheveux et le crâne dessous (papier : 4 unités plus haut, le
  // socle ne se pose plus sur les cheveux, le bonnet ou le crâne).
  const y = Math.min(d.c[1], g.c[1]) - 12 - (sc.def.style === 'papier' ? 4 : 0);
  const p = sc.pi;
  p.forme('coupe', [[x - 11, y - 20], [x + 11, y - 20], [x + 9, y - 9], [x + 3, y - 4], [x - 3, y - 4], [x - 9, y - 9]], OR);
  for (const s of [-1, 1]) p.ligne(`anse${s}`, [[x + s * 10, y - 17], [x + s * 15, y - 15], [x + s * 9.5, y - 10]], { epais: 0.9, encre: assombrir(OR, 0.3) });
  p.forme('pied', [[x - 2, y - 4], [x + 2, y - 4], [x + 2.5, y + 7], [x - 2.5, y + 7]], OR, { lisse: false });
  p.forme('socle', [[x - 8, y + 7], [x + 8, y + 7], [x + 8, y + 12], [x - 8, y + 12]], '#5B4636', { lisse: false });
  for (const m of [d, g]) p.ligne(`tient${m === d ? 'd' : 'g'}`, [m.c, [x + (m.c[0] < x ? -7 : 7), y + 10]], { epais: 0.5, encre: '#5B4636' });
  etoile(p, 'etoileCoupe', x, y - 13, 3.4, '#FFF6C8', 0.4);
  for (const [i, a] of [[0, -0.5], [1, 0.5]] as const) etoile(p, `brille${i}`, x + a * 34, y - 22 - sc.ph * 4, 2 + sc.ph * 2, '#FFE680', 0.4);
}

export function cuisse(sc: Scene) {
  // Papier : la cuisse plus près de la main, à hauteur de la bouche (on voit encore les yeux et les lunettes).
  const papier = sc.def.style === 'papier';
  enMain(sc, 1, (m) => {
    const q = papier ? m.repere(0, 5, 0.92, 0.92) : m;
    q.forme('os', [[-1.4, 6], [1.4, 6], [1.4, -2], [-1.4, -2]], '#F4EEDC', { lisse: false });
    q.rond(-1.6, 7, 1.8, '#F4EEDC');
    q.rond(1.6, 7, 1.8, '#F4EEDC');
    q.forme('viande', q.ovale('viande', 0, -9, 6.5, 8.5, 10, 0.06), '#B5652E');
    q.forme('croque', q.ovale('croque', 4.5, -14, 2.6, 2.6, 6), '#F4EEDC', { trait: false });
  });
}

export function potion(sc: Scene) {
  enMain(sc, 1, (q) => {
    q.forme('fiole', [[-2.5, -4], [2.5, -4], [2.5, -1], [7, 4], [7, 10], [-7, 10], [-7, 4], [-2.5, -1]], '#DDF4FF', { alpha: 0.9 });
    q.forme('liquide', [[-6.4, 5], [6.4, 5], [6.4, 9.4], [-6.4, 9.4]], '#B04BE0', { lisse: false, trait: false });
    q.forme('bouchonFiole', [[-2.8, -7], [2.8, -7], [2.6, -4], [-2.6, -4]], BOIS, { lisse: false });
  }, true, 150);
  const m = bras(sc, 1);
  [0, 1, 2].forEach((i) => {
    const t = (sc.ph + i / 3) % 1;
    sc.pi.forme(`bulle${i}`, sc.pi.ovale(`bulle${i}`, m.c[0] + 8 + i * 3, m.c[1] - 8 - t * 14, 1.6 + i * 0.4, 1.6 + i * 0.4, 6), '#E6C2FF', { epais: 0.4 });
  });
}

export function gemmeBrandie(sc: Scene) {
  gemmeEnMain(sc, 1, 8);
}

export function coffre(sc: Scene) {
  const p = sc.pi;
  const y = sc.f.torse.bas + 2;
  p.forme('lueur', p.ovale('lueur', 0, y - 18, 22, 12, 10, 0.05), '#FFF3A0', { alpha: 0.75, trait: false });
  p.forme('couvercle', [[-17, y - 22], [17, y - 22], [15, y - 32], [-15, y - 32]], BOIS);
  p.forme('caisse', [[-18, y - 12], [18, y - 12], [18, y + 2], [-18, y + 2]], BOIS, { lisse: false });
  p.forme('cercle', [[-18, y - 12], [18, y - 12], [18, y - 9], [-18, y - 9]], '#6E7683', { lisse: false });
  p.forme('serrure', [[-2.5, y - 10], [2.5, y - 10], [2.5, y - 5], [-2.5, y - 5]], OR, { lisse: false });
  p.forme('pieces', [[-12, y - 12], [-6, y - 15.5], [0, y - 13.5], [7, y - 16], [12, y - 12]], OR);
  etoile(p, 'eclatCoffre', 8, y - 26 - sc.ph * 3, 2.5 + sc.ph * 2, '#FFFFFF', 0.4);
}

export function soin(sc: Scene) {
  enMain(sc, 1, (q) => coeur(q, 'coeurSoin', 0, -7, 9 + sc.ph * 2, '#FF4D6D', 0.6), false);
  const croix = (nom: string, x: number, y: number, r: number) => {
    sc.pi.forme(`${nom}a`, [[x - r, y - r / 3], [x + r, y - r / 3], [x + r, y + r / 3], [x - r, y + r / 3]], '#4CD964', { lisse: false });
    sc.pi.forme(`${nom}b`, [[x - r / 3, y - r], [x + r / 3, y - r], [x + r / 3, y + r], [x - r / 3, y + r]], '#4CD964', { lisse: false });
  };
  croix('soin1', -26, -70 - sc.ph * 8, 3.4);
  croix('soin2', 28, -52 - ((sc.ph + 0.5) % 1) * 8, 2.6);
}

/** Petit fantôme qui s'envole (mort) : en papier blanc, yeux en croix. */
export function fantome(sc: Scene) {
  const p = sc.pi;
  const x = -30;
  const y = sc.f.tete.cy - sc.f.tete.ry + 2 - sc.ph * 4;
  const corps: Pt[] = [[x - 8, y + 9], [x - 8, y - 3], [x - 4, y - 10], [x + 4, y - 10], [x + 8, y - 3], [x + 8, y + 9], [x + 5, y + 6], [x + 2.5, y + 9], [x, y + 6], [x - 2.5, y + 9], [x - 5, y + 6]];
  p.forme('fantome', corps, '#FAFAF6');
  for (const s of [-1, 1]) {
    p.ligne(`fx${s}a`, [[x + s * 3.5 - 1.4, y - 4.4], [x + s * 3.5 + 1.4, y - 1.6]], { epais: 0.4, lisse: false });
    p.ligne(`fx${s}b`, [[x + s * 3.5 + 1.4, y - 4.4], [x + s * 3.5 - 1.4, y - 1.6]], { epais: 0.4, lisse: false });
  }
  p.forme('aureole', p.ovale('aureole', x, y - 13, 6, 1.8, 10, 0), null, { epais: 0.8, encre: OR });
}

/** Panneau « AFK » (lettres en traits). */
export function afk(sc: Scene) {
  const p = sc.pi;
  const x = -30;
  const y = sc.f.tete.cy - 6;
  p.forme('panneau', [[x - 12, y - 7], [x + 12, y - 8], [x + 12.5, y + 6], [x - 11.5, y + 7]], '#FFF7D6', { lisse: false });
  p.signe('afk', [x, y], [
    [[-9, 4], [-6.5, -4], [-4, 4]], [[-8, 1], [-5, 1]],
    [[-1.5, 4], [-1.5, -4], [2.5, -4]], [[-1.5, 0], [1.5, 0]],
    [[5, -4], [5, 4]], [[9, -4], [5, 0.5], [9, 4]],
  ], { epais: 0.7 });
}

/** Monstre générique : une ombre avec deux yeux et des dents, derrière le perso. */
export function monstre(sc: Scene) {
  const p = sc.pi;
  const x = -34;
  const y = -58;
  const ombre: Pt[] = [[x - 20, y + 40], [x - 24, y + 4], [x - 16, y - 22], [x - 4, y - 32], [x + 10, y - 26], [x + 18, y - 8], [x + 20, y + 40]];
  p.forme('monstre', ombre, '#2A2238');
  for (const s of [-1, 1]) {
    p.forme(`oeilMonstre${s}`, p.ovale(`oeilMonstre${s}`, x + s * 6, y - 12, 4.2, 2.6 + sc.ph * 0.6, 8), '#FFE14D', { trait: false });
    p.rond(x + s * 6 + 1.2, y - 12, 1.2, NOIR_OBJET);
  }
  p.forme('dents', [[x - 9, y - 2], [x + 9, y - 2], [x + 6, y + 3], [x + 3, y - 0.5], [x, y + 3], [x - 3, y - 0.5], [x - 6, y + 3]], '#FAFAF6', { lisse: false, trait: false });
}

/** Flammes en papier (en feu) : derrière le perso et sur la tête. */
export function flammes(sc: Scene, devant: boolean) {
  const p = sc.pi;
  const h = sc.ph;
  const langue = (nom: string, x: number, y: number, l: number, haut: number, c: string) => {
    const d = Math.sin((h + x * 0.05) * Math.PI * 2) * 2;
    p.forme(nom, [[x - l, y], [x - l * 0.6, y - haut * 0.5], [x + d, y - haut], [x + l * 0.6, y - haut * 0.45], [x + l, y]], c, { lisse: false });
  };
  if (!devant) {
    [-26, -12, 0, 13, 27].forEach((x, i) => langue(`feuDos${i}`, x, -8, 11, 58 + (i % 2) * 18, '#FF7A30'));
    [-18, 0, 18].forEach((x, i) => langue(`feuDosC${i}`, x, -8, 8, 40 + (i % 2) * 12, '#FFD23F'));
    return;
  }
  // Papier : la couronne de flammes 4 unités plus haut (on lit encore la casquette, le bonnet).
  const y = sc.f.tete.cy - sc.f.tete.ry + 4 - (sc.def.style === 'papier' ? 4 : 0);
  [-8, 3, 12].forEach((x, i) => langue(`feuTete${i}`, x, y, 6, 16 + (i % 2) * 8, i === 1 ? '#FFD23F' : '#FF7A30'));
  [0, 1, 2].forEach((i) => {
    const t = (h + i / 3) % 1;
    p.forme(`fumee${i}`, p.ovale(`fumee${i}`, -14 + i * 12, y - 30 - t * 14, 4 + t * 3, 3 + t * 2, 8, 0.1), '#B9B9C3', { alpha: 0.85 - t * 0.4, trait: false });
  });
}

/** Traits de vitesse (court) ou de chute (tombe dans le vide). */
export function traits(sc: Scene, sens: 'cote' | 'haut') {
  const p = sc.pi;
  for (let i = 0; i < 5; i++) {
    const d = ((sc.ph + i * 0.2) % 1) * 6;
    if (sens === 'cote') p.ligne(`vite${i}`, [[-30 - d, -60 + i * 11], [-46 - d, -60 + i * 11]], { epais: 0.7, encre: '#5A5F6E' });
    else p.ligne(`chute${i}`, [[-24 + i * 12, -104 - d], [-24 + i * 12, -122 - d]], { epais: 0.7, encre: '#5A5F6E' });
  }
  if (sens === 'cote') for (const i of [0, 1]) p.forme(`poussiere${i}`, p.ovale(`poussiere${i}`, -30 - i * 9, -6 - i * 3, 5 - i, 3.5 - i * 0.5, 8, 0.12), '#D9CDB8', { trait: false, alpha: 0.9 });
}

