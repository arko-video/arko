// Séquences du Best-of v4 (dev-scenes), fonctions PURES : les HISTOIRES candidates. Une histoire = la mise en place
// (début de l'échange qui précède le moment, au début d'une phrase, 8 à 30 s avant), le moment fort (le « cœur »),
// la réaction et la chute (fin de la phrase qui suit la réaction, + 1 s, 3 à 20 s après), complétée phrase par phrase
// jusqu'à ≈ 60 s gardées (30 à 120 s de source). Note BRUTE sans plafond : Σ force des moments (le cœur compte double)
// + 0,3 par punchline possible + 0,2 par échange rapide (si les voix sont sûres) + 0,02 par mot écrit (sans texte :
// 1,5 par minute de parole), divisée par √(minutes gardées). Contrat : CONTRAT.md §1.6.
// Les bornes tombent toujours dans une pause entre deux « paroles » (mots ∪ segments de la VAD) : jamais au milieu d'un
// mot ni d'un segment de parole, même quand Whisper a raté la voix faible.

import type { Mot, Sec } from '../../recette/types';
import { motsDans } from '../express/scenes';
import { trouverPunchlines } from '../habillage/punchlines';
import type { PlageTemps } from '../types';
import type { EntreeSequences, GenreMoment, MomentV4 } from '../types-v4';
import { echangesRapides } from './notation';

/** Règles chiffrées des histoires (secondes). */
export const REGLES_HISTOIRES = {
  /** Mise en place : 8 à 30 s avant le cœur ; on remonte l'échange tant que les trous font moins de 2,5 s. */
  miseEnPlace: { min: 8, max: 30 },
  trouEchange: 2.5,
  /** Chute : fin de la phrase après la réaction, + 1 s (dans la pause), entre 3 et 20 s après le cœur. */
  chute: { min: 3, max: 20, apres: 1 },
  /** Une réaction (rire, cri, exclamation…) qui commence moins de 3 s après la fin du cœur le prolonge. */
  reaction: 3,
  /** Trou entre deux paroles qui finit une phrase (comme contexte.ts). */
  trouPhrase: 0.6,
  /** Source d'une histoire (s) et durée gardée après coupes (s) : min, visée, max. */
  source: { min: 30, cible: 85, max: 120 },
  garde: { min: 15, cible: 60, max: 90 },
  /** Pour compléter une histoire, on franchit au plus un trou de 6 s (12 s tant qu'elle fait moins de 30 s). */
  trouCompleter: 6,
  /** Moments qui font un cœur : force ≥ 0,5, et les 3 meilleurs de chaque bloc. */
  forceCoeur: 0.5,
  coeursParBloc: 3,
  /**
   * Histoires « de parole » en plus : cœur au milieu de chaque échange d'au moins 3 s de parole (sans moment). Sans
   * elles, quand les moments sont rares (mode voix, voix faible), il n'y a pas assez d'histoires pour la durée visée.
   */
  paroleEchangeMin: 3,
  /** Note brute : points par punchline possible, par échange rapide (voix sûres à 80 %), par mot écrit. */
  pointsPunchline: 0.3,
  pointsEchange: 0.2,
  voixSures: 0.8,
  pointsMot: 0.02,
  /** Sans aucun mot écrit (mode voix) : points par minute de parole à la place des mots (≈ 0,02 × 75 mots/min). */
  pointsParoleSansTexte: 1.5,
  /** Minutes gardées au dénominateur : au moins 0,25 (une histoire très courte n'explose pas la note). */
  minutesMin: 0.25,
  /** Fusion : recouvrement > 30 % de la plus courte → la mieux notée ; écart < 5 s → fusionnées si ≤ 120 s. */
  recouvrementMax: 0.3,
  ecartFusion: 5,
} as const;

/** Une histoire candidate (temps source). */
export interface Histoire extends PlageTemps {
  /** Première et dernière parole (indices dans les paroles de la source). */
  i0: number;
  i1: number;
  coeur: PlageTemps;
  /** Indice (dans e.moments) du moment au cœur, −1 si aucun (histoire de parole). */
  iCoeur: number;
  /** Force du moment au cœur (départage). */
  forceCoeur: number;
  /** Indices (dans e.moments) des moments dont le sommet est dans l'histoire. */
  moments: number[];
  /** Durée gardée après coupes (e.dureeDe), s. */
  garde: Sec;
  /** Temps de parole (mots ∪ segments) dans l'histoire, s. */
  parole: Sec;
  punchlines: number;
  echanges: number;
  noteBrute: number;
}

