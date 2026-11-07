// Qui parle v4 (dev-voix), fonctions PURES : trouver les GROUPES de voix.
//  - par le niveau des morceaux (poids = durée) : histogramme à 1 dB lissé, CREUX entre deux sommets ; « 2 voix » si
//    l'écart des médianes ≥ 6 dB, le creux ≤ 0,6 × le plus petit sommet, les deux sommets à 2 dB au moins du creux et
//    chaque côté ≥ 5 % du temps ; chaque côté peut encore se couper (3 voix ou plus) avec des règles plus strictes. Le seuil part du creux puis se place à mi-chemin des deux
//    voix en écarts mesurés DU CÔTÉ DU SEUIL : une voix a une longue traîne vers le bas (fins de phrase, voix calme)
//    et presque pas vers le haut, donc le bon seuil est plus près de la voix faible que le creux (vraie session :
//    95,0 % du temps bien classé contre 93,2 % au creux ; 95,7 % au mieux) ;
//  - par les empreintes neuronales (CAM++, normées) : k-moyennes au cosinus, « 2 voix » si le cosinus des centres
//    < 0,68 (références : 0,76–0,82 pour une voix, 0,53 pour Romain + Guts).
// Déterministe : aucun hasard sans graine fixe.

import { CAMPLUS } from '../modeles/catalogue';

export const REGLAGES_GROUPES = {
  /** Écart minimal entre les médianes de deux groupes de niveau (dB). */
  ecartMinDb: 6,
  /** Creux ≤ valleeMax × le plus petit des deux sommets. */
  valleeMax: 0.6,
  /** Chaque groupe pèse au moins `partMin` du temps de parole. */
  partMin: 0.05,
  /** Pour une 3ᵉ voix (ou plus) : règles plus strictes (une même voix a parfois deux façons de parler). */
  valleeMaxEnPlus: 0.45,
  partMinEnPlus: 0.08,
  /** Voix au plus (une seule piste). */
  voixMax: 4,
  /**
   * Lissage de l'histogramme : triangle de ± `lissage` dB (écart type ≈ 0,7 dB). ± 2 dB remplit trop le creux : vraie
   * session, 10 premières minutes, creux 0,66 à ± 2 dB contre 0,49 à ± 1 dB pour 11 dB d'écart entre les voix.
   */
  lissage: 1,
  /** Un sommet est un vrai sommet s'il est à au moins `sommetLoin` dB du creux (pas une bosse du bruit au bord). */
  sommetLoin: 2,
} as const;

export type ReglagesGroupes = { -readonly [K in keyof typeof REGLAGES_GROUPES]: number };

const BAS = -100;
const NB = 101;

/** Médiane pondérée. */
export function medianePonderee(x: ArrayLike<number>, poids: ArrayLike<number>): number {
  const n = x.length;
  if (n === 0) return BAS;
  const ix = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a]! - x[b]!);
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(0, poids[i]!);
  if (total <= 0) return x[ix[Math.floor(n / 2)]!]!;
  let s = 0;
  for (const i of ix) {
    s += Math.max(0, poids[i]!);
    if (s >= total / 2) return x[i]!;
  }
  return x[ix[n - 1]!]!;
}

/** Histogramme pondéré à 1 dB (−100…0 dB) des valeurs d'indices `ix`, lissé par un triangle de ± l dB. */
function histogramme(x: ArrayLike<number>, poids: ArrayLike<number>, ix: readonly number[], l: number): Float64Array {
  const brut = new Float64Array(NB);
  for (const i of ix) brut[Math.max(0, Math.min(NB - 1, Math.round(x[i]! - BAS)))]! += Math.max(0, poids[i]!);
  if (l <= 0) return brut;
  const h = new Float64Array(NB);
  const norme = (l + 1) * (l + 1);
  for (let b = 0; b < NB; b++)
    for (let d = -l; d <= l; d++) {
      const c = b + d;
      if (c >= 0 && c < NB) h[b]! += (brut[c]! * (l + 1 - Math.abs(d))) / norme;
    }
  return h;
}

/** Seuil d'Otsu (dB) d'un histogramme. */
function otsu(h: Float64Array): number {
  let total = 0;
  let somme = 0;
  for (let b = 0; b < NB; b++) {
    total += h[b]!;
    somme += b * h[b]!;
  }
  let w0 = 0;
  let s0 = 0;
  let meilleur = -1;
  let seuil = NB / 2;
  for (let b = 0; b < NB - 1; b++) {
    w0 += h[b]!;
    s0 += b * h[b]!;
    const w1 = total - w0;
    if (w0 <= 0 || w1 <= 0) continue;
    const v = w0 * w1 * (s0 / w0 - (somme - s0) / w1) ** 2;
    if (v > meilleur) {
      meilleur = v;
      seuil = b + 0.5;
    }
  }
  return seuil + BAS;
}

