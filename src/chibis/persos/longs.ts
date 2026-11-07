// D. Cheveux longs du papier découpé goofy (perso 4, 7/11/2026). Le dos tombe DERRIÈRE les épaules (dessiné avant
// le torse et les bras) et finit en pointes de papier découpé : on voit des cheveux longs, pas un carré. Devant, deux
// mèches encadrent le visage jusqu'à la mâchoire. Le tout est dans le repère de la tête : il suit la tête penchée.
// Les anciens styles gardent leurs cheveux longs d'origine (coiffures.ts).

import { assombrir, eclaircir } from '../couleurs';
import { TETE } from '../geometrie';
import type { Pinceau, Pt } from '../pinceau';

/** Points sur le bord de la tête agrandi de `plus`, de l'angle a0 à a1 (degrés, −90 = haut). */
function bord(a0: number, a1: number, plus: number, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([Math.cos(a) * (TETE.rx + plus), TETE.cy + Math.sin(a) * (TETE.ry + plus)]);
  }
  return pts;
}

/** Côté droit du dos (de l'oreille aux pointes), en x positif ; le côté gauche est son miroir. */
const COTE: readonly Pt[] = [[42, -50], [48, -36], [52.5, -22], [53.5, -9], [48, -2], [44.5, -12], [39, 0], [34, -13]];

/** Penche de la tête vue à l'écran (radians, + = sens des aiguilles d'une montre, dans le repère du perso). */
function penchee(pi: Pinceau): number {
  const [x0, y0] = pi.vers([0, -66]);
  const [x1, y1] = pi.vers([0, -30]);
  return Math.atan2(x0 - x1, y1 - y0) * pi.s;
}

/** Les pointes pendent : plus un point est bas, plus il est ramené vers la verticale (75 % au bout). */
function pendre(pts: Pt[], a: number): Pt[] {
  return pts.map(([x, y]): Pt => {
    const w = Math.min(1, Math.max(0, (y + 50) / 45)) * 0.75;
    if (!w || !a) return [x, y];
    const c = Math.cos(-a * w);
    const s = Math.sin(-a * w);
    const dx = x;
    const dy = y + 56;
    return [dx * c - dy * s, -56 + dx * s + dy * c];
  });
}

/** Dos des cheveux longs : du crâne jusque sous les épaules, pointes inégales (graine), qui pendent. */
export function longsDosPapier(pi: Pinceau, c: string) {
  const h = pi.hasard('longsPapier');
  const a = penchee(pi);
  const droite = COTE.map(([x, y], i): Pt => [x + (i > 2 ? (h() - 0.5) * 3 : 0), y + (i > 2 ? (h() - 0.5) * 4 : 0)]);
  const gauche = COTE.map(([x, y], i): Pt => [-x - (i > 2 ? (h() - 0.5) * 3 : 0), y + (i > 2 ? (h() - 0.5) * 4 : 0)]).reverse();
  const fonce = assombrir(c, 0.08);
  const dos = [...bord(165, 375, 4, 14), ...droite, [24, -20], [0, -22], [-24, -20], ...gauche] as Pt[];
  pi.forme('cheveuxDos', pendre(dos, a), fonce, { ombre: true, lisse: false });
  // Mèches dessinées (traits) et un reflet clair : lisibles en petit, sur fond sombre.
  for (const s of [-1, 1]) {
    pi.ligne(`meche${s}`, pendre([[s * 41, -47], [s * 46.5, -31], [s * 48, -14]], a), { epais: 0.5, encre: assombrir(c, 0.4) });
    pi.ligne(`reflet${s}`, pendre([[s * 45, -44], [s * 50.5, -27]], a), { epais: 0.8, encre: eclaircir(c, 0.4) });
  }
}

/** Devant : le dessus du crâne, la frange, et deux mèches qui encadrent le visage jusqu'à la mâchoire. */
export function longsDevantPapier(pi: Pinceau, c: string) {
  const frange: Pt[] = [[29, -47], [27, -56], [28.5, -66], [29, -72], [20, -82], [3, -86], [0, -82], [-3, -86], [-20, -82], [-29, -72], [-28.5, -66], [-27, -56], [-29, -47]];
  pi.forme('cheveux', [...bord(150, 390, 3, 13), ...frange], c, { ombre: true, lisse: false });
}
