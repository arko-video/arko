// Banc réel — outils purs sur les temps : intervalles, grille de 20 ms, plans d'un montage (temps source ↔ sortie),
// bords de plan, niveau de la voix et bruit de fond local. Aucune donnée privée, aucun fichier lu ici.

import { compiler, type Scenario } from '../../../src/recette/chronologie';
import { dureePlan } from '../../../src/recette/temps';
import type { Recette } from '../../../src/recette/types';

/** Un intervalle [début, fin[ en secondes. */
export type Iv = [number, number];

/* ------------------------------------------------------------------ intervalles */

/** Intervalles triés et fusionnés (ceux qui se touchent à `ecart` près sont réunis). */
export function fusionner(liste: readonly Iv[], ecart = 0): Iv[] {
  const tries = liste.filter(([a, b]) => b > a).map(([a, b]): Iv => [a, b]).sort((x, y) => x[0] - y[0]);
  const res: Iv[] = [];
  for (const [a, b] of tries) {
    const der = res[res.length - 1];
    if (der && a <= der[1] + ecart) der[1] = Math.max(der[1], b);
    else res.push([a, b]);
  }
  return res;
}

export function longueur(liste: readonly Iv[]): number {
  let s = 0;
  for (const [a, b] of liste) s += Math.max(0, b - a);
  return s;
}

/** Durée de `w` couverte par une liste FUSIONNÉE (recherche dichotomique). */
export function recouvrement(fusionnee: readonly Iv[], w: Iv): number {
  let bas = 0;
  let haut = fusionnee.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (fusionnee[m]![1] <= w[0]) bas = m + 1;
    else haut = m;
  }
  let s = 0;
  for (let k = bas; k < fusionnee.length && fusionnee[k]![0] < w[1]; k++) {
    const [a, b] = fusionnee[k]!;
    s += Math.max(0, Math.min(b, w[1]) - Math.max(a, w[0]));
  }
  return s;
}

/** Durée d'une liste de fenêtres couverte par une liste fusionnée. */
export function recouvrementTotal(fusionnee: readonly Iv[], fenetres: readonly Iv[]): number {
  let s = 0;
  for (const w of fenetres) s += recouvrement(fusionnee, w);
  return s;
}

/** Intersection de deux listes fusionnées. */
export function intersection(a: readonly Iv[], b: readonly Iv[]): Iv[] {
  const res: Iv[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x0 = Math.max(a[i]![0], b[j]![0]);
    const x1 = Math.min(a[i]![1], b[j]![1]);
    if (x1 > x0) res.push([x0, x1]);
    if (a[i]![1] < b[j]![1]) i++;
    else j++;
  }
  return res;
}

/* ------------------------------------------------------------------ grille */

/** Grille de temps régulière : la case k représente l'instant (k + 0,5) × pas. */
export class Grille {
  readonly n: number;
  constructor(readonly pas: number, readonly duree: number) {
    this.n = Math.max(1, Math.ceil(duree / pas));
  }
  /** Case de l'instant t (bornée). */
  k(t: number): number {
    return Math.max(0, Math.min(this.n - 1, Math.floor(t / this.pas)));
  }
  /** Cases dont le milieu tombe dans [a, b[. */
  cases(a: number, b: number): [number, number] {
    const k0 = Math.max(0, Math.ceil(a / this.pas - 0.5));
    const k1 = Math.min(this.n, Math.ceil(b / this.pas - 0.5));
    return [k0, k1];
  }
  /** Tableau marqué (1) sur les intervalles donnés. */
  marquer(liste: readonly Iv[], tab: Uint8Array = new Uint8Array(this.n), valeur = 1): Uint8Array {
    for (const [a, b] of liste) {
      const [k0, k1] = this.cases(a, b);
      tab.fill(valeur, k0, Math.max(k0, k1));
    }
    return tab;
  }
}

/* ------------------------------------------------------------------ montage */

/** Un plan du montage placé en temps de sortie. `video` : plan de la vidéo principale (pas un élément inséré). */
export interface PlanM {
  i: number;
  video: boolean;
  de: number;
  a: number;
  vit: number;
  t0: number;
  t1: number;
  /** Début de l'arrêt sur image (= t1 sans arrêt). */
  tFige: number;
}