export interface Partage {
  /** Seuil (dB) : une valeur < seuil va au groupe du bas (le creux, puis affiné : affinerSeuil). */
  seuil: number;
  /** Le creux lui-même (dB). */
  creux: number;
  /** Médianes pondérées des deux côtés (dB). */
  bas: number;
  haut: number;
  /** Creux / plus petit sommet (0 = creux vide, 1 = pas de creux). */
  vallee: number;
  /** Part du poids sous le seuil (0 à 1). */
  partBas: number;
  /** Distance (dB) du creux au plus proche des deux sommets. */
  sommetsLoin: number;
}

/**
 * Le meilleur partage en deux des valeurs d'indices `ix` : le creux le plus profond entre deux sommets de
 * l'histogramme lissé (au milieu du creux s'il est plat). null s'il y a moins de 2 valeurs.
 */
export function meilleurPartage(
  x: ArrayLike<number>,
  poids: ArrayLike<number>,
  ix: readonly number[],
  lissage: number = REGLAGES_GROUPES.lissage,
  partMin: number = REGLAGES_GROUPES.partMin,
): Partage | null {
  if (ix.length < 2) return null;
  const h = histogramme(x, poids, ix, lissage);
  // Un creux ne compte que s'il laisse au moins `partMin` du poids de chaque côté (pas les queues presque vides).
  const brut = histogramme(x, poids, ix, 0);
  const cumul = new Float64Array(NB);
  for (let b = 0; b < NB; b++) cumul[b] = (b > 0 ? cumul[b - 1]! : 0) + brut[b]!;
  const W = cumul[NB - 1]!;
  // Plus grand sommet à gauche (inclus) et à droite (inclus) de chaque case.
  const gauche = new Float64Array(NB);
  const droite = new Float64Array(NB);
  for (let b = 0; b < NB; b++) gauche[b] = Math.max(b > 0 ? gauche[b - 1]! : 0, h[b]!);
  for (let b = NB - 1; b >= 0; b--) droite[b] = Math.max(b < NB - 1 ? droite[b + 1]! : 0, h[b]!);
  let ratioMin = Infinity;
  let sommetMin = -1;
  let debut = -1;
  let fin = -1;
  for (let b = 1; b < NB - 1; b++) {
    const s = Math.min(gauche[b]!, droite[b]!);
    if (s <= 0) continue;
    // Poids strictement sous la case b (bas) et à partir d'elle (haut).
    if (cumul[b - 1]! < partMin * W || W - cumul[b - 1]! < partMin * W) continue;
    const ratio = h[b]! / s;
    if (ratio < ratioMin - 1e-12 || (Math.abs(ratio - ratioMin) <= 1e-12 && s > sommetMin + 1e-12)) {
      ratioMin = ratio;
      sommetMin = s;
      debut = b;
      fin = b;
    } else if (Math.abs(ratio - ratioMin) <= 1e-12 && Math.abs(s - sommetMin) <= 1e-12) fin = b;
  }
  // (Plusieurs creux aussi profonds entre les mêmes sommets, ex. un grand vide coupé d'une petite bosse : le milieu.)
  let seuil: number;
  if (debut < 0) seuil = otsu(h);
  else seuil = (debut + fin) / 2 + BAS;
  // Position des deux sommets (le plus haut de chaque côté du creux).
  const v0 = Math.round(seuil - BAS);
  let pg = 0;
  let pd = NB - 1;
  for (let b = 0; b <= v0; b++) if (h[b]! > h[pg]!) pg = b;
  for (let b = NB - 1; b >= v0; b--) if (h[b]! > h[pd]!) pd = b;
  const sommetsLoin = Math.min(v0 - pg, pd - v0);
  const bas: number[] = [];
  const haut: number[] = [];
  for (const i of ix) (x[i]! < seuil ? bas : haut).push(i);
  if (bas.length === 0 || haut.length === 0) {
    // Tout d'un côté (une seule bosse très étroite) : Otsu sur les valeurs brutes.
    seuil = otsu(histogramme(x, poids, ix, 0));
    bas.length = 0;
    haut.length = 0;
    for (const i of ix) (x[i]! < seuil ? bas : haut).push(i);
    if (bas.length === 0 || haut.length === 0) return null;
    ratioMin = 1;
  }
  let pBas = 0;
  let pTout = 0;
  for (const i of ix) {
    const w = Math.max(0, poids[i]!);
    pTout += w;
    if (x[i]! < seuil) pBas += w;
  }
  const med = (l: number[]) => medianePonderee(l.map((i) => x[i]!), l.map((i) => poids[i]!));
  return { seuil, creux: seuil, bas: med(bas), haut: med(haut), vallee: Math.min(1, ratioMin), partBas: pTout > 0 ? pBas / pTout : 0, sommetsLoin };
}