/** Ce qui définit une histoire avant sa note. */
export type BaseHistoire = Pick<Histoire, 'i0' | 'i1' | 'coeur' | 'iCoeur' | 'forceCoeur'>;

const r2 = (x: number) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ paroles (mots ∪ segments) */

/**
 * Les mots fiables : sans les « piles » de Whisper (≥ 3 mots qui commencent dans les mêmes 0,05 s) ni les mots de
 * 0,03 s ou moins (des inventions posées sur le bruit du jeu). Les mots propres de la v4 (dev-mots) n'en ont déjà
 * plus ; les mots bruts d'avant en ont près de la moitié : on ne les compte pas. Triés par début.
 */
export function motsFiables(mots: readonly Mot[]): Mot[] {
  const debuts = mots.filter((m) => Number.isFinite(m[1])).map((m) => m[1]).sort((x, y) => x - y);
  // Nombre de mots qui commencent à ± 0,05 s de t (dichotomie sur les débuts triés).
  const voisins = (t: Sec) => {
    let bas = 0;
    let haut = debuts.length;
    while (bas < haut) {
      const m = (bas + haut) >> 1;
      if (debuts[m]! < t - 0.05) bas = m + 1;
      else haut = m;
    }
    let n = 0;
    for (let k = bas; k < debuts.length && debuts[k]! <= t + 0.05; k++) n++;
    return n;
  };
  return mots.filter((m) => Number.isFinite(m[2]) && m[2] - m[1] > 0.03 && voisins(m[1]) < 3).sort((x, y) => x[1] - y[1]);
}

/**
 * Les « paroles » de la source : mots fiables (avec ou sans texte) ∪ segments de parole, fusionnés quand ils se
 * touchent, triés. Sans aucune parole, les moments eux-mêmes (une vidéo sans voix a encore ses sons forts).
 */
export function paroles(e: Pick<EntreeSequences, 'mots' | 'parole' | 'moments'>): PlageTemps[] {
  const tous: PlageTemps[] = [];
  for (const m of motsFiables(e.mots)) tous.push({ de: m[1], a: m[2] });
  for (const s of e.parole.segments) if (s.a > s.de) tous.push({ de: s.de, a: s.a });
  if (tous.length === 0) for (const m of e.moments) if (m.a > m.de) tous.push({ de: m.de, a: m.a });
  tous.sort((x, y) => x.de - y.de);
  const res: PlageTemps[] = [];
  for (const p of tous) {
    const der = res[res.length - 1];
    if (der && p.de <= der.a) der.a = Math.max(der.a, p.a);
    else res.push({ de: p.de, a: p.a });
  }
  return res;
}

/** Dernier indice i tel que u[i].de ≤ t (−1 si aucun). Dichotomie. */
export function indiceAvant(u: readonly PlageTemps[], t: Sec): number {
  let bas = 0;
  let haut = u.length - 1;
  let res = -1;
  while (bas <= haut) {
    const m = (bas + haut) >> 1;
    if (u[m]!.de <= t) {
      res = m;
      bas = m + 1;
    } else haut = m - 1;
  }
  return res;
}

/** Borne de début juste avant la parole i : dans la pause qui la précède (0,3 s au plus, la moitié de la pause). */
export function bordAvant(u: readonly PlageTemps[], i: number): Sec {
  const p = u[i]!;
  const trou = i > 0 ? p.de - u[i - 1]!.a : Infinity;
  return r2(Math.max(0, p.de - Math.min(0.3, trou / 2)));
}

/** Borne de fin juste après la parole i : dans la pause qui la suit (`apres` s au plus, la moitié de la pause). */
export function bordApres(u: readonly PlageTemps[], i: number, apres: Sec, fin: Sec): Sec {
  const p = u[i]!;
  const trou = i + 1 < u.length ? u[i + 1]!.de - p.a : Infinity;
  return r2(Math.min(fin, p.a + Math.min(apres, trou / 2)));
}