export interface Montage {
  src: string;
  duree: number;
  plans: PlanM[];
  /** Nombre de plans de l'accroche (au début) et fin de l'accroche (temps de sortie). */
  nbAccroche: number;
  finAccroche: number;
  /** Scénario d'Arko (null si la recette n'a pas pu être compilée : plans recalculés à la main). */
  scenario: Scenario | null;
}

const typeTrans = (t: Recette['plans'][number]['trans']): string | null => (t ? (typeof t === 'string' ? t : t.type) : null);

/**
 * Plans de la recette en temps de sortie, par le compilateur d'Arko (le même que l'aperçu et l'export).
 * Accroche : les plans avant le 1er plan qui entre par la transition « glitch » de « Le meilleur d'abord » (dans les
 * 12 premières secondes), sinon `nbAccroche` donné.
 */
export function lireMontage(r: Recette, nbAccroche?: number): Montage {
  const src = r.sources.find((s) => s.type === 'video')?.id ?? '';
  let scenario: Scenario | null = null;
  let plans: PlanM[];
  try {
    scenario = compiler(r);
    plans = scenario.plans.map((p) => ({ i: p.i, video: p.src === src && !p.ins, de: p.de, a: p.a, vit: p.vit, t0: p.t0, t1: p.t1, tFige: p.tFige }));
  } catch {
    let t = 0;
    plans = r.plans.map((p, i) => {
      const d = dureePlan(p);
      const pl: PlanM = { i, video: (p.src ?? src) === src && !p.ins, de: p.de, a: p.a, vit: p.vit ?? 1, t0: t, t1: t + d, tFige: t + d - (p.fige ?? 0) };
      t += d;
      return pl;
    });
  }
  let n = nbAccroche ?? 0;
  if (nbAccroche === undefined) {
    for (let k = 1; k < Math.min(5, r.plans.length); k++) {
      if (typeTrans(r.plans[k]!.trans) === 'glitch' && plans[k]!.t0 <= 12) {
        n = k;
        break;
      }
    }
  }
  const duree = plans.length ? plans[plans.length - 1]!.t1 : 0;
  return { src, duree, plans, nbAccroche: n, finAccroche: n > 0 ? plans[n - 1]!.t1 : 0, scenario };
}

/** Plan affiché au temps de sortie t (null hors vidéo). */
export function planA(m: Montage, t: number): PlanM | null {
  const ps = m.plans;
  if (ps.length === 0 || t < 0 || t > m.duree + 1e-9) return null;
  let bas = 0;
  let haut = ps.length - 1;
  while (bas < haut) {
    const k = (bas + haut) >> 1;
    if (ps[k]!.t1 > t + 1e-9) haut = k;
    else bas = k + 1;
  }
  return ps[bas]!;
}

/** Temps source montré au temps de sortie t (null : élément inséré, arrêt sur image ou hors vidéo). */
export function sourceA(m: Montage, t: number): number | null {
  const p = planA(m, t);
  if (!p || !p.video || t >= p.tFige - 1e-9) return null;
  return Math.min(p.a, p.de + (t - p.t0) * p.vit);
}

/** Temps de sortie où passe la fenêtre source w (un passage réutilisé, comme l'accroche, donne plusieurs morceaux). */
export function versSortie(m: Montage, w: Iv, depuis = 0): Iv[] {
  const res: Iv[] = [];
  for (let k = depuis; k < m.plans.length; k++) {
    const p = m.plans[k]!;
    if (!p.video) continue;
    const o0 = Math.max(w[0], p.de);
    const o1 = Math.min(w[1], p.a);
    if (o1 <= o0) continue;
    const t0 = p.t0 + (o0 - p.de) / p.vit;
    const t1 = Math.min(p.tFige, p.t0 + (o1 - p.de) / p.vit);
    if (t1 > t0) res.push([t0, t1]);
  }
  return res;
}