/** Plus petit écart type d'une voix (dB) : le niveau d'une même voix varie toujours d'un morceau à l'autre. */
const ECART_MIN = 1.5;
/** Le seuil affiné ne s'éloigne pas du creux de plus de DEPLACEMENT_MAX dB. */
const DEPLACEMENT_MAX = 3;

/** Écart type « robuste » d'un seul côté de la médiane m (1,4826 × médiane des écarts de ce côté). */
function ecartDuCote(x: ArrayLike<number>, poids: ArrayLike<number>, ix: readonly number[], m: number, dessus: boolean): number {
  const d = ix.filter((i) => (dessus ? x[i]! > m : x[i]! < m));
  if (d.length === 0) return ECART_MIN;
  return Math.max(ECART_MIN, 1.4826 * medianePonderee(d.map((i) => Math.abs(x[i]! - m)), d.map((i) => poids[i]!)));
}

/**
 * Seuil affiné d'un partage : à mi-chemin des médianes des deux côtés en écarts types mesurés du côté du seuil
 * (au-dessus pour la voix faible, en dessous pour la forte ; 1,5 dB au moins), à 3 dB au plus du creux, entre les
 * deux médianes.
 */
export function affinerSeuil(x: ArrayLike<number>, poids: ArrayLike<number>, ix: readonly number[], p: Partage): Partage {
  const bas = ix.filter((i) => x[i]! < p.creux);
  const haut = ix.filter((i) => x[i]! >= p.creux);
  if (bas.length === 0 || haut.length === 0 || !(p.haut > p.bas)) return p;
  const sB = ecartDuCote(x, poids, bas, p.bas, true);
  const sH = ecartDuCote(x, poids, haut, p.haut, false);
  const brut = p.bas + (sB * (p.haut - p.bas)) / (sB + sH);
  const borne = Math.min(p.creux + DEPLACEMENT_MAX, Math.max(p.creux - DEPLACEMENT_MAX, brut));
  const seuil = Math.min(p.haut - 0.5, Math.max(p.bas + 0.5, borne));
  return { ...p, seuil };
}

export interface GroupesNiveau {
  /** Seuils croissants entre les groupes (k − 1 valeurs). */
  seuils: number[];
  /** Médiane pondérée de chaque groupe, du plus FAIBLE au plus fort. */
  medianes: number[];
  /** Le partage en deux le meilleur (même s'il n'a pas suffi pour séparer : sert au « Deux personnes » forcé). */
  premier: Partage | null;
}

/** Groupe d'une valeur selon les seuils (0 = le plus faible). */
export function groupeDe(v: number, seuils: readonly number[]): number {
  let g = 0;
  while (g < seuils.length && v >= seuils[g]!) g++;
  return g;
}

/**
 * Groupes de voix d'après les niveaux des morceaux (poids = durée). 1 groupe = une seule voix au niveau. `forcer` :
 * 1 → un groupe ; 2 → exactement 2 (le meilleur partage, même faible).
 */