/** Plage d'une histoire entre les paroles i0 et i1 (bornes dans les pauses). */
export function plageEntre(u: readonly PlageTemps[], i0: number, i1: number, duree: Sec): PlageTemps {
  return { de: bordAvant(u, i0), a: bordApres(u, i1, REGLES_HISTOIRES.chute.apres, duree) };
}

/** Indice de la 1ʳᵉ parole de la phrase qui contient la parole i (trous ≤ 0,6 s). */
export function debutPhrase(u: readonly PlageTemps[], i: number): number {
  let k = i;
  while (k > 0 && u[k]!.de - u[k - 1]!.a <= REGLES_HISTOIRES.trouPhrase) k--;
  return k;
}

/** Indice de la dernière parole de la phrase qui contient la parole i. */
export function finPhrase(u: readonly PlageTemps[], i: number): number {
  let k = i;
  while (k + 1 < u.length && u[k + 1]!.de - u[k]!.a <= REGLES_HISTOIRES.trouPhrase) k++;
  return k;
}

/** Les paroles [i0, i1] d'une plage (la 1ʳᵉ qui commence dedans, la dernière qui finit dedans) ; null si aucune. */
export function paroleDeLaPlage(u: readonly PlageTemps[], p: PlageTemps): [number, number] | null {
  let i0 = Math.max(0, indiceAvant(u, p.de - 1e-6));
  while (i0 < u.length && u[i0]!.de < p.de - 1e-6) i0++;
  const i1 = indiceAvant(u, p.a + 1e-6);
  let j = i1;
  while (j >= i0 && u[j]!.a > p.a + 1e-6) j--;
  return i0 < u.length && j >= i0 ? [i0, j] : null;
}

/* ------------------------------------------------------------------ une histoire autour d'un cœur */

/**
 * Début de la mise en place d'un cœur qui commence à `t0` (indice de parole) : début de l'échange (on remonte de
 * parole en parole tant que les trous font moins de 2,5 s), au plus 30 s avant ; s'il commence moins de 8 s avant
 * (longue pause juste avant), le début de la phrase qui contient t0 − 8 s.
 */
export function debutMiseEnPlace(u: readonly PlageTemps[], t0: Sec): number {
  const R = REGLES_HISTOIRES;
  const k0 = indiceAvant(u, t0);
  if (k0 < 0) return 0;
  let k = k0;
  while (k > 0 && u[k]!.de - u[k - 1]!.a < R.trouEchange && u[k - 1]!.de >= t0 - R.miseEnPlace.max) k--;
  if (u[k]!.de > t0 - R.miseEnPlace.min) {
    let j = indiceAvant(u, t0 - R.miseEnPlace.min);
    if (j >= 0) {
      j = debutPhrase(u, j);
      while (j < k && u[j]!.de < t0 - R.miseEnPlace.max) j++;
      k = Math.min(k, j);
    }
  }
  return k;
}

const REACTIONS: ReadonlySet<GenreMoment> = new Set(['rire', 'fouRire', 'cri', 'exclamation', 'phraseForte', 'juron']);

/** Fin de la réaction : le cœur, prolongé par les rires / cris / exclamations qui commencent moins de 3 s après. */
export function finReaction(coeur: PlageTemps, moments: readonly MomentV4[]): Sec {
  const R = REGLES_HISTOIRES;
  let fin = coeur.a;
  for (const m of [...moments].filter((x) => x.de >= coeur.de && REACTIONS.has(x.genre)).sort((x, y) => x.de - y.de)) {
    if (m.de > fin + R.reaction) break;
    fin = Math.max(fin, m.a);
  }
  return Math.min(fin, coeur.a + R.chute.max);
}

/**
 * Fin de la chute (indice de parole) : la fin de la phrase en cours à la fin de la réaction (au moins 2 s après le
 * cœur ; la borne ajoute ensuite 1 s dans la pause), au plus 20 s après le cœur.
 */
