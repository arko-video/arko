// Fond vert — l'incrustation par « chroma key », version de RÉFÉRENCE sur le processeur (pure, testée avec Vitest).
// La carte graphique (gpu-chroma.ts, shader-chroma.ts) fait EXACTEMENT le même calcul ; ce fichier sert aussi de
// repli quand WebGL2 manque. Aperçu = export : les deux passent par incruster.ts, dans LE chemin de rendu.
//
// Le calcul, pour une couleur de fond K (vert ou bleu ; P = son canal dominant, Q1 et Q2 les deux autres) :
// 1. « ressemblance au fond » m d'un pixel = (P − max(Q1, Q2)) / max(P, 0,25), divisée par celle de K, bornée à [0 ; 1].
//    Elle ne dépend presque pas de la lumière : une ombre verte reste du fond, un vert compressé « pas uniforme » aussi ;
//    une peau, un rouge, un blanc, un noir valent 0 (gardés). Le plancher 0,25 évite d'effacer les noirs un peu verdâtres.
// 2. m est moyennée sur 3 × 3 pixels : le bruit de compression du fond disparaît, et le bord du sujet devient un
//    dégradé d'un pixel (pas de liseré net).
// 3. alpha = douce montée de 0 (d = 1 − m ≤ tolérance) à 1 (d ≥ tolérance + douceur), multipliée par
//    l'« anti-poussière » (moyenne 5 × 5) : les petits points de bruit au milieu du fond partent aussi.
// 4. anti-débordement : l'excès de P au-dessus de max(Q1, Q2) est retiré (reflet vert sur les bords), en entier sur les
//    pixels proches du fond (deux fois la ressemblance moyenne du voisinage, en plus du réglage), selon le réglage ailleurs.

export type Rvb = [number, number, number];

export interface ReglagesChroma {
  /** Couleur du fond (0 à 255), trouvée sur les bords du clip. */
  couleur: Rvb;
  /** 0 à 0,9 : plus haut = plus de pixels considérés comme du fond. */
  tolerance: number;
  /** 0,02 à 0,6 : largeur du dégradé des bords. */
  douceur: number;
  /** 0 à 1 : part du reflet vert retirée (1 = tout). */
  debordement: number;
}

/** Valeurs par défaut : réglées sur des clips YouTube compressés (vert pas uniforme, ombres, 4:2:0). */
export const CHROMA_DEFAUT = { tolerance: 0.42, douceur: 0.25, debordement: 0.7 } as const;
export const CHROMA_BORNES = {
  tolerance: [0, 0.9],
  douceur: [0.02, 0.6],
  debordement: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Anti-poussière : si 55 % à 75 % (et plus) du voisinage 5 × 5 ressemble au fond, le pixel s'efface (points et taches
 * de bruit d'une vidéo compressée). Un détail fin du sujet (mèche de 2 px) en a 60 % : presque entièrement gardé.
 */
export const POUSSIERE = [0.55, 0.75] as const;

/** Plancher du dénominateur (voir l'en-tête) et ressemblance minimale de la couleur de fond. */
export const PLANCHER = 0.25;
const RESSEMBLANCE_MIN = 0.15;

/** Canal dominant de la couleur de fond : 1 = vert, 2 = bleu. */
export function canalCle(c: Rvb): 1 | 2 {
  return c[2] > c[1] ? 2 : 1;
}

/** Ressemblance brute (P − max(Q)) / max(P, plancher), couleurs de 0 à 1. */
export function ressemblanceBrute(r: number, g: number, b: number, canal: 1 | 2): number {
  const p = canal === 1 ? g : b;
  const q = canal === 1 ? Math.max(r, b) : Math.max(r, g);
  return (p - q) / Math.max(p, PLANCHER);
}

/** Ressemblance de la couleur de fond elle-même (le dénominateur de m), jamais sous 0,15. */
export function ressemblanceCle(c: Rvb): number {
  return Math.max(RESSEMBLANCE_MIN, ressemblanceBrute(c[0] / 255, c[1] / 255, c[2] / 255, canalCle(c)));
}

/** Douce montée de 0 à 1 entre a et b (comme smoothstep du GLSL). */
export function montee(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Détoure une image RVBA (opaque, non prémultipliée) : renvoie une image RVBA NON prémultipliée de même taille.
 * `dst` (facultatif) est réutilisé. Référence exacte du shader.
 */
export function chromaCpu(src: Uint8ClampedArray | Uint8Array, l: number, h: number, reg: ReglagesChroma, dst?: Uint8ClampedArray): Uint8ClampedArray {
  const n = l * h;
  const sortie = dst && dst.length === n * 4 ? dst : new Uint8ClampedArray(n * 4);
  const canal = canalCle(reg.couleur);
  const k = ressemblanceCle(reg.couleur);
  // 1. ressemblance de chaque pixel.
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const v = ressemblanceBrute(src[o]! / 255, src[o + 1]! / 255, src[o + 2]! / 255, canal) / k;
    m[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  // 2. sommes 3 × 3 et 5 × 5, bords collés (comme texelFetch borné du shader) : séparables, ligne puis colonne.
  const h3 = new Float32Array(n);
  const h5 = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let s3 = 0;
      let s5 = 0;
      for (let d = -2; d <= 2; d++) {
        const v = m[y * l + Math.min(l - 1, Math.max(0, x + d))]!;
        s5 += v;
        if (d >= -1 && d <= 1) s3 += v;
      }
      h3[y * l + x] = s3;
      h5[y * l + x] = s5;
    }
  }
  const bas = reg.tolerance;
  const haut = reg.tolerance + reg.douceur;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let s3 = 0;
      let s5 = 0;
      for (let d = -2; d <= 2; d++) {
        const i = Math.min(h - 1, Math.max(0, y + d)) * l + x;
        s5 += h5[i]!;
        if (d >= -1 && d <= 1) s3 += h3[i]!;
      }
      const moy = s3 / 9;
      // 3. alpha, et « anti-poussière » : un point isolé au milieu du fond (bruit de compression) disparaît.
      const a = montee(bas, haut, 1 - moy) * (1 - montee(POUSSIERE[0], POUSSIERE[1], s5 / 25));
      // 4. anti-débordement.
      const o = (y * l + x) * 4;
      let r = src[o]! / 255;
      let g = src[o + 1]! / 255;
      let b = src[o + 2]! / 255;
      const quantite = Math.min(1, reg.debordement + 2 * moy);
      if (canal === 1) g -= quantite * Math.max(0, g - Math.max(r, b));
      else b -= quantite * Math.max(0, b - Math.max(r, g));
      sortie[o] = Math.round(r * 255);
      sortie[o + 1] = Math.round(g * 255);
      sortie[o + 2] = Math.round(b * 255);
      sortie[o + 3] = Math.round(a * 255);
    }
  }
  return sortie;
}

