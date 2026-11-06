// Fond vert — banc d'essai (pur) : une image « clip YouTube sur fond vert » FABRIQUÉE par le code (jamais un vrai
// fichier) et les mesures du détourage. Sert aux tests Vitest (processeur) et au banc carte graphique (e2e).
// L'image imite ce qui rend le détourage difficile : vert pas uniforme (dégradé, ombre), bruit, blocs 8 × 8 d'une
// compression forte, couleurs sous-échantillonnées 4:2:0 (le vert « bave » sur 2 pixels autour du sujet), bords lissés.

import type { Rvb } from './chroma';

/** Petit hasard déterministe (même image à chaque fois). */
export function hasard(x: number, y: number, g: number): number {
  let n = (x * 374761393 + y * 668265263 + g * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export interface ImageBanc {
  l: number;
  h: number;
  /** RVBA opaque. */
  px: Uint8ClampedArray;
  /** Part de chaque pixel couverte par le personnage (0 = fond, 1 = personnage) : la « vérité ». */
  couverture: Float32Array;
}

export interface OptionsBanc {
  /** Couleur moyenne du fond (défaut : vert d'un clip YouTube, (40, 185, 70)). */
  fond?: Rvb;
  /** Amplitude du bruit (0 à 255, défaut 22). */
  bruit?: number;
  /** Ombre du personnage sur le fond (défaut oui). */
  ombre?: boolean;
  /** Couleur du t-shirt (défaut bleu foncé ; à changer pour un fond bleu). */
  habit?: Rvb;
}

/** Le personnage : tête (peau), cheveux noirs, t-shirt bleu foncé, pantalon gris, chaussures blanches. */
function personnage(x: number, y: number, l: number, h: number, habit: Rvb): Rvb | null {
  const cx = l * 0.5;
  const tete = { x: cx, y: h * 0.28, r: h * 0.12 };
  const dt = Math.hypot(x - tete.x, y - tete.y);
  if (dt < tete.r) return y < tete.y - tete.r * 0.45 ? [22, 16, 12] : [224, 172, 140];
  if (y >= h * 0.4 && y < h * 0.66 && Math.abs(x - cx) < l * 0.16) return habit;
  if (y >= h * 0.4 && y < h * 0.6 && Math.abs(x - cx) >= l * 0.16 && Math.abs(x - cx) < l * 0.2) return [224, 172, 140]; // bras
  if (y >= h * 0.66 && y < h * 0.88 && Math.abs(x - cx) < l * 0.12 && Math.abs(x - cx) > l * 0.015) return [110, 110, 118];
  if (y >= h * 0.88 && y < h * 0.92 && Math.abs(x - cx) < l * 0.14) return [245, 245, 245];
  return null;
}

/** Fabrique l'image l × h (sur-échantillonnage 4 × 4 pour des bords lissés comme une vraie vidéo). */
export function imageFondVert(l = 320, h = 240, o: OptionsBanc = {}): ImageBanc {
  const fond = o.fond ?? [40, 185, 70];
  const bruit = o.bruit ?? 22;
  const px = new Uint8ClampedArray(l * h * 4);
  const couverture = new Float32Array(l * h);
  const ss = 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let cov = 0;
      // Fond : dégradé de lumière (gauche plus sombre), ombre sous le personnage, blocs 8 × 8, bruit.
      const lum = 0.78 + 0.3 * (x / l) - (o.ombre === false ? 0 : 0.45 * Math.max(0, 1 - Math.hypot((x - l * 0.62) / (l * 0.18), (y - h * 0.93) / (h * 0.06))));
      const bloc = (hasard(x >> 3, y >> 3, 7) - 0.5) * 0.12;
      const f: Rvb = [fond[0] * (lum + bloc), fond[1] * (lum + bloc), fond[2] * (lum + bloc)];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = personnage(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, l, h, o.habit ?? [30, 52, 120]);
          if (c) cov++;
          const p = c ?? f;
          r += p[0];
          g += p[1];
          b += p[2];
        }
      }
      const n = ss * ss;
      const o4 = (y * l + x) * 4;
      px[o4] = r / n + (hasard(x, y, 1) - 0.5) * bruit;
      px[o4 + 1] = g / n + (hasard(x, y, 2) - 0.5) * bruit;
      px[o4 + 2] = b / n + (hasard(x, y, 3) - 0.5) * bruit;
      px[o4 + 3] = 255;
      couverture[y * l + x] = cov / n;
    }
  }
  sousEchantillonner420(px, l, h);
  return { l, h, px, couverture };
}

