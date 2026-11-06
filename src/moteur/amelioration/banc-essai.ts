// Améliorer l'image — banc d'essai (pur) : une image de jeu « façon Minecraft » fabriquée par le code, sa version
// abîmée comme une capture OBS (moitié de la taille, sous-échantillonnage des couleurs 4:2:0 et blocs 8 × 8 d'une
// compression forte), et les mesures (PSNR, netteté). Sert aux tests de qualité (Vitest) et à l'e2e.

import { imageVide, type ImageF } from './reseau';

/** Petit hasard déterministe (même image à chaque fois). */
function hasard(x: number, y: number, g: number): number {
  let n = (x * 374761393 + y * 668265263 + g * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

type Rvb = [number, number, number];
const BLOCS: { base: Rvb; variation: number; motif: (tx: number, ty: number) => number }[] = [
  { base: [0.36, 0.6, 0.2], variation: 0.12, motif: () => 1 }, // herbe
  { base: [0.47, 0.33, 0.22], variation: 0.1, motif: () => 1 }, // terre
  { base: [0.5, 0.5, 0.5], variation: 0.14, motif: (tx, ty) => ((tx * 7 + ty * 3) % 11 === 0 ? 0.7 : 1) }, // pierre
  { base: [0.62, 0.48, 0.28], variation: 0.06, motif: (_tx, ty) => (ty % 4 === 3 ? 0.62 : 1) }, // planches
  { base: [0.2, 0.42, 0.14], variation: 0.15, motif: (tx, ty) => (hasard(tx, ty, 9) < 0.25 ? 0.35 : 1) }, // feuilles
];

/**
 * Image de jeu l × h : ciel, rangées de blocs (texels de 8, 4 puis 2 pixels), barre d'objets nette en bas.
 * `grain` : force du bruit des textures (1 = façon Minecraft ; 0 = aplats, seulement les contours et les motifs).
 */
export function imageJeu(l = 512, h = 288, grain = 1): ImageF {
  const img = imageVide(l, h);
  const ciel = Math.round(h * 0.3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let c: Rvb;
      if (y < ciel) {
        const a = y / ciel;
        c = [0.45 + 0.2 * a, 0.65 + 0.15 * a, 0.95];
      } else {
        // Rangées : loin en haut (texel 1 px), près en bas (texel 4 px).
        const r = (y - ciel) / (h - ciel);
        const texel = r < 0.25 ? 2 : r < 0.55 ? 4 : 8;
        const tx = Math.floor((x + (texel === 4 ? 7 : 0)) / texel);
        const ty = Math.floor((y - ciel) / texel);
        const bx = Math.floor(tx / 16);
        const by = Math.floor(ty / 16);
        const bloc = BLOCS[Math.floor(hasard(bx, by, texel) * BLOCS.length)]!;
        const n = 1 + (hasard(tx, ty, 1) - 0.5) * 2 * bloc.variation * grain;
        const bord = tx % 16 === 0 || ty % 16 === 0 ? 0.72 : 1; // ombre au bord des blocs
        const ombre = (by + bx) % 3 === 0 ? 0.85 : 1;
        const k = n * bord * ombre * bloc.motif(tx % 16, ty % 16);
        c = [bloc.base[0] * k, bloc.base[1] * k, bloc.base[2] * k];
      }
      const i = (y * l + x) * 4;
      img.d[i] = c[0];
      img.d[i + 1] = c[1];
      img.d[i + 2] = c[2];
      img.d[i + 3] = 1;
    }
  }
  // Barre d'objets : cases à bord blanc de 2 px, chiffre « 64 » en pixels.
  const cases = 9;
  const cote = Math.round(h * 0.1);
  const x0 = Math.round((l - cases * cote) / 2);
  const y0 = h - cote - 4;
  for (let k = 0; k < cases; k++) {
    for (let y = 0; y < cote; y++) {
      for (let x = 0; x < cote; x++) {
        const bordure = x < 2 || y < 2 || x >= cote - 2 || y >= cote - 2;
        const i = ((y0 + y) * l + x0 + k * cote + x) * 4;
        const v = bordure ? (k === 3 ? 1 : 0.55) : 0.18;
        if (!bordure && hasard(x >> 1, y >> 1, k) < 0.5) continue; // case à moitié transparente
        img.d[i] = img.d[i + 1] = img.d[i + 2] = v;
      }
    }
  }
  return img;
}

const CHIFFRES = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

/** Interface de jeu en pixels (texte 3 × 5 avec ombre, barre d'objets, cœurs) : chaque pixel du jeu fait `px` pixels. */
export function imageInterface(l = 512, h = 288, px = 3): ImageF {
  const img = imageVide(l, h);
  for (let i = 0; i < l * h; i++) img.d.set([0.35, 0.55 - (0.2 * Math.floor(i / l)) / h, 0.25, 1], i * 4);
  const poser = (x: number, y: number, c: Rvb) => {
    for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) if (x * px + i < l && y * px + j < h) img.d.set([...c, 1], ((y * px + j) * l + x * px + i) * 4);
  };
  for (let k = 0, gx = 4; k < 24; k++, gx += 4) {
    const g = CHIFFRES[(k * 7) % 10]!;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') (poser(gx + i + 1, 5 + j, [0.15, 0.15, 0.15]), poser(gx + i, 4 + j, [1, 1, 1]));
  }
  for (let k = 0; k < 9; k++) {
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) {
      if (i < 1 || j < 1 || i > 18 || j > 18) poser(8 + k * 20 + i, 20 + j, k === 3 ? [1, 1, 1] : [0.55, 0.55, 0.55]);
      else if ((i * j + k) % 5 === 0) poser(8 + k * 20 + i, 20 + j, [0.2, 0.2, 0.2]);
    }
  }
  for (let k = 0; k < 10; k++) {
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      const d = Math.abs(i - 3) + Math.abs(j - 3.5);
      if (d < 4.2) poser(8 + k * 8 + i, 44 + j, d > 3 ? [0.2, 0, 0] : [0.9, 0.1, 0.1]);
    }
  }
  return img;
}