export function finChute(u: readonly PlageTemps[], coeur: PlageTemps, reaction: Sec): number {
  const R = REGLES_HISTOIRES;
  const t = Math.max(reaction, coeur.a + R.chute.min - R.chute.apres);
  let k = indiceAvant(u, t);
  if (k < 0) return 0;
  k = finPhrase(u, k);
  while (k > 0 && u[k]!.a > coeur.a + R.chute.max) k--;
  return k;
}

/**
 * Complète l'histoire [i0, i1] phrase par phrase (le côté au plus petit trou d'abord) tant qu'elle garde moins de
 * `cible` s (≈ 60), qu'elle reste sous 85 s de source et que le trou franchi fait au plus 6 s ; une histoire de moins de
 * 30 s de source peut aller jusqu'à 120 s et franchir 12 s.
 */
export function completer(u: readonly PlageTemps[], i0: number, i1: number, e: Pick<EntreeSequences, 'dureeDe' | 'duree'>, cible: Sec = REGLES_HISTOIRES.garde.cible): [number, number] {
  const R = REGLES_HISTOIRES;
  let a = i0;
  let b = i1;
  for (let tour = 0; tour < 500; tour++) {
    const p = plageEntre(u, a, b, e.duree);
    const source = p.a - p.de;
    if (source >= R.source.min && e.dureeDe([p]) >= cible) break;
    const court = source < R.source.min;
    const plafond = court ? R.source.max : R.source.cible;
    const trouMax = court ? 2 * R.trouCompleter : R.trouCompleter;
    const trouAvant = a > 0 ? u[a]!.de - u[a - 1]!.a : Infinity;
    const trouApres = b + 1 < u.length ? u[b + 1]!.de - u[b]!.a : Infinity;
    const essais: ['avant' | 'apres', number][] = trouAvant <= trouApres ? [['avant', trouAvant], ['apres', trouApres]] : [['apres', trouApres], ['avant', trouAvant]];
    let pris = false;
    for (const [cote, trou] of essais) {
      if (trou > trouMax) continue;
      const na = cote === 'avant' ? debutPhrase(u, a - 1) : a;
      const nb = cote === 'apres' ? finPhrase(u, b + 1) : b;
      const q = plageEntre(u, na, nb, e.duree);
      if (q.a - q.de > plafond) continue;
      a = na;
      b = nb;
      pris = true;
      break;
    }
    if (!pris) break;
  }
  return [a, b];
}

/* ------------------------------------------------------------------ note */

/** Moments dont le sommet est dans la plage (indices dans `moments`). */
export function momentsDans(moments: readonly MomentV4[], p: PlageTemps): number[] {
  const res: number[] = [];
  moments.forEach((m, i) => {
    if (m.t >= p.de && m.t < p.a) res.push(i);
  });
  return res;
}

/** Temps de parole (s) des paroles dans la plage. */
export function paroleDans(u: readonly PlageTemps[], p: PlageTemps): Sec {
  let t = 0;
  for (let i = Math.max(0, indiceAvant(u, p.de)); i < u.length && u[i]!.de < p.a; i++) t += Math.max(0, Math.min(p.a, u[i]!.a) - Math.max(p.de, u[i]!.de));
  return t;
}

const texteConnu = new WeakMap<readonly Mot[], boolean>();

/** La source a-t-elle des mots écrits (mode mots) ? Gardé en mémoire par liste de mots. */
function avecTexteDans(e: Pick<EntreeSequences, 'mots'>): boolean {
  let x = texteConnu.get(e.mots);
  if (x === undefined) {
    x = e.mots.some((m) => m[0].trim());
    texteConnu.set(e.mots, x);
  }
  return x;
}

/** Les voix sont-elles assez sûres pour compter les échanges (2 voix ou plus, sûres à 80 %) ? */
export function voixSures(e: Pick<EntreeSequences, 'voix'>): boolean {
  return !!e.voix && e.voix.voix.length >= 2 && e.voix.sure >= REGLES_HISTOIRES.voixSures;
}

/**
 * Note brute d'une histoire (sans plafond) : Σ force des moments (celui du cœur compte double) + 0,3 par punchline
 * possible + 0,2 par échange rapide (voix sûres) + 0,02 par mot écrit, divisée par √(minutes gardées).
 */
