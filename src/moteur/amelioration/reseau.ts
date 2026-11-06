// Améliorer l'image — les réseaux CNN d'Anime4K (licence MIT, voir l'en-tête des fichiers poids-*.ts) et leur
// calcul de référence sur le processeur (pur, testé). La carte graphique fait EXACTEMENT le même calcul (shaders.ts) ;
// cette version sert aux tests (qualité mesurée, comparaison avec la carte graphique) et aux petites images.
//
// Une couche = convolution 3 × 3, 4 canaux en sortie. Entrée : 4 canaux (couche 1 : l'image RVB), ou 8 avec
// « CReLU » (max(x, 0) puis max(−x, 0) des 4 canaux de la couche précédente). Poids : 9 matrices 4 × 4 (× 2 avec
// CReLU), dans l'ordre d'Anime4K : décalage x de −1 à 1, puis y de −1 à 1 ; chaque matrice est rangée par colonnes
// (comme mat4 en GLSL : colonne c = ce que l'entrée c apporte aux 4 sorties). y vers le BAS (ligne 0 = haut).

export interface Couche {
  crelu: boolean;
  biais: readonly number[];
  poids: readonly number[];
}

export interface Reseau {
  nom: string;
  /** 'residu' : sortie = entrée + résultat (Restore). 'pixels2x2' : 4 canaux = 4 sous-pixels, ajoutés à l'entrée agrandie (Upscale ×2). */
  sortie: 'residu' | 'pixels2x2';
  couches: readonly Couche[];
}

/** Image en nombres à virgule, 4 canaux entrelacés (R, V, B, A), valeurs de 0 à 1 (ou négatives entre deux couches). */
export interface ImageF {
  l: number;
  h: number;
  d: Float32Array;
}

export function imageVide(l: number, h: number): ImageF {
  return { l, h, d: new Float32Array(l * h * 4) };
}

/** Une couche de convolution (bords : le pixel le plus proche, comme CLAMP_TO_EDGE). */
export function couche(entree: ImageF, c: Couche): ImageF {
  const { l, h, d } = entree;
  const sortie = imageVide(l, h);
  const o = sortie.d;
  const p = c.poids;
  const v = new Float32Array(4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let r0 = c.biais[0]!, r1 = c.biais[1]!, r2 = c.biais[2]!, r3 = c.biais[3]!;
      for (let t = 0; t < 9; t++) {
        const xx = Math.min(l - 1, Math.max(0, x + Math.floor(t / 3) - 1));
        const yy = Math.min(h - 1, Math.max(0, y + (t % 3) - 1));
        const i = (yy * l + xx) * 4;
        for (let k = 0; k < (c.crelu ? 2 : 1); k++) {
          for (let ci = 0; ci < 4; ci++) {
            const brut = d[i + ci]!;
            v[ci] = !c.crelu ? brut : k === 0 ? Math.max(brut, 0) : Math.max(-brut, 0);
          }
          const m = (k * 9 + t) * 16;
          for (let col = 0; col < 4; col++) {
            const e = v[col]!;
            if (e === 0) continue;
            r0 += p[m + col * 4]! * e;
            r1 += p[m + col * 4 + 1]! * e;
            r2 += p[m + col * 4 + 2]! * e;
            r3 += p[m + col * 4 + 3]! * e;
          }
        }
      }
      const j = (y * l + x) * 4;
      o[j] = r0;
      o[j + 1] = r1;
      o[j + 2] = r2;
      o[j + 3] = r3;
    }
  }
  return sortie;
}

/** Lecture bilinéaire (comme texture() en LINEAR, bords collés) au point (u, v) en pixels, centre du pixel 0 = 0,5. */
export function bilineaire(img: ImageF, u: number, v: number, out: Float32Array) {
  const fx = u - 0.5;
  const fy = v - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const ax = fx - x0;
  const ay = fy - y0;
  const cx0 = Math.min(img.l - 1, Math.max(0, x0)), cx1 = Math.min(img.l - 1, Math.max(0, x0 + 1));
  const cy0 = Math.min(img.h - 1, Math.max(0, y0)), cy1 = Math.min(img.h - 1, Math.max(0, y0 + 1));
  const d = img.d;
  for (let c = 0; c < 4; c++) {
    const a = d[(cy0 * img.l + cx0) * 4 + c]! * (1 - ax) + d[(cy0 * img.l + cx1) * 4 + c]! * ax;
    const b = d[(cy1 * img.l + cx0) * 4 + c]! * (1 - ax) + d[(cy1 * img.l + cx1) * 4 + c]! * ax;
    out[c] = a * (1 - ay) + b * ay;
  }
}

/** Agrandissement ×2 bilinéaire (la référence « sans amélioration »). */
export function agrandirBilineaire(img: ImageF): ImageF {
  const s = imageVide(img.l * 2, img.h * 2);
  const px = new Float32Array(4);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.l; x++) {
      bilineaire(img, (x + 0.5) / 2, (y + 0.5) / 2, px);
      s.d.set(px, (y * s.l + x) * 4);
    }
  }
  return s;
}

/**
 * Fait passer `img` dans le réseau. `force` (0 à 1) dose ce que le réseau ajoute (1 = Anime4K tel quel).
 * Restore : même taille. Upscale : taille × 2.
 */
export function appliquerReseau(img: ImageF, r: Reseau, force = 1): ImageF {
  let x = img;
  for (const c of r.couches) x = couche(x, c);
  if (r.sortie === 'residu') {
    const s = imageVide(img.l, img.h);
    for (let i = 0; i < s.d.length; i++) s.d[i] = (i & 3) === 3 ? 1 : img.d[i]! + force * x.d[i]!;
    return s;
  }
  const s = agrandirBilineaire(img);
  for (let y = 0; y < s.h; y++) {
    for (let xx = 0; xx < s.l; xx++) {
      const ajout = x.d[((y >> 1) * img.l + (xx >> 1)) * 4 + (y & 1) * 2 + (xx & 1)]! * force;
      const j = (y * s.l + xx) * 4;
      s.d[j] = s.d[j]! + ajout;
      s.d[j + 1] = s.d[j + 1]! + ajout;
      s.d[j + 2] = s.d[j + 2]! + ajout;
      s.d[j + 3] = 1;
    }
  }
  return s;
}

/** Ramène les valeurs entre 0 et 1 (comme l'écriture dans une image 8 bits). */
export function borner(img: ImageF): ImageF {
  for (let i = 0; i < img.d.length; i++) img.d[i] = Math.min(1, Math.max(0, img.d[i]!));
  return img;
}