/** Dessin à traits noirs lissés (le terrain d'entraînement d'Anime4K) : vérifie que le portage calcule juste. */
export function imageDessin(l = 256, h = 160): ImageF {
  const img = imageVide(l, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const acc = [0, 0, 0];
      for (let s = 0; s < 16; s++) {
        const X = x + ((s & 3) + 0.5) / 4;
        const Y = y + ((s >> 2) + 0.5) / 4;
        const d = Math.hypot(X - l * 0.3, Y - h * 0.5);
        let c: Rvb = d < h * 0.3 ? [0.9, 0.3, 0.3] : [0.9, 0.85, 0.7];
        if (Math.abs(d - h * 0.3) < 1.5 || (X > l * 0.5 && Math.abs(Y - 10 - 0.37 * (X - l * 0.5)) < 1.2)) c = [0.05, 0.05, 0.08];
        for (let k = 0; k < 3; k++) acc[k] += c[k]! / 16;
      }
      img.d.set([acc[0]!, acc[1]!, acc[2]!, 1], (y * l + x) * 4);
    }
  }
  return img;
}

/** Réduit de moitié (moyenne de 4 pixels). */
export function reduireMoitie(img: ImageF): ImageF {
  const s = imageVide(img.l >> 1, img.h >> 1);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.l; x++) {
      for (let c = 0; c < 4; c++) {
        const a = (dy: number, dx: number) => img.d[((2 * y + dy) * img.l + 2 * x + dx) * 4 + c]!;
        s.d[(y * s.l + x) * 4 + c] = (a(0, 0) + a(0, 1) + a(1, 0) + a(1, 1)) / 4;
      }
    }
  }
  return s;
}

const COS = Array.from({ length: 64 }, (_, i) => Math.cos(((2 * (i >> 3) + 1) * (i & 7) * Math.PI) / 16));
const C = (u: number) => (u === 0 ? Math.SQRT1_2 : 1);