export function groupesDeNiveau(niveaux: ArrayLike<number>, poids: ArrayLike<number>, o: Partial<ReglagesGroupes> & { forcer?: 1 | 2 } = {}): GroupesNiveau {
  const r: ReglagesGroupes = { ...REGLAGES_GROUPES, ...o };
  const tous = Array.from({ length: niveaux.length }, (_, i) => i);
  let total = 0;
  for (const i of tous) total += Math.max(0, poids[i]!);
  const medianeDe = (ix: number[]) => medianePonderee(ix.map((i) => niveaux[i]!), ix.map((i) => poids[i]!));
  const premier = meilleurPartage(niveaux, poids, tous, r.lissage);
  if (o.forcer === 1 || !premier) return { seuils: [], medianes: [medianeDe(tous)], premier };
  const accepte = (p: Partage, poidsGroupe: number, enPlus: boolean) =>
    p.haut - p.bas >= r.ecartMinDb &&
    p.sommetsLoin >= r.sommetLoin &&
    p.vallee <= (enPlus ? r.valleeMaxEnPlus : r.valleeMax) &&
    Math.min(p.partBas, 1 - p.partBas) * poidsGroupe >= (enPlus ? r.partMinEnPlus : r.partMin) * total;
  const affine = affinerSeuil(niveaux, poids, tous, premier);
  if (o.forcer === 2) {
    const bas = tous.filter((i) => niveaux[i]! < affine.seuil);
    const haut = tous.filter((i) => niveaux[i]! >= affine.seuil);
    return { seuils: [affine.seuil], medianes: [medianeDe(bas), medianeDe(haut)], premier: affine };
  }
  if (!accepte(premier, total, false)) return { seuils: [], medianes: [medianeDe(tous)], premier: affine };
  // Partages suivants : chaque groupe peut encore se couper (3 voix ou plus), le plus net d'abord.
  const groupes: number[][] = [tous.filter((i) => niveaux[i]! < affine.seuil), tous.filter((i) => niveaux[i]! >= affine.seuil)];
  const seuils = [affine.seuil];
  while (groupes.length < r.voixMax) {
    let meilleur: { g: number; p: Partage } | null = null;
    groupes.forEach((ix, g) => {
      const w = ix.reduce((s, i) => s + Math.max(0, poids[i]!), 0);
      const p = meilleurPartage(niveaux, poids, ix, r.lissage);
      if (p && accepte(p, w, true) && (!meilleur || p.vallee < meilleur.p.vallee)) meilleur = { g, p };
    });
    if (!meilleur) break;
    const { g, p: brut } = meilleur as { g: number; p: Partage };
    const ix = groupes[g]!;
    const p = affinerSeuil(niveaux, poids, ix, brut);
    groupes.splice(g, 1, ix.filter((i) => niveaux[i]! < p.seuil), ix.filter((i) => niveaux[i]! >= p.seuil));
    seuils.push(p.seuil);
    seuils.sort((a, b) => a - b);
  }
  return { seuils, medianes: groupes.map(medianeDe), premier: affine };
}

/* ------------------------------------------------------------------ empreintes neuronales */

/** Produit scalaire (= cosinus pour des vecteurs normés). */
export function cosinus(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na > 0 && nb > 0 ? s / Math.sqrt(na * nb) : 0;
}

/** Vecteur normé (L2) ; un vecteur nul reste nul. */
export function normer(v: ArrayLike<number>): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  const n = Math.sqrt(s);
  const res = new Float32Array(v.length);
  if (n > 0) for (let i = 0; i < v.length; i++) res[i] = v[i]! / n;
  return res;
}

function centre(v: readonly ArrayLike<number>[], ix: readonly number[], dim: number): Float32Array {
  const s = new Float64Array(dim);
  for (const i of ix) for (let d = 0; d < dim; d++) s[d]! += v[i]![d]!;
  return normer(s);
}

