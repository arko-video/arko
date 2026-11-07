// D. Style « Pixel » : le perso est dessiné sur une petite GRILLE (56 cases pour sa hauteur), chaque forme remplie
// case par case, contours d'une case dans une teinte plus sombre, puis un contour sombre autour de la silhouette.
// La grille est recopiée agrandie, sans lissage (des rectangles pleins aux bords arrondis au pixel). Aucun canevas
// intermédiaire : le même code marche dans la page, le Worker d'export et les tests Node.

import type { Ctx2D } from '../../moteur/canevas';
import { assombrir, melanger, saturer } from '../couleurs';
import type { Pt } from '../courbes';
import type { OptionsForme, Pinceau, Rendu } from '../pinceau';

/** Hauteur du perso en cases, et contour de la silhouette. */
export const PIXEL = { cases: 56, encre: '#1B1426' } as const;

const hex = (c: string): number => (c.startsWith('#') && c.length === 7 ? parseInt(c.slice(1), 16) : 0x808080);
export const vif = (c: string) => (c.startsWith('#') ? melanger(c, saturer(c), 0.45) : c);

export class Grille {
  readonly c: Int32Array;
  constructor(readonly l: number, readonly h: number) {
    this.c = new Int32Array(l * h).fill(-1);
  }
  poser(x: number, y: number, v: number, alpha = 1) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.l || y >= this.h) return;
    const i = y * this.l + x;
    const avant = this.c[i]!;
    if (alpha >= 0.95) this.c[i] = v;
    else if (avant >= 0) this.c[i] = this.melange(avant, v, alpha);
    else if (alpha >= 0.5) this.c[i] = v;
  }
  private melange(a: number, b: number, t: number): number {
    if (a < 0) return b;
    const m = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return (m(16) << 16) | (m(8) << 8) | m(0);
  }
  /** Contour d'une case autour de la silhouette. */
  silhouette(v: number) {
    const { l, h, c } = this;
    const bord: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        const i = y * l + x;
        if (c[i]! >= 0) continue;
        // Les traits déjà sombres (signes « ! », « z », « ? ») ne reçoivent pas de contour.
        const plein = (j: number) => c[j]! >= 0 && c[j] !== v;
        if ((x > 0 && plein(i - 1)) || (x < l - 1 && plein(i + 1)) || (y > 0 && plein(i - l)) || (y < h - 1 && plein(i + l))) bord.push(i);
      }
    }
    for (const i of bord) c[i] = v;
  }
  /** Recopie : case (i, j) → rectangle en (x0 + i × k, y0 + j × k), un chemin par couleur. */
  recopier(ctx: Ctx2D, x0: number, y0: number, k: number) {
    const parCouleur = new Map<number, number[]>();
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.l) {
        const v = this.c[y * this.l + x]!;
        let x2 = x + 1;
        while (x2 < this.l && this.c[y * this.l + x2] === v) x2++;
        if (v >= 0) {
          let l = parCouleur.get(v);
          if (!l) parCouleur.set(v, (l = []));
          l.push(x, x2, y);
        }
        x = x2;
      }
    }
    const r = (v: number) => (k >= 1 ? Math.round(v) : v);
    ctx.save();
    for (const [v, runs] of parCouleur) {
      ctx.fillStyle = `#${v.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      for (let i = 0; i < runs.length; i += 3) {
        const a = r(x0 + runs[i]! * k);
        const b = r(x0 + runs[i + 1]! * k);
        const ya = r(y0 + runs[i + 2]! * k);
        const yb = r(y0 + (runs[i + 2]! + 1) * k);
        ctx.rect(a, ya, b - a, yb - ya);
      }
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Rendu sur la grille : le pinceau travaille en cases (ox, oy, k en cases). */
export class RenduPixel implements Rendu {
  constructor(readonly g: Grille) {}

  remplir(pi: Pinceau, _nom: string, base: Pt[], fond: string, o: OptionsForme) {
    const a = o.alpha ?? 1;
    if (a < 0.2) return;
    const pts = base.map((p) => pi.vers(p));
    const v = hex(vif(fond));
    const ys = pts.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.g.h - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const q = pts[(i + 1) % pts.length]!;
        if ((p[1] <= yc && q[1] > yc) || (q[1] <= yc && p[1] > yc)) xs.push(p[0] + ((yc - p[1]) / (q[1] - p[1])) * (q[0] - p[0]));
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i]! - 0.5); x + 0.5 <= xs[i + 1]!; x++) this.g.poser(x, y, v, a);
      }
    }
  }

  epaisseur(pi: Pinceau, f: number): number {
    return f * pi.kt;
  }

  contour(pi: Pinceau, _nom: string, base: Pt[], ferme: boolean, f: number, encre: string | undefined, fond: string | null) {
    const pts = base.map((p) => pi.vers(p));
    if (ferme && fond) {
      // Trop petite (un œil, un bouton) : pas de contour, il mangerait la forme.
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      if (Math.max(...xs) - Math.min(...xs) < 4.5 && Math.max(...ys) - Math.min(...ys) < 4.5) return;
    }
    const c = hex(encre ?? (ferme && fond && fond.startsWith('#') ? assombrir(vif(fond), 0.45) : PIXEL.encre));
    const epais = this.epaisseur(pi, f) >= 1.6;
    const n = ferme ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) this.segment(pts[i]!, pts[(i + 1) % pts.length]!, c, epais);
  }

  private segment(a: [number, number], b: [number, number], v: number, epais: boolean) {
    let x0 = Math.floor(a[0]);
    let y0 = Math.floor(a[1]);
    const x1 = Math.floor(b[0]);
    const y1 = Math.floor(b[1]);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let i = 0; i < 400; i++) {
      this.g.poser(x0, y0, v);
      if (epais) this.g.poser(x0 + 1, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  }

  rond(pi: Pinceau, cx: number, cy: number, r: number, couleur: string) {
    const [x, y] = pi.vers([cx, cy]);
    const rr = r * pi.k;
    const v = hex(couleur);
    if (rr < 0.8) return this.g.poser(x, y, v);
    for (let j = Math.floor(y - rr); j <= Math.ceil(y + rr); j++) {
      for (let i = Math.floor(x - rr); i <= Math.ceil(x + rr); i++) if ((i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2 <= rr * rr) this.g.poser(i, j, v);
    }
  }
}
