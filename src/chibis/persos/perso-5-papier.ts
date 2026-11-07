// D. Le perso 5 en papier découpé (chauve, barbe, costume) : crâne rasé qui brille, barbe à touffes avec un trou
// autour de la bouche et une moustache en guidon, costume à revers avec pochette et cravate un peu de travers.
// Seulement pour le style « papier » : les chibis d'origine gardent leurs dessins (coiffures, chapeaux, tenues).

import type { DefinitionChibi } from '../../recette/types';
import { assombrir, melanger } from '../couleurs';
import { TETE } from '../geometrie';
import type { Pinceau, Pt } from '../pinceau';

/** Ellipse tournée de `deg` degrés (pour les reflets). */
function ellipse(cx: number, cy: number, rx: number, ry: number, deg: number, n = 10): Pt[] {
  const r = (deg * Math.PI) / 180;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
  }
  return pts;
}

/** Crâne rasé (repère de la tête des chibis) : une ombre de repousse sans bord, des points de poils, un reflet. */
export function cranePapier(pi: Pinceau, def: DefinitionChibi) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = ((196 + (148 * i) / 12) * Math.PI) / 180;
    pts.push([TETE.cx + Math.cos(a) * (TETE.rx + 0.6), TETE.cy + Math.sin(a) * (TETE.ry + 0.6)]);
  }
  pts.push([30, -77], [16, -82], [0, -83.5], [-16, -82], [-30, -77]);
  pi.forme('cheveux', pts, def.cheveux, { alpha: 0.3, trait: false });
  const point = assombrir(def.cheveux, 0.2);
  for (let i = 0; i < 9; i++) pi.rond(-20 + i * 5, -87.5 + (i % 2) * 2.2 + Math.abs(i - 4) * 0.6, 0.55, point);
  pi.forme('reflet', ellipse(-12, -88.5, 7, 2.4, -24), '#FFF6E4', { alpha: 0.5, trait: false });
  pi.forme('refletPoint', ellipse(-2.5, -92, 1.8, 1.4, 0, 6), '#FFF6E4', { alpha: 0.5, trait: false });
}

/**
 * Barbe (repère du visage, agrandi de 1,12) : favoris et mâchoire à la largeur de la tête, touffes au menton, un trou
 * de peau autour de la bouche (cris, rires et langue lisibles sur la barbe sombre) et une moustache en guidon sur la
 * lèvre du haut. La bouche se dessine après, par-dessus.
 */
export function barbePapier(pi: Pinceau, def: DefinitionChibi, bouche: 'normale' | 'grande' = 'normale') {
  const c = def.cheveux;
  const pts: Pt[] = [];
  for (let i = 0; i <= 16; i++) {
    const deg = -14 + (208 * i) / 16;
    const a = (deg * Math.PI) / 180;
    const touffe = deg > 50 && deg < 130 ? (i % 2 === 0 ? 1.07 : 0.99) : 1;
    pts.push([Math.cos(a) * 31, -63 + Math.sin(a) * 26 * touffe]);
  }
  pts.push([-25, -68], [-23, -60], [-15, -55.5], [0, -55], [15, -55.5], [23, -60], [25, -68]);
  pi.forme('barbe', pts, c, { ombre: true, epais: 0.8 });
  // Trou de peau autour de la bouche : plus grand pour une grande bouche ouverte (cris, rires, « hurle »).
  const g = bouche === 'grande';
  pi.forme('levres', pi.ovale('levres', 0, g ? -49 : -50.5, g ? 15.5 : 12.5, g ? 10.5 : 7, 10, 0.05), def.peau, { epais: 0.45 });
  // Moustache en guidon (sous les yeux), d'un brun un peu plus chaud que la barbe pour se détacher d'elle.
  const m: Pt[] = [[0, -55.6], [6, -57.2], [12.5, -56.4], [17, -54.2], [20.5, -57], [21.5, -55.6], [19.5, -52], [14.5, -50.6], [7, -51.8], [0, -53]];
  pi.forme('moustache', [...m, ...m.slice(1, -1).reverse().map(([x, y]) => [-x, y] as Pt)], melanger(c, '#6A4128', 0.35), { epais: 0.8, ombre: true });
}

/** Costume (repère du torse des chibis) : chemise, revers, cravate un peu de travers, pochette, boutons dorés. */
export function costumePapier(pi: Pinceau, def: DefinitionChibi) {
  const c = def.couleur;
  pi.forme('chemise', [[-6.2, -38.6], [6.2, -38.6], [0, -21.6]], '#FFFFFF', { lisse: false, epais: 0.6 });
  for (const s of [-1, 1]) {
    const revers: Pt[] = [[-6.3, -38.8], [-11.5, -38.4], [-9.6, -33], [-12, -31.4], [-0.7, -21.4], [-3, -30]];
    pi.forme(`revers${s}`, revers.map(([x, y]) => [x * -s, y] as Pt), assombrir('#2D3142', 0.35), { lisse: false, epais: 0.6 });
  }
  pi.forme('cravate', [[-1.5, -35.2], [1.5, -35.2], [3.8, -22.6], [1.4, -19.2], [-1.4, -22]], c, { lisse: false, epais: 0.5 });
  pi.ligne('cravateRaie', [[-0.8, -30], [2.2, -28.4]], { epais: 0.35, encre: assombrir(c, 0.3) });
  pi.forme('noeud', [[-2.4, -38.4], [2.4, -38.4], [1.6, -35], [-1.6, -35]], assombrir(c, 0.12), { lisse: false, epais: 0.5 });
  pi.forme('pochette', [[7.6, -29.8], [8.4, -33], [9.8, -30.9], [11.3, -33.6], [12.5, -30.7], [13.4, -32.2], [13.6, -29.9]], c, { lisse: false, epais: 0.45 });
  pi.ligne('poche', [[7.2, -29.6], [13.9, -30.1]], { epais: 0.4, encre: '#9AA0B5' });
  for (const y of [-17.5, -13.5]) pi.rond(0.6, y, 0.9, '#C9A24A');
}