/** Résultat de la détection de la couleur de fond sur les bords d'une image. */
export interface FondDetecte {
  couleur: Rvb;
  type: 'vert' | 'bleu';
  /** Part des pixels du bord qui sont de cette couleur (0 à 1). */
  part: number;
}

/** Part minimale du bord qui doit être verte (ou bleue) pour dire « fond vert ». */
export const PART_BORD_MIN = 0.3;

/** Un pixel nettement vert (1) ou bleu (2), sinon 0. Couleurs de 0 à 255. */
export function teinteNette(r: number, g: number, b: number): 0 | 1 | 2 {
  if (g > 60 && g - Math.max(r, b) > 30 && g > 1.25 * Math.max(r, b)) return 1;
  if (b > 60 && b - Math.max(r, g) > 30 && b > 1.25 * Math.max(r, g)) return 2;
  return 0;
}

function mediane(v: number[]): number {
  const t = [...v].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)] ?? 0;
}

/**
 * Trouve la couleur du fond sur les BORDS de l'image (anneau de 3 % du petit côté, au moins 2 pixels) :
 * la teinte (vert ou bleu) la plus présente si elle couvre au moins 30 % du bord, avec la médiane de chaque canal.
 * null : pas de fond vert ni bleu.
 */
export function detecterFond(px: Uint8ClampedArray | Uint8Array, l: number, h: number): FondDetecte | null {
  const e = Math.max(2, Math.round(Math.min(l, h) * 0.03));
  const verts: [number[], number[], number[]] = [[], [], []];
  const bleus: [number[], number[], number[]] = [[], [], []];
  let total = 0;
  // Un pixel sur deux suffit (rapide même en 1080p).
  for (let y = 0; y < h; y += 2) {
    const bordY = y < e || y >= h - e;
    for (let x = 0; x < l; x += bordY ? 2 : 1) {
      if (!bordY && x >= e && x < l - e) x = l - e; // saute l'intérieur
      const o = (y * l + x) * 4;
      const r = px[o]!;
      const g = px[o + 1]!;
      const b = px[o + 2]!;
      total++;
      const t = teinteNette(r, g, b);
      const cible = t === 1 ? verts : t === 2 ? bleus : null;
      if (cible) {
        cible[0].push(r);
        cible[1].push(g);
        cible[2].push(b);
      }
    }
  }
  if (total === 0) return null;
  const meilleur = verts[0].length >= bleus[0].length ? { v: verts, type: 'vert' as const } : { v: bleus, type: 'bleu' as const };
  const part = meilleur.v[0].length / total;
  if (part < PART_BORD_MIN) return null;
  const couleur: Rvb = [mediane(meilleur.v[0]), mediane(meilleur.v[1]), mediane(meilleur.v[2])];
  return { couleur, type: meilleur.type, part: Math.round(part * 100) / 100 };
}
