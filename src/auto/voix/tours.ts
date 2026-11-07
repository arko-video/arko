// C. Qui parle (dev 1), fonctions PURES : des étiquettes de trames (qui parle toutes les 20 ms) aux TOURS DE PAROLE.
// Lissage (médiane sur 0,3 s), petits tours absorbés par leurs voisins, trous < 0,3 s bouchés, tours ≥ 0,4 s,
// tour incertain si moins de 60 % de ses trames sont sûres.

import type { Sec, TourDeParole } from '../../recette/types';

/** Part de trames sûres en dessous de laquelle un tour est incertain. */
export const PART_SURE_TOUR = 0.6;

/** Étiquettes : −1 = personne ne parle, 0..n−1 = la voix. */
export type Etiquettes = Int8Array;

/** Vote majoritaire sur une fenêtre de `largeur` trames, parmi les trames où quelqu'un parle (les autres restent −1). */
export function lisserEtiquettes(e: Etiquettes, largeur: number, voix: number): Etiquettes {
  const demi = Math.max(0, Math.floor(largeur / 2));
  const res = new Int8Array(e.length).fill(-1);
  const comptes = new Int32Array(Math.max(1, voix));
  const ajouter = (k: number, d: number) => {
    const v = e[k]!;
    if (v >= 0) comptes[v]! += d;
  };
  for (let k = 0; k < Math.min(demi, e.length); k++) ajouter(k, 1);
  for (let k = 0; k < e.length; k++) {
    if (k + demi < e.length) ajouter(k + demi, 1);
    if (k - demi - 1 >= 0) ajouter(k - demi - 1, -1);
    if (e[k]! < 0) continue;
    let meilleur = e[k]!;
    for (let v = 0; v < voix; v++) if (comptes[v]! > comptes[meilleur]!) meilleur = v;
    res[k] = meilleur;
  }
  return res;
}

interface Bloc {
  v: number;
  k0: number;
  k1: number;
  /** Trames qui parlent, et trames sûres. */
  parle: number;
  sures: number;
  nettete: number;
}

/**
 * Tours de parole à partir des étiquettes (lissées) : ids `ids[v]`, trames sûres `sure`, netteté par trame (sert à
 * choisir les extraits). Renvoie les tours triés et la netteté moyenne de chacun.
 */
export function construireTours(
  e: Etiquettes,
  sure: Uint8Array,
  nettete: Float32Array,
  pas: Sec,
  ids: readonly string[],
  o: { tourMin: Sec; trouMax: Sec; src?: string },
): { tours: TourDeParole[]; nettetes: number[] } {
  const blocs: Bloc[] = [];
  for (let k = 0; k < e.length; k++) {
    const v = e[k]!;
    if (v < 0) continue;
    const der = blocs[blocs.length - 1];
    if (der && der.v === v && der.k1 === k) {
      der.k1 = k + 1;
      der.parle++;
      der.sures += sure[k]!;
      der.nettete += nettete[k]!;
    } else blocs.push({ v, k0: k, k1: k + 1, parle: 1, sures: sure[k]!, nettete: nettete[k]! });
  }
  const trou = Math.round(o.trouMax / pas);
  const min = Math.round(o.tourMin / pas);
  // 1. Un petit bloc collé entre deux blocs d'une même autre voix lui est rendu (pas de clignotement).
  for (let i = 1; i + 1 < blocs.length; i++) {
    const [a, b, c] = [blocs[i - 1]!, blocs[i]!, blocs[i + 1]!];
    if (b.k1 - b.k0 < min && a.v === c.v && b.k0 - a.k1 <= trou && c.k0 - b.k1 <= trou) b.v = a.v;
  }
  // 2. Blocs d'une même voix séparés de moins de 0,3 s : réunis.
  const unis: Bloc[] = [];
  for (const b of blocs) {
    const der = unis[unis.length - 1];
    if (der && der.v === b.v && b.k0 - der.k1 < trou) {
      der.k1 = b.k1;
      der.parle += b.parle;
      der.sures += b.sures;
      der.nettete += b.nettete;
    } else unis.push({ ...b });
  }
  // 3. Tours de 0,4 s au moins.
  const gardes = unis.filter((b) => b.k1 - b.k0 >= min);
  const arrondi = (x: number) => Math.round(x * 100) / 100;
  return {
    tours: gardes.map((b) => {
      const t: TourDeParole = { ts: arrondi(b.k0 * pas), fin: arrondi(b.k1 * pas), p: ids[b.v]! };
      if (o.src) t.src = o.src;
      if (b.sures / Math.max(1, b.parle) < PART_SURE_TOUR) t.sur = false;
      return t;
    }),
    nettetes: gardes.map((b) => b.nettete / Math.max(1, b.parle)),
  };
}