export function noterHistoire(h: BaseHistoire, e: EntreeSequences, u: readonly PlageTemps[]): Histoire {
  const R = REGLES_HISTOIRES;
  const p = plageEntre(u, h.i0, h.i1, e.duree);
  const moments = momentsDans(e.moments, p);
  let points = moments.reduce((t, i) => t + e.moments[i]!.force, 0);
  if (h.iCoeur >= 0 && moments.includes(h.iCoeur)) points += e.moments[h.iCoeur]!.force;
  const avecTexte: Mot[] = motsFiables(motsDans(e.mots, p)).filter((m) => m[0].trim());
  const punchlines = avecTexte.length > 0 ? trouverPunchlines(avecTexte, e.signaux).length : 0;
  const echanges = voixSures(e) ? echangesRapides(e.voix!.tours, p) : 0;
  points += R.pointsPunchline * punchlines + R.pointsEchange * echanges + R.pointsMot * avecTexte.length;
  const parole = paroleDans(u, p);
  if (!avecTexteDans(e)) points += (R.pointsParoleSansTexte * parole) / 60;
  const garde = e.dureeDe([p]);
  const minutes = Math.max(R.minutesMin, garde / 60);
  return { ...h, ...p, moments, garde: r2(garde), parole: r2(parole), punchlines, echanges, noteBrute: Math.round((points / Math.sqrt(minutes)) * 1000) / 1000 };
}

/* ------------------------------------------------------------------ candidates */

/** Une histoire autour du cœur `coeur` (indice du moment dans e.moments, ou −1), complétée jusqu'à `cible` s gardées. */
export function histoireAutour(coeur: PlageTemps, iCoeur: number, e: EntreeSequences, u: readonly PlageTemps[], cible: Sec = REGLES_HISTOIRES.garde.cible): Histoire | null {
  if (u.length === 0) return null;
  const i0 = debutMiseEnPlace(u, coeur.de);
  const reaction = iCoeur >= 0 ? finReaction(coeur, e.moments) : coeur.a;
  let i1 = Math.max(i0, finChute(u, coeur, reaction));
  // Le cœur reste dedans (un cœur après la dernière parole de la chute : on prend la parole qui le contient).
  while (i1 + 1 < u.length && u[i1]!.a < coeur.a) i1++;
  const [a, b] = completer(u, i0, i1, e, cible);
  const forceCoeur = iCoeur >= 0 ? e.moments[iCoeur]!.force : 0;
  const h = noterHistoire({ i0: a, i1: b, coeur: { de: coeur.de, a: coeur.a }, iCoeur, forceCoeur }, e, u);
  return h.a > h.de ? h : null;
}

/** Les cœurs : chaque moment de force ≥ 0,5 et les 3 meilleurs moments de chaque bloc (indices dans `moments`). */
export function coeurs(moments: readonly MomentV4[], blocDe: (t: Sec) => number): number[] {
  const R = REGLES_HISTOIRES;
  const choisis = new Set<number>();
  const parBloc = new Map<number, number[]>();
  moments.forEach((m, i) => {
    const b = blocDe(m.t);
    if (b < 0) return;
    if (m.force >= R.forceCoeur) choisis.add(i);
    parBloc.set(b, [...(parBloc.get(b) ?? []), i]);
  });
  for (const l of parBloc.values()) for (const i of [...l].sort((x, y) => moments[y]!.force - moments[x]!.force || x - y).slice(0, R.coeursParBloc)) choisis.add(i);
  return [...choisis].sort((x, y) => x - y);
}

/** Les échanges : paroles séparées de moins de 2,5 s. */
export function echanges(u: readonly PlageTemps[]): PlageTemps[] {
  const res: PlageTemps[] = [];
  for (const p of u) {
    const der = res[res.length - 1];
    if (der && p.de - der.a < REGLES_HISTOIRES.trouEchange) der.a = Math.max(der.a, p.a);
    else res.push({ de: p.de, a: p.a });
  }
  return res;
}

const recouvrement = (x: PlageTemps, y: PlageTemps) => Math.max(0, Math.min(x.a, y.a) - Math.max(x.de, y.de));