/** Compresse un plan par blocs 8 × 8 : DCT, division par `pas`, arrondi, DCT inverse (les « carrés » de compression). */
function compresserPlan(p: Float32Array, l: number, h: number, pas: (u: number, v: number) => number) {
  const bloc = new Float32Array(64);
  const coef = new Float32Array(64);
  for (let by = 0; by < h; by += 8) {
    for (let bx = 0; bx < l; bx += 8) {
      for (let i = 0; i < 64; i++) bloc[i] = p[Math.min(h - 1, by + (i >> 3)) * l + Math.min(l - 1, bx + (i & 7))]! * 255 - 128;
      for (let v = 0; v < 8; v++) {
        for (let u = 0; u < 8; u++) {
          let s = 0;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += bloc[y * 8 + x]! * COS[x * 8 + u]! * COS[y * 8 + v]!;
          const q = pas(u, v);
          coef[v * 8 + u] = Math.round((0.25 * C(u) * C(v) * s) / q) * q;
        }
      }
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          let s = 0;
          for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) s += C(u) * C(v) * coef[v * 8 + u]! * COS[x * 8 + u]! * COS[y * 8 + v]!;
          if (by + y < h && bx + x < l) p[(by + y) * l + bx + x] = (0.25 * s + 128) / 255;
        }
      }
    }
  }
}

/** Abîme une image comme un H.264 à petit débit : couleurs 4:2:0 et blocs 8 × 8 (`force` : pas de quantification). */
export function compresser(img: ImageF, force = 18): ImageF {
  const { l, h } = img;
  const Y = new Float32Array(l * h);
  const cl = l >> 1, ch = h >> 1;
  const Cb = new Float32Array(cl * ch);
  const Cr = new Float32Array(cl * ch);
  for (let i = 0; i < l * h; i++) {
    const [r, g, b] = [img.d[i * 4]!, img.d[i * 4 + 1]!, img.d[i * 4 + 2]!];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cl; x++) {
      let cb = 0, cr = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const i = ((2 * y + dy) * l + 2 * x + dx) * 4;
        const [r, g, b] = [img.d[i]!, img.d[i + 1]!, img.d[i + 2]!];
        const yy = 0.299 * r + 0.587 * g + 0.114 * b;
        cb += (b - yy) * 0.564 + 0.5;
        cr += (r - yy) * 0.713 + 0.5;
      }
      Cb[y * cl + x] = cb / 4;
      Cr[y * cl + x] = cr / 4;
    }
  }
  const pas = (u: number, v: number) => force * (1 + (u + v) * 0.6);
  compresserPlan(Y, l, h, pas);
  compresserPlan(Cb, cl, ch, (u, v) => pas(u, v) * 1.3);
  compresserPlan(Cr, cl, ch, (u, v) => pas(u, v) * 1.3);
  const s = imageVide(l, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const yy = Y[y * l + x]!;
      const k = Math.min(ch - 1, y >> 1) * cl + Math.min(cl - 1, x >> 1);
      const cb = (Cb[k]! - 0.5) / 0.564;
      const cr = (Cr[k]! - 0.5) / 0.713;
      const r = yy + cr;
      const b = yy + cb;
      const g = (yy - 0.299 * r - 0.114 * b) / 0.587;
      const i = (y * l + x) * 4;
      s.d[i] = Math.min(1, Math.max(0, r));
      s.d[i + 1] = Math.min(1, Math.max(0, g));
      s.d[i + 2] = Math.min(1, Math.max(0, b));
      s.d[i + 3] = 1;
    }
  }
  return s;
}

/** PSNR (dB) entre deux images de même taille, sur R, V, B, en ignorant `marge` pixels au bord. */
export function psnr(a: ImageF, b: ImageF, marge = 4): number {
  let s = 0;
  let n = 0;
  for (let y = marge; y < a.h - marge; y++) {
    for (let x = marge; x < a.l - marge; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * a.l + x) * 4 + c;
        const e = Math.min(1, Math.max(0, a.d[i]!)) - Math.min(1, Math.max(0, b.d[i]!));
        s += e * e;
        n++;
      }
    }
  }
  return 10 * Math.log10(1 / (s / n));
}

/** Netteté : énergie moyenne du laplacien de la luminance (plus c'est haut, plus les contours sont nets). */
export function nettete(img: ImageF): number {
  const L = (x: number, y: number) => {
    const i = (y * img.l + x) * 4;
    return 0.299 * img.d[i]! + 0.587 * img.d[i + 1]! + 0.114 * img.d[i + 2]!;
  };
  let s = 0;
  for (let y = 1; y < img.h - 1; y++) {
    for (let x = 1; x < img.l - 1; x++) {
      const v = 4 * L(x, y) - L(x - 1, y) - L(x + 1, y) - L(x, y - 1) - L(x, y + 1);
      s += v * v;
    }
  }
  return s / ((img.l - 2) * (img.h - 2));
}
