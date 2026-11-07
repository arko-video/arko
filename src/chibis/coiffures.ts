// D. Les 10 coiffures des chibis (dev 3) : une partie DERRIÈRE la tête (cheveux longs, queue, chignon, afro) et une
// partie DEVANT (le dessus et la frange). Formes volontairement un peu inégales (graine).

import type { DefinitionChibi } from '../recette/types';
import { assombrir, eclaircir } from './couleurs';
import { TETE } from './geometrie';
import type { Pinceau, Pt } from './pinceau';
import { herissesPapier } from './persos/perso-1-papier';
import { cranePapier } from './persos/perso-5-papier';
import { longsDevantPapier, longsDosPapier } from './persos/longs';

/** Points sur le bord de la tête (agrandi de `plus`), de l'angle a0 à a1 (degrés, 0 = droite, −90 = haut). */
function arc(a0: number, a1: number, plus: number, n = 9, cy: number = TETE.cy): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([TETE.cx + Math.cos(a) * (TETE.rx + plus), cy + Math.sin(a) * (TETE.ry + plus)]);
  }
  return pts;
}

/** Calotte : bord du crâne de la tempe gauche à la tempe droite, puis la frange (de droite à gauche). */
function calotte(frange: Pt[], plus = 2.5, a0 = 192, a1 = 348): Pt[] {
  return [...arc(a0, a1, plus), ...frange];
}

export function cheveuxArriere(pi: Pinceau, def: DefinitionChibi) {
  const c = def.cheveux;
  const fonce = assombrir(c, 0.18);
  switch (def.coiffure) {
    case 'longs':
      if (pi.style === 'papier') return longsDosPapier(pi, c);
      return pi.forme('cheveuxDos', [...arc(170, 370, 4, 10), [37, -50], [33, -36], [22, -38], [-22, -38], [-33, -36], [-37, -50]], fonce, { ombre: true });
    case 'queue':
      pi.forme('queue', [[22, -88], [36, -86], [45, -74], [46, -58], [42, -48], [39, -60], [33, -74], [24, -80]], c, { ombre: true });
      return pi.forme('elastique', pi.ovale('elastique', 31, -84, 3.2, 4, 6), def.couleur, { epais: 0.6 });
    case 'chignon':
      return pi.forme('chignon', pi.ovale('chignon', 0, -98, 10.5, 9, 9, 0.07), c, { ombre: true });
    case 'afro': {
      const h = pi.hasard('afro');
      const pts: Pt[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 === 0 ? 1.07 : 0.97;
        const f = r * (1 + (h() * 2 - 1) * 0.05);
        pts.push([Math.cos(a) * 45 * f, -74 + Math.sin(a) * 38 * f]);
      }
      return pi.forme('afro', pts, c, { ombre: true });
    }
    default:
      return;
  }
}

export function cheveuxAvant(pi: Pinceau, def: DefinitionChibi) {
  const c = def.cheveux;
  switch (def.coiffure) {
    case 'courts':
      return pi.forme('cheveux', calotte([[31, -70], [24, -80], [17, -76], [9, -83], [1, -77], [-8, -83], [-16, -77], [-24, -81], [-31, -70]]), c, { ombre: true });
    case 'herisses': {
      if (pi.style === 'papier') return herissesPapier(pi, c);
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = ((195 + (150 * i) / 12) * Math.PI) / 180;
        const r = i % 2 === 1 ? 1.32 : 1.02;
        pts.push([Math.cos(a) * TETE.rx * r, TETE.cy + Math.sin(a) * TETE.ry * r * 1.05]);
      }
      return pi.forme('cheveux', [...pts, [31, -72], [22, -79], [12, -75], [4, -82], [-5, -76], [-14, -82], [-24, -77], [-31, -72]], c, { lisse: false, ombre: true });
    }
    case 'meche':
      pi.forme('cheveux', calotte([[32, -68], [27, -82], [14, -86], [0, -82], [-14, -74], [-26, -64], [-32, -62]], 3, 192, 350), c, { ombre: true });
      // Papier (perso 3) : un reflet clair qui suit la mèche, lisible même en petit.
      if (pi.style === 'papier') pi.ligne('refletMeche', [[22, -90], [8, -90], [-8, -84], [-20, -74]], { epais: 1.1, encre: eclaircir(c, 0.45) });
      return;
    case 'longs':
      if (pi.style === 'papier') return longsDevantPapier(pi, c);
      pi.forme('cheveux', calotte([[33, -56], [30, -70], [20, -82], [3, -86], [0, -82], [-3, -86], [-20, -82], [-30, -70], [-33, -56]], 3, 165, 375), c, { ombre: true });
      return;
    case 'queue':
      return pi.forme('cheveux', calotte([[31, -70], [22, -82], [6, -86], [-10, -82], [-24, -78], [-31, -70]]), c, { ombre: true });
    case 'chignon':
      return pi.forme('cheveux', calotte([[31, -72], [16, -82], [1, -84], [0, -81], [-1, -84], [-16, -82], [-31, -72]]), c, { ombre: true });
    case 'afro': {
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) pts.push([32 - i * 8, -78 + (i % 2) * -4]);
      return pi.forme('cheveux', calotte(pts, 4, 188, 352), c, { ombre: true });
    }
    case 'rase':
      if (pi.style === 'papier') return cranePapier(pi, def);
      pi.forme('cheveux', calotte([[31, -74], [0, -84], [-31, -74]], 0.8), c, { alpha: 0.55, epais: 0.5 });
      for (let i = 0; i < 7; i++) pi.rond(-18 + i * 6, -88 + (i % 2) * 2, 0.6, assombrir(c, 0.3));
      return;
    case 'bol':
      return pi.forme('cheveux', [...arc(160, 380, 3.5, 11), [35, -60], [27, -60], [27, -77], [-27, -77], [-27, -60], [-35, -60]], c, { ombre: true, lisse: false });
    case 'crete': {
      pi.forme('cotes', calotte([[31, -74], [0, -82], [-31, -74]], 0.6), c, { alpha: 0.45, epais: 0.45 });
      const pts: Pt[] = [[-7, -90]];
      for (let i = 0; i < 4; i++) pts.push([-6 + i * 4, -112 + (i % 2) * 3], [-4 + i * 4, -99]);
      pts.push([8, -90], [0, -93]);
      return pi.forme('crete', pts, c, { lisse: false, ombre: true });
    }
  }
}
