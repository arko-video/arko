// C. Qui parle (dev 1), fonctions PURES de classement : deux groupes de NIVEAU (histogramme à 1 dB, deux modes),
// TIMBRE d'une trame (8 bandes moins leur moyenne : le volume ne compte pas), centroïdes et k-moyennes à 2.

const NB = 8;

/** Seuil entre deux groupes de niveaux écartés d'au moins `ecart` dB (deux vrais modes, vallée entre), sinon null. */
export function deuxGroupesDeNiveau(niveaux: ArrayLike<number>, ecart: number): { seuil: number; bas: number; haut: number } | null {
  const n = niveaux.length;
  if (n < 20) return null;
  const brut = new Float64Array(101);
  for (let i = 0; i < n; i++) brut[Math.max(0, Math.min(100, Math.round(niveaux[i]! + 100)))]! += 1;
  // Histogramme lissé sur ±2 dB.
  const h = new Float64Array(101);
  for (let b = 0; b <= 100; b++) for (let d = -2; d <= 2; d++) h[b]! += brut[Math.max(0, Math.min(100, b + d))]! / 5;
  // Seuil d'Otsu (variance entre les deux groupes la plus grande).
  let total = 0;
  let somme = 0;
  for (let b = 0; b <= 100; b++) {
    total += h[b]!;
    somme += b * h[b]!;
  }
  let w0 = 0;
  let s0 = 0;
  let meilleur = -1;
  let otsu = 50;
  for (let b = 0; b < 100; b++) {
    w0 += h[b]!;
    s0 += b * h[b]!;
    const w1 = total - w0;
    if (w0 <= 0 || w1 <= 0) continue;
    const v = w0 * w1 * (s0 / w0 - (somme - s0) / w1) ** 2;
    if (v > meilleur) {
      meilleur = v;
      otsu = b + 0.5;
    }
  }
  let m1 = 0;
  let m2 = 100;
  for (let b = 0; b < otsu; b++) if (h[b]! > h[m1]!) m1 = b;
  for (let b = 100; b > otsu; b--) if (h[b]! > h[m2]!) m2 = b;
  if (m2 - m1 < ecart) return null;
  // Deux vrais sommets : chacun dépasse nettement la vallée entre eux, et chaque groupe pèse 5 % au moins.
  let vallee = Infinity;
  for (let b = m1; b <= m2; b++) vallee = Math.min(vallee, h[b]!);
  if (vallee > 0.6 * Math.min(h[m1]!, h[m2]!)) return null;
  const seuil = (m1 + m2) / 2;
  let dessous = 0;
  for (let i = 0; i < n; i++) if (niveaux[i]! + 100 < seuil) dessous++;
  if (dessous < 0.05 * n || n - dessous < 0.05 * n) return null;
  return { seuil: seuil - 100, bas: m1 - 100, haut: m2 - 100 };
}

/** Timbre de la trame k : ses 8 bandes (dB) moins leur moyenne (le niveau général ne compte pas). */
export function timbre(bandes: Float32Array, k: number, sortie: Float64Array = new Float64Array(NB)): Float64Array {
  let m = 0;
  for (let b = 0; b < NB; b++) m += bandes[k * NB + b]!;
  m /= NB;
  for (let b = 0; b < NB; b++) sortie[b] = bandes[k * NB + b]! - m;
  return sortie;
}

export function distance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < NB; i++) s += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(s);
}

/** Moyenne de vecteurs (null si aucun). */
export function moyenne(vecteurs: readonly ArrayLike<number>[]): Float64Array | null {
  if (vecteurs.length === 0) return null;
  const m = new Float64Array(NB);
  for (const v of vecteurs) for (let i = 0; i < NB; i++) m[i]! += v[i]! / vecteurs.length;
  return m;
}

/** Écart relatif des distances aux deux centroïdes (0 = à égalité, 1 = sur l'un d'eux) et le plus proche (0 ou 1). */
export function plusProche(x: ArrayLike<number>, c0: ArrayLike<number>, c1: ArrayLike<number>): { g: 0 | 1; ecart: number } {
  const d0 = distance(x, c0);
  const d1 = distance(x, c1);
  const max = Math.max(d0, d1);
  return { g: d0 <= d1 ? 0 : 1, ecart: max > 0 ? Math.abs(d0 - d1) / max : 0 };
}

/**
 * k-moyennes à 2 (déterministe : départ sur les deux points les plus éloignés). Renvoie les groupes, les centroïdes
 * et le rapport inter / intra = distance entre les centroïdes / distance moyenne entre deux points d'un même groupe
 * (mesuré sur voix fabriquées : une voix 1,0 à 1,2 ; deux voix 1,8 à 2,2 ; seuil 1,5).
 */
export function kMoyennes2(points: readonly Float64Array[], tours = 20): { groupes: (0 | 1)[]; c: [Float64Array, Float64Array]; rapport: number } | null {
  if (points.length < 4) return null;
  const centre = moyenne(points)!;
  const loin = (de: ArrayLike<number>) => points.reduce((m, p) => (distance(p, de) > distance(m, de) ? p : m), points[0]!);
  let c0: Float64Array = Float64Array.from(loin(centre));
  let c1: Float64Array = Float64Array.from(loin(c0));
  let groupes: (0 | 1)[] = [];
  for (let t = 0; t < tours; t++) {
    groupes = points.map((p) => plusProche(p, c0, c1).g);
    const a = moyenne(points.filter((_, i) => groupes[i] === 0));
    const b = moyenne(points.filter((_, i) => groupes[i] === 1));
    if (!a || !b) return null;
    c0 = a;
    c1 = b;
  }
  // Intra = distance moyenne entre deux points d'un même groupe (400 points par groupe au plus, pris régulièrement).
  let intra = 0;
  let paires = 0;
  for (const v of [0, 1]) {
    const siens = points.filter((_, i) => groupes[i] === v);
    const saut = Math.max(1, Math.floor(siens.length / 400));
    for (let i = 0; i < siens.length; i += saut)
      for (let j = i + saut; j < siens.length; j += saut) {
        intra += distance(siens[i]!, siens[j]!);
        paires++;
      }
  }
  intra = paires > 0 ? intra / paires : 0;
  return { groupes, c: [c0, c1], rapport: intra > 0 ? distance(c0, c1) / intra : Infinity };
}
