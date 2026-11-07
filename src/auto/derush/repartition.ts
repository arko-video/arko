// Séquences du Best-of v4 (dev-scenes), fonctions PURES : RÉPARTIR le choix sur toute la session. Blocs de 20 min
// de son ACTIF (sans les passages muets), rang centile de chaque histoire, quota par bloc au prorata de la parole
// (la moitié des places), puis le reste par note brute jusqu'à la durée visée (± 5 %). Départage : note brute, force
// du cœur… jamais l'ordre chronologique. Contrat : CONTRAT.md §1.6.

import type { Sec } from '../../recette/types';
import type { PlageTemps } from '../types';
import { meilleureDAbord, type Histoire } from './histoires';

export const REGLES_CHOIX = {
  /** Un bloc = 20 min de son actif ; un dernier bloc de moins de 10 min est rattaché au précédent. */
  bloc: 1200,
  dernierBlocMin: 600,
  /** Une séquence garde ≈ 55 s : N ≈ durée visée / 55 s. */
  gardeParSequence: 55,
  /** Durée visée tenue à ± 5 %. */
  tolerance: 0.05,
  /** Un bloc a droit à son quota dès qu'une de ses histoires a un centile ≥ 30. */
  centileQuota: 30,
  /**
   * Places données d'office à un bloc : quota = max(1, arrondi(N × part de la parole du bloc × ½)) ; le reste va aux
   * meilleures notes de toute la session (un bloc plein d'histoires fortes en a plus). Avec la part entière (×1), les
   * quotas prennent déjà toutes les places et la note ne choisit plus rien (mesuré : un peu moins bien).
   */
  partQuota: 0.5,
  /** « Passages pas retenus » : histoires non choisies de centile ≥ 30, 100 au plus. */
  centilePassage: 30,
  passagesMax: 100,
} as const;

export interface Blocs {
  /** Bloc du temps t (−1 dans un passage muet ou hors de la source). */
  blocDe(t: Sec): number;
  nombre: number;
  /** Temps de parole de chaque bloc (s). */
  parole: number[];
}

/** Les blocs de 20 min de son actif (sans les muets) et la parole de chacun. */
export function blocsActifs(duree: Sec, muets: readonly PlageTemps[], paroles: readonly PlageTemps[], bloc: Sec = REGLES_CHOIX.bloc): Blocs {
  const m = [...muets].filter((x) => x.a > x.de).sort((x, y) => x.de - y.de);
  const actif = (t: Sec) => {
    let x = t;
    for (const z of m) {
      if (z.de >= t) break;
      x -= Math.min(t, z.a) - z.de;
    }
    return x;
  };
  const dansMuet = (t: Sec) => m.some((z) => t >= z.de && t < z.a);
  const total = actif(duree);
  let nombre = Math.max(1, Math.ceil(total / bloc - 1e-9));
  if (nombre > 1 && total - (nombre - 1) * bloc < REGLES_CHOIX.dernierBlocMin) nombre--;
  const blocDe = (t: Sec) => (t < 0 || t > duree || dansMuet(t) ? -1 : Math.min(nombre - 1, Math.floor(actif(t) / bloc)));
  const parole = new Array<number>(nombre).fill(0);
  for (const p of paroles) {
    const b = blocDe((p.de + p.a) / 2);
    if (b >= 0) parole[b]! += p.a - p.de;
  }
  return { blocDe, nombre, parole };
}

/** Rang centile (0 à 100) de chaque note dans la session : la meilleure = 100, la moins bonne = 0. */
export function centiles(notes: readonly number[]): number[] {
  const n = notes.length;
  if (n <= 1) return notes.map(() => 100);
  return notes.map((x) => {
    let dessous = 0;
    let egales = 0;
    for (const y of notes) {
      if (y < x) dessous++;
      else if (y === x) egales++;
    }
    return Math.round((100 * (dessous + (egales - 1) / 2)) / (n - 1));
  });
}