/** Fenêtres source montrées pendant la fenêtre de sortie w. */
export function versSource(m: Montage, w: Iv): Iv[] {
  const res: Iv[] = [];
  for (const p of m.plans) {
    if (!p.video || p.t1 <= w[0] || p.t0 >= w[1]) continue;
    const t0 = Math.max(w[0], p.t0);
    const t1 = Math.min(w[1], p.tFige);
    if (t1 <= t0) continue;
    res.push([p.de + (t0 - p.t0) * p.vit, Math.min(p.a, p.de + (t1 - p.t0) * p.vit)]);
  }
  return res;
}

/** Plages source gardées (fusionnées) par les plans vidéo, de l'indice `depuis` à la fin. */
export function plagesGardees(m: Montage, depuis = 0): Iv[] {
  return fusionner(m.plans.slice(depuis).filter((p) => p.video).map((p): Iv => [p.de, p.a]));
}

/** Un bord de plan qui est une vraie coupe (la source ne continue pas de l'autre côté). */
export interface Bord {
  plan: number;
  cote: 'debut' | 'fin';
  /** Temps source et temps de sortie du bord. */
  ts: number;
  t: number;
}

/** Bords de coupe des plans vidéo : deux plans qui se suivent dans la source (même vitesse, sans arrêt) n'en font pas. */
export function bordsDeCoupe(m: Montage): Bord[] {
  const res: Bord[] = [];
  const ps = m.plans;
  const continu = (x: PlanM | undefined, y: PlanM | undefined) =>
    !!x && !!y && x.video && y.video && Math.abs(x.a - y.de) < 0.005 && x.vit === y.vit && x.tFige >= x.t1 - 1e-9;
  ps.forEach((p, k) => {
    if (!p.video) return;
    if (!continu(ps[k - 1], p)) res.push({ plan: k, cote: 'debut', ts: p.de, t: p.t0 });
    if (!continu(p, ps[k + 1])) res.push({ plan: k, cote: 'fin', ts: p.a, t: p.tFige });
  });
  return res;
}

/* ------------------------------------------------------------------ mots */

/** Mots en intervalles source triés par début. Accepte [txt, de, a] ou { ts|de|debut, fin|a }. Le texte n'est jamais gardé. */
export function intervallesMots(brut: unknown): Iv[] {
  const liste = Array.isArray(brut)
    ? brut
    : brut && typeof brut === 'object' && Array.isArray((brut as { mots?: unknown }).mots)
      ? ((brut as { mots: unknown[] }).mots)
      : [];
  const res: Iv[] = [];
  for (const m of liste) {
    let a: unknown;
    let b: unknown;
    if (Array.isArray(m)) [, a, b] = m;
    else if (m && typeof m === 'object') {
      const o = m as Record<string, unknown>;
      a = o.ts ?? o.de ?? o.debut ?? o.start;
      b = o.fin ?? o.a ?? o.end;
    }
    if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b) && b >= a) res.push([a, b]);
  }
  return res.sort((x, y) => x[0] - y[0]);
}