/** Petit générateur pseudo-aléatoire (graine fixe : résultats reproductibles). */
function hasardFixe(graine: number): () => number {
  let s = graine >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/**
 * k-moyennes sphériques (cosinus) à k groupes, déterministes : départ « le plus loin d'abord » puis 7 départs à graine
 * fixe, on garde le plus serré (somme des cosinus au centre). null s'il y a moins de k points.
 */
export function kMoyennesCosinus(v: readonly ArrayLike<number>[], k: number, tours = 30): { groupes: Int32Array; centres: Float32Array[] } | null {
  const n = v.length;
  if (n < k || k < 1) return null;
  const dim = v[0]!.length;
  const tous = Array.from({ length: n }, (_, i) => i);
  const essayer = (depart: number[]) => {
    let centres = depart.map((i) => normer(v[i]!));
    const g = new Int32Array(n);
    for (let t = 0; t < tours; t++) {
      let change = t === 0;
      for (let i = 0; i < n; i++) {
        let best = 0;
        let bc = -Infinity;
        for (let c = 0; c < k; c++) {
          const x = cosinus(v[i]!, centres[c]!);
          if (x > bc) [bc, best] = [x, c];
        }
        if (g[i] !== best) {
          change = true;
          g[i] = best;
        }
      }
      centres = centres.map((ancien, c) => {
        const ix = tous.filter((i) => g[i] === c);
        return ix.length > 0 ? centre(v, ix, dim) : ancien;
      });
      if (!change) break;
    }
    let score = 0;
    for (let i = 0; i < n; i++) score += cosinus(v[i]!, centres[g[i]!]!);
    return { groupes: g, centres, score };
  };
  // Départ « le plus loin d'abord » : le point le plus typique, puis chaque fois le moins semblable aux centres pris.
  const moyen = centre(v, tous, dim);
  const loin: number[] = [tous.reduce((m, i) => (cosinus(v[i]!, moyen) > cosinus(v[m]!, moyen) ? i : m), 0)];
  while (loin.length < k) loin.push(tous.reduce((m, i) => (Math.max(...loin.map((c) => cosinus(v[i]!, v[c]!))) < Math.max(...loin.map((c) => cosinus(v[m]!, v[c]!))) ? i : m), 0));
  let meilleur = essayer(loin);
  const r = hasardFixe(7);
  for (let e = 0; e < 7; e++) {
    const depart = new Set<number>();
    while (depart.size < k) depart.add(Math.floor(r() * n));
    const x = essayer([...depart]);
    if (x.score > meilleur.score + 1e-9) meilleur = x;
  }
  return { groupes: meilleur.groupes, centres: meilleur.centres };
}

export interface GroupesEmpreintes {
  /** Groupe de chaque empreinte (0..k−1). */
  groupes: Int32Array;
  centres: Float32Array[];
  /** Plus grand cosinus entre deux centres (null avec un seul groupe : le cosinus du meilleur partage en deux). */
  cosinusCentres: number | null;
}

/**
 * Voix d'après les empreintes : 2 groupes si le cosinus de leurs centres < seuil (0,68), puis chaque groupe peut
 * encore se couper (jusqu'à `voixMax`). `forcer` : 1 → un groupe, 2 → exactement 2.
 */
export function groupesDEmpreintes(v: readonly ArrayLike<number>[], o: { seuil?: number; voixMax?: number; partMin?: number; forcer?: 1 | 2 } = {}): GroupesEmpreintes {
  const seuil = o.seuil ?? CAMPLUS.cosinusDeuxVoix;
  const voixMax = o.voixMax ?? REGLAGES_GROUPES.voixMax;
  const partMin = o.partMin ?? REGLAGES_GROUPES.partMin;
  const n = v.length;
  const dim = v[0]?.length ?? 0;
  const un = (): GroupesEmpreintes => ({ groupes: new Int32Array(n), centres: n > 0 ? [centre(v, Array.from({ length: n }, (_, i) => i), dim)] : [], cosinusCentres: null });
  if (n < 4 || o.forcer === 1) return un();
  const km = kMoyennesCosinus(v, 2);
  if (!km) return un();
  const cos2 = cosinus(km.centres[0]!, km.centres[1]!);
  const taille = (g: Int32Array, c: number) => g.reduce((s, x) => s + (x === c ? 1 : 0), 0);
  if (o.forcer !== 2 && (cos2 >= seuil || Math.min(taille(km.groupes, 0), taille(km.groupes, 1)) < Math.max(2, partMin * n))) return { ...un(), cosinusCentres: cos2 };
  const groupes = Int32Array.from(km.groupes);
  const centres = [...km.centres];
  // Encore un partage ? (jamais quand on force 2 voix)
  while (o.forcer !== 2 && centres.length < voixMax) {
    let meilleur: { c: number; ix: number[]; km: { groupes: Int32Array; centres: Float32Array[] }; cos: number } | null = null;
    for (let c = 0; c < centres.length; c++) {
      const ix = Array.from({ length: n }, (_, i) => i).filter((i) => groupes[i] === c);
      if (ix.length < 8) continue;
      const sous = kMoyennesCosinus(ix.map((i) => v[i]!), 2);
      if (!sous) continue;
      const cos = cosinus(sous.centres[0]!, sous.centres[1]!);
      if (cos >= seuil || Math.min(taille(sous.groupes, 0), taille(sous.groupes, 1)) < Math.max(3, 1.5 * partMin * n)) continue;
      if (!meilleur || cos < meilleur.cos) meilleur = { c, ix, km: sous, cos };
    }
    if (!meilleur) break;
    const nouveau = centres.length;
    meilleur.ix.forEach((i, j) => {
      if (meilleur!.km.groupes[j] === 1) groupes[i] = nouveau;
    });
    centres[meilleur.c] = meilleur.km.centres[0]!;
    centres.push(meilleur.km.centres[1]!);
  }
  let max = -Infinity;
  for (let a = 0; a < centres.length; a++) for (let b = a + 1; b < centres.length; b++) max = Math.max(max, cosinus(centres[a]!, centres[b]!));
  return { groupes, centres, cosinusCentres: Number.isFinite(max) ? max : cos2 };
}