/** Comme une vidéo H.264 : la couleur (Cb, Cr) est moyennée par blocs de 2 × 2, la luminosité reste fine. */
export function sousEchantillonner420(px: Uint8ClampedArray, l: number, h: number) {
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < l; x += 2) {
      const ids: number[] = [];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) if (x + dx < l && y + dy < h) ids.push(((y + dy) * l + x + dx) * 4);
      let cb = 0;
      let cr = 0;
      const ys = ids.map((o) => {
        const [r, g, b] = [px[o]!, px[o + 1]!, px[o + 2]!];
        cb += -0.1146 * r - 0.3854 * g + 0.5 * b;
        cr += 0.5 * r - 0.4542 * g - 0.0458 * b;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      });
      cb /= ids.length;
      cr /= ids.length;
      ids.forEach((o, k) => {
        const yy = ys[k]!;
        px[o] = yy + 1.5748 * cr;
        px[o + 1] = yy - 0.1873 * cb - 0.4681 * cr;
        px[o + 2] = yy + 1.8556 * cb;
      });
    }
  }
}

export interface MesuresDetourage {
  /** Part des pixels du fond (à plus de 2 px du personnage) encore visibles (alpha > 8). */
  fondRestant: number;
  /** Part des pixels du personnage (à plus de 2 px du bord) effacés en partie (alpha < 247). */
  sujetEfface: number;
  /** Plus grand excès de vert (G − max(R, B), sur 255) d'un pixel visible, posé sur un fond gris. */
  vertMax: number;
  /** Plus grand excès de vert parmi les pixels du BORD (à 2 px ou moins du contour). */
  vertBord: number;
  /** Écart moyen entre l'alpha trouvé et la vraie couverture, sur le bord (0 à 1). */
  ecartBord: number;
}

/** Distance (en pixels, plafonnée à 3) de chaque pixel au contour du personnage. */
function distanceContour(c: Float32Array, l: number, h: number): Uint8Array {
  const d = new Uint8Array(l * h).fill(3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const v = c[y * l + x]!;
      if (v > 0 && v < 1) d[y * l + x] = 0;
      else {
        for (let r = 1; r <= 2 && d[y * l + x] === 3; r++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= l || yy >= h) continue;
              if ((c[yy * l + xx]! >= 0.5) !== (v >= 0.5)) d[y * l + x] = Math.min(d[y * l + x]!, r);
            }
          }
        }
      }
    }
  }
  return d;
}

/** Mesure un détourage RVBA non prémultiplié par rapport à la vérité de l'image du banc. */
export function mesurerDetourage(sortie: Uint8ClampedArray | Uint8Array, banc: ImageBanc): MesuresDetourage {
  const { l, h, couverture } = banc;
  const dist = distanceContour(couverture, l, h);
  let fond = 0;
  let fondVu = 0;
  let sujet = 0;
  let sujetEfface = 0;
  let vertMax = 0;
  let vertBord = 0;
  let ecart = 0;
  let bord = 0;
  for (let i = 0; i < l * h; i++) {
    const o = i * 4;
    const a = sortie[o + 3]! / 255;
    // Posé sur un gris moyen (128) : c'est là qu'un liseré vert se voit le mieux.
    const comp = [0, 1, 2].map((k) => sortie[o + k]! * a + 128 * (1 - a));
    const vert = a > 0.03 ? comp[1]! - Math.max(comp[0]!, comp[2]!) : 0;
    const d = dist[i]!;
    if (d >= 3 && couverture[i]! === 0) {
      fond++;
      if (sortie[o + 3]! > 8) fondVu++;
    } else if (d >= 3 && couverture[i]! === 1) {
      sujet++;
      if (sortie[o + 3]! < 247) sujetEfface++;
    }
    if (d <= 2) {
      bord++;
      ecart += Math.abs(a - couverture[i]!);
      vertBord = Math.max(vertBord, vert);
    }
    vertMax = Math.max(vertMax, vert);
  }
  return {
    fondRestant: fondVu / Math.max(1, fond),
    sujetEfface: sujetEfface / Math.max(1, sujet),
    vertMax: Math.round(vertMax),
    vertBord: Math.round(vertBord),
    ecartBord: Math.round((ecart / Math.max(1, bord)) * 1000) / 1000,
  };
}