/** true si t tombe STRICTEMENT dans un mot, à `tol` près de ses bords (mots triés par début, plus courts que 10 s). */
export function dansUnMot(mots: readonly Iv[], t: number, tol: number): boolean {
  let bas = 0;
  let haut = mots.length;
  while (bas < haut) {
    const k = (bas + haut) >> 1;
    if (mots[k]![0] < t - tol) bas = k + 1;
    else haut = k;
  }
  for (let k = bas - 1; k >= 0; k--) {
    const [a, b] = mots[k]!;
    if (a < t - 10) break;
    if (a + tol < t && t < b - tol) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ niveau de la voix */

/** Niveau de la voix (dBFS) toutes les `pas` secondes, en temps source (activite.json du banc). */
export interface Activite {
  pas: number;
  db: ArrayLike<number>;
}

/** Niveau lisible (−100 pour un trou ou une valeur absurde). */
const dbA = (act: Activite, k: number): number => {
  const v = act.db[k];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(-100, v) : -100;
};

/**
 * Bruit de fond local par seconde : le centile `centile` (défaut 10 %) du niveau sur ± `fenetre` s autour.
 * Renvoie un niveau par bloc de 1 s.
 */
export function bruitDeFond(act: Activite, fenetre = 5, centile = 0.1): Float32Array {
  const parBloc = Math.max(1, Math.round(1 / act.pas));
  const n = act.db.length;
  const nb = Math.ceil(n / parBloc);
  const res = new Float32Array(nb);
  const tampon = new Float32Array((2 * fenetre + 1) * parBloc);
  for (let b = 0; b < nb; b++) {
    const k0 = Math.max(0, (b - fenetre) * parBloc);
    const k1 = Math.min(n, (b + fenetre + 1) * parBloc);
    const m = k1 - k0;
    for (let k = 0; k < m; k++) tampon[k] = dbA(act, k0 + k);
    const vue = tampon.subarray(0, m).sort();
    res[b] = vue[Math.min(m - 1, Math.floor(centile * m))] ?? -100;
  }
  return res;
}

/** Niveau le plus fort entre ts − f et ts + f, et bruit de fond local à ts. */
export function niveauAutour(act: Activite, bruit: Float32Array, ts: number, f: number): { max: number; fond: number } {
  const k0 = Math.max(0, Math.floor((ts - f) / act.pas));
  const k1 = Math.min(act.db.length - 1, Math.floor((ts + f) / act.pas));
  let max = -100;
  for (let k = k0; k <= k1; k++) max = Math.max(max, dbA(act, k));
  const parBloc = Math.max(1, Math.round(1 / act.pas));
  const b = Math.max(0, Math.min(bruit.length - 1, Math.floor(ts / act.pas / parBloc)));
  return { max, fond: bruit[b] ?? -100 };
}

/**
 * Cases de la grille (temps source) où la voix (ou un son fort) dépasse le bruit de fond local de `marge` dB ET le
 * niveau absolu `min` (dBFS) : le son de la session est souvent un silence numérique (−100 dB), où « fond + 10 dB »
 * ne voudrait rien dire.
 */
export function activiteForte(act: Activite, bruit: Float32Array, g: Grille, marge: number, min = -100): Uint8Array {
  const tab = new Uint8Array(g.n);
  const parBloc = Math.max(1, Math.round(1 / act.pas));
  for (let k = 0; k < g.n; k++) {
    const t = (k + 0.5) * g.pas;
    const j = Math.floor(t / act.pas);
    if (j >= act.db.length) break;
    const b = Math.min(bruit.length - 1, Math.floor(j / parBloc));
    if (dbA(act, j) >= Math.max(min, (bruit[b] ?? -100) + marge)) tab[k] = 1;
  }
  return tab;
}

/**
 * Coupe « pendant la voix forte » : de CHAQUE côté du bord (ts − f → ts et ts → ts + f), le niveau le plus fort atteint
 * au moins max(bruit de fond local + marge, min). Un son qui s'arrête pile à la coupe ne compte pas ; un son qui
 * continue de part et d'autre (la coupe le tranche) compte.
 */
export function voixDesDeuxCotes(act: Activite, bruit: Float32Array, ts: number, f: number, marge: number, min: number): { avant: number; apres: number; seuil: number; forte: boolean } {
  const maxEntre = (a: number, b: number) => {
    const k0 = Math.max(0, Math.round(a / act.pas));
    const k1 = Math.min(act.db.length, Math.max(k0 + 1, Math.round(b / act.pas)));
    let m = -100;
    for (let k = k0; k < k1; k++) m = Math.max(m, dbA(act, k));
    return m;
  };
  const avant = maxEntre(ts - f, ts);
  const apres = maxEntre(ts, ts + f);
  const parBloc = Math.max(1, Math.round(1 / act.pas));
  const b = Math.max(0, Math.min(bruit.length - 1, Math.floor(ts / act.pas / parBloc)));
  const seuil = Math.max(min, (bruit[b] ?? -100) + marge);
  return { avant, apres, seuil, forte: avant >= seuil && apres >= seuil };
}

/** Médiane d'une liste de nombres (null si vide). */
export function mediane(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
