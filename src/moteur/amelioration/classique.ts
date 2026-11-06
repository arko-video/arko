// Améliorer l'image — le repli SANS IA (calcul de référence sur le processeur, pur, testé ; même calcul en GLSL
// dans shaders-classiques.ts) : déblocage des carrés 8 × 8 de la compression, agrandissement ×2 net (bicubique
// Catmull-Rom) et renforcement des contours adaptatif, dans l'esprit de CAS (AMD FidelityFX, licence MIT ; réécrit ici).

import { imageVide, type ImageF } from './reseau';

const luma = (d: Float32Array, i: number) => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;

/**
 * Déblocage : à la frontière de deux blocs 8 × 8, si la marche est petite (un défaut de compression, pas un vrai
 * contour) et que les deux côtés sont lisses, on la répartit sur 2 pixels de chaque côté. Les vrais contours (marche
 * > `seuil`, ou côtés détaillés) ne bougent pas : les pixels nets d'un jeu restent nets.
 */
export function debloquer(img: ImageF, seuil = 0.07): ImageF {
  const s: ImageF = { l: img.l, h: img.h, d: new Float32Array(img.d) };
  const passe = (vertical: boolean) => {
    const n = vertical ? img.l : img.h;
    const m = vertical ? img.h : img.l;
    const src = new Float32Array(s.d);
    for (let b = 8; b < n; b += 8) {
      for (let k = 0; k < m; k++) {
        const idx = (j: number) => (vertical ? (k * img.l + j) * 4 : (j * img.l + k) * 4);
        const p1 = idx(b - 2), p0 = idx(b - 1), q0 = idx(b), q1 = idx(b + 1 < n ? b + 1 : b);
        const marche = luma(src, q0) - luma(src, p0);
        const lisse = Math.abs(luma(src, p1) - luma(src, p0)) < seuil / 2 && Math.abs(luma(src, q1) - luma(src, q0)) < seuil / 2;
        if (Math.abs(marche) >= seuil || !lisse) continue;
        for (let c = 0; c < 3; c++) {
          const d = src[q0 + c]! - src[p0 + c]!;
          s.d[p1 + c] = src[p1 + c]! + d / 8;
          s.d[p0 + c] = src[p0 + c]! + (3 * d) / 8;
          s.d[q0 + c] = src[q0 + c]! - (3 * d) / 8;
          if (b + 1 < n) s.d[q1 + c] = src[q1 + c]! - d / 8;
        }
      }
    }
  };
  passe(true);
  passe(false);
  return s;
}

/** Poids Catmull-Rom (a = −0,5) pour une distance t. */
function cr(t: number): number {
  const x = Math.abs(t);
  if (x < 1) return 1.5 * x * x * x - 2.5 * x * x + 1;
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
  return 0;
}

/** Agrandissement ×2 bicubique (Catmull-Rom) : plus net que le bilinéaire, sans « bave » autour des pixels. */
export function agrandirBicubique(img: ImageF): ImageF {
  const s = imageVide(img.l * 2, img.h * 2);
  for (let y = 0; y < s.h; y++) {
    const fy = (y + 0.5) / 2 - 0.5;
    const y0 = Math.floor(fy);
    for (let x = 0; x < s.l; x++) {
      const fx = (x + 0.5) / 2 - 0.5;
      const x0 = Math.floor(fx);
      const acc = [0, 0, 0];
      for (let j = -1; j <= 2; j++) {
        const wy = cr(fy - (y0 + j));
        const yy = Math.min(img.h - 1, Math.max(0, y0 + j));
        for (let i = -1; i <= 2; i++) {
          const w = wy * cr(fx - (x0 + i));
          const k = (yy * img.l + Math.min(img.l - 1, Math.max(0, x0 + i))) * 4;
          acc[0] += w * img.d[k]!;
          acc[1] += w * img.d[k + 1]!;
          acc[2] += w * img.d[k + 2]!;
        }
      }
      const o = (y * s.l + x) * 4;
      s.d[o] = acc[0]!;
      s.d[o + 1] = acc[1]!;
      s.d[o + 2] = acc[2]!;
      s.d[o + 3] = 1;
    }
  }
  return s;
}

/**
 * Renforcement adaptatif des contours (esprit CAS) : le poids des 4 voisins dépend du contraste local, pour
 * renforcer les détails fins sans « halo » sur les contours déjà forts. `force` de 0 (rien) à 1 (le plus net).
 */
export function renforcer(img: ImageF, force: number): ImageF {
  if (force <= 0) return img;
  const s: ImageF = { l: img.l, h: img.h, d: new Float32Array(img.d) };
  const pic = -1 / (8 - 3 * Math.min(1, force)); // de −1/8 (doux) à −1/5 (fort)
  const at = (x: number, y: number) => (Math.min(img.h - 1, Math.max(0, y)) * img.l + Math.min(img.l - 1, Math.max(0, x))) * 4;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.l; x++) {
      const e = at(x, y), b = at(x, y - 1), d = at(x - 1, y), f = at(x + 1, y), h = at(x, y + 1);
      const o = (y * img.l + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = [img.d[b + c]!, img.d[d + c]!, img.d[e + c]!, img.d[f + c]!, img.d[h + c]!];
        const mn = Math.min(...v);
        const mx = Math.max(...v);
        const amp = Math.sqrt(Math.min(1, Math.max(0, Math.min(mn, 1 - mx) / Math.max(mx, 1e-4))));
        const w = amp * pic;
        s.d[o + c] = (w * (v[0]! + v[1]! + v[3]! + v[4]!) + v[2]!) / (1 + 4 * w);
      }
    }
  }
  return s;
}