/** Quota d'histoires par bloc : au prorata de la parole, au moins 1 dès qu'une histoire du bloc a un centile ≥ 30. */
export function quotas(n: number, blocs: Blocs, meilleurCentile: readonly number[], meilleureNote: readonly number[]): number[] {
  const R = REGLES_CHOIX;
  const totalParole = blocs.parole.reduce((t, x) => t + x, 0);
  const q = blocs.parole.map((p, b) => {
    if ((meilleurCentile[b] ?? -1) < R.centileQuota) return 0;
    return Math.max(1, Math.round(n * (totalParole > 0 ? p / totalParole : 1 / blocs.nombre) * R.partQuota));
  });
  // Trop de places : on retire d'abord aux blocs les plus servis (par rapport à leur part), puis aux blocs à 1 place
  // dont la meilleure note est la plus basse.
  let somme = q.reduce((t, x) => t + x, 0);
  while (somme > n) {
    let pire = -1;
    let exces = -Infinity;
    q.forEach((x, b) => {
      if (x <= 1) return;
      const e = x - (n * blocs.parole[b]!) / Math.max(1e-9, totalParole);
      if (e > exces) {
        exces = e;
        pire = b;
      }
    });
    if (pire < 0) {
      q.forEach((x, b) => {
        if (x === 1 && (pire < 0 || meilleureNote[b]! < meilleureNote[pire]!)) pire = b;
      });
    }
    if (pire < 0) break;
    q[pire]!--;
    somme--;
  }
  return q;
}

/**
 * Choisit les histoires (indices dans `h`) : le quota de chaque bloc (ses meilleures notes), puis les meilleures
 * notes de la session jusqu'à la durée visée (± 5 %) ; si c'est trop long, les moins bien notées sautent (en gardant
 * au moins une histoire par bloc tant que possible).
 */
export function choisirHistoires(h: readonly Histoire[], blocs: Blocs, centile: readonly number[], dureeVisee: Sec): Set<number> {
  const R = REGLES_CHOIX;
  const garde = new Set<number>();
  if (h.length === 0) return garde;
  const n = Math.max(1, Math.round(dureeVisee / R.gardeParSequence));
  const bloc = h.map((x) => blocs.blocDe((x.coeur.de + x.coeur.a) / 2) >= 0 ? blocs.blocDe((x.coeur.de + x.coeur.a) / 2) : blocs.blocDe((x.de + x.a) / 2));
  const ordre = h.map((_, i) => i).sort((x, y) => meilleureDAbord(h[x]!, h[y]!));
  const meilleurCentile = new Array<number>(blocs.nombre).fill(-1);
  const meilleureNote = new Array<number>(blocs.nombre).fill(-Infinity);
  h.forEach((x, i) => {
    const b = bloc[i]!;
    if (b < 0) return;
    meilleurCentile[b] = Math.max(meilleurCentile[b]!, centile[i]!);
    meilleureNote[b] = Math.max(meilleureNote[b]!, x.noteBrute);
  });
  const q = quotas(n, blocs, meilleurCentile, meilleureNote);
  const haut = dureeVisee * (1 + R.tolerance);
  const bas = dureeVisee * (1 - R.tolerance);
  let total = 0;
  const pris = new Array<number>(blocs.nombre).fill(0);
  // 1. Les quotas, bloc par bloc (les mieux notées de chaque bloc).
  for (const i of ordre) {
    const b = bloc[i]!;
    if (b < 0 || pris[b]! >= q[b]!) continue;
    if (h[i]!.garde <= 0) continue;
    garde.add(i);
    pris[b]!++;
    total += h[i]!.garde;
  }
  // 2. Trop long : les moins bien notées sautent (d'abord dans les blocs qui en ont plusieurs).
  const parNoteCroissante = () => [...garde].sort((x, y) => meilleureDAbord(h[y]!, h[x]!));
  while (total > haut && garde.size > 1) {
    const l = parNoteCroissante();
    const i = l.find((j) => pris[bloc[j]!]! > 1) ?? l[0]!;
    garde.delete(i);
    pris[bloc[i]!]!--;
    total -= h[i]!.garde;
  }
  // 3. Le reste par note brute, jusqu'à la durée visée.
  for (const i of ordre) {
    if (total >= bas) break;
    if (garde.has(i) || bloc[i]! < 0 || h[i]!.garde <= 0) continue;
    if (total > 0 && total + h[i]!.garde > haut) continue;
    garde.add(i);
    total += h[i]!.garde;
  }
  return garde;
}