/** Clé de départage stable qui ne suit PAS l'ordre chronologique (mélange déterministe des bornes). */
function cleStable(h: PlageTemps): number {
  const x = Math.sin(h.de * 12.9898 + h.a * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Ordre des histoires : note brute, puis force du cœur, parole, durée gardée ; jamais l'ordre chronologique. */
export function meilleureDAbord(x: Histoire, y: Histoire): number {
  return y.noteBrute - x.noteBrute || y.forceCoeur - x.forceCoeur || y.parole - x.parole || y.garde - x.garde || cleStable(x) - cleStable(y);
}

/** Le cœur d'une histoire raccourcie : le sien s'il est encore dedans, sinon la plage entière (sans moment). */
function coeurDans(h: BaseHistoire, i0: number, i1: number, u: readonly PlageTemps[], duree: Sec): BaseHistoire {
  const q = plageEntre(u, i0, i1, duree);
  const dedans = h.coeur.de >= q.de && h.coeur.a <= q.a;
  return { i0, i1, coeur: dedans ? h.coeur : q, iCoeur: dedans ? h.iCoeur : -1, forceCoeur: dedans ? h.forceCoeur : 0 };
}

/**
 * Fusionne les histoires candidates, de la mieux notée à la moins bien notée : une histoire qui recouvre une histoire
 * déjà gardée à plus de 30 % (de la plus courte) est la même histoire (jetée) ; à moins de 5 s (ou un petit
 * recouvrement), les deux n'en font qu'une si le tout fait au plus 120 s de source et 90 s gardées (le cœur reste
 * celui de la mieux notée) ; sinon la moins bien notée est raccourcie (paroles entières) pour ne pas recouvrir l'autre,
 * si elle garde 30 s de source, ou jetée. Rend des histoires sans recouvrement, dans l'ordre chronologique.
 */
export function fusionnerHistoires(cands: readonly Histoire[], e: EntreeSequences, u: readonly PlageTemps[]): Histoire[] {
  const R = REGLES_HISTOIRES;
  const gardees: Histoire[] = [];
  const proche = (g: PlageTemps, h: PlageTemps) => recouvrement(g, h) > 0 || Math.max(g.de, h.de) - Math.min(g.a, h.a) < R.ecartFusion;
  for (const h0 of [...cands].sort(meilleureDAbord)) {
    let h: Histoire | null = h0;
    for (let passe = 0; passe < 8 && h; passe++) {
      const proches = gardees.map((g, k) => ({ g, k })).filter(({ g }) => proche(g, h!));
      if (proches.length === 0) break;
      if (proches.some(({ g }) => recouvrement(g, h!) > R.recouvrementMax * Math.min(g.a - g.de, h!.a - h!.de))) {
        h = null;
        break;
      }
      let fusion = false;
      for (const { g, k } of proches) {
        const i0 = Math.min(g.i0, h.i0);
        const i1 = Math.max(g.i1, h.i1);
        const union = plageEntre(u, i0, i1, e.duree);
        if (union.a - union.de > R.source.max || e.dureeDe([union]) > R.garde.max) continue;
        gardees.splice(k, 1);
        h = noterHistoire({ i0, i1, coeur: g.coeur, iCoeur: g.iCoeur, forceCoeur: g.forceCoeur }, e, u);
        fusion = true;
        break;
      }
      if (fusion) continue;
      const touche = proches.find(({ g }) => recouvrement(g, h!) > 0);
      if (!touche) break; // voisines sans recouvrement : deux histoires
      // Raccourcir h du côté de l'autre (paroles entières, bornes dans les pauses).
      const g = touche.g;
      let a = h.i0;
      let b = h.i1;
      if (h.de < g.de) while (b >= a && (b >= g.i0 || plageEntre(u, a, b, e.duree).a > g.de)) b--;
      else while (a <= b && (a <= g.i1 || plageEntre(u, a, b, e.duree).de < g.a)) a++;
      const q = b >= a ? plageEntre(u, a, b, e.duree) : null;
      if (!q || q.a - q.de < R.source.min) {
        h = null;
        break;
      }
      h = noterHistoire(coeurDans(h, a, b, u, e.duree), e, u);
    }
    if (h && !gardees.some((g) => recouvrement(g, h!) > 0)) gardees.push(h);
  }
  return gardees.sort((x, y) => x.de - y.de);
}
