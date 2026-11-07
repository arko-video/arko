// Étape « mots » de la chaîne v4 (dev-mots), PURE : nettoyer les mots de Whisper avec la parole détectée.
// Signature GELÉE (types-v4.ts). Contrat : CONTRAT.md §1.3.
//
// Pourquoi (vraie session, 0–3000 s, whisper-base timestamped) : 37 % des mots durent 0,02 s, empilés au même instant
// (piles, surtout des BOUCLES d'une phrase répétée), la moitié des piles dans du jeu sans parole ; des mots étirés
// jusqu'à 1,5 s sur du silence (62 % des blancs > 1 s des coupes) ; les mots « normaux » sont bons (91 % dans la
// parole de Silero). Le nettoyage, dans l'ordre :
//  1. boucles : un groupe de 2 à 12 mots répété à la suite n'est gardé qu'une fois (piles.ts → boucles) ;
//  2. piles (≥ 3 mots sans vrai temps à la suite) : si un segment de parole les touche (± 0,3 s), leurs mots sont
//     répartis dans la parole libre de ce segment (entre les mots voisins), au prorata des lettres ; sinon retirés ;
//  3. un mot sans aucune trame de parole (p ≥ 0,35) dans [début − 0,3, fin + 0,3] est retiré, sauf s'il est fort
//     (≥ fond + 15 dB : un cri que la VAD a raté) ;
//  4. mot étiré (> 0,8 s) : fin ramenée à la dernière trame de parole du mot (début avancé jusqu'à la voix si
//     Whisper l'a posé dans le silence d'avant) ; posé sur plusieurs bouts de voix séparés de silence : réduit au
//     1er vrai bout ; mot de 0,5 à 0,8 s surtout sur du silence : réduit à sa voix ; mot sans voix dedans mais collé à
//     une voix (± 0,3 s) : ses 0,3 s du côté de cette voix ; sinon (cri gardé) 0,8 s au plus ;
//  5. bords qui débordent d'un segment de parole de moins de 0,15 s : recalés sur le segment ;
//  6. parole inaudible (vad/audible.ts) : un mot dont la parole autour (± 20 s, les 10 % les plus forts) est à plus de
//     15 dB sous celle de la session est retiré (compté « hors parole ») : un bruit lointain que la VAD entend et où
//     Whisper n'écrit que des boucles (vraie session : la rafale de bruits après la fin AFK, 74 mots ; aucun mot des
//     sous-titres de la main n'est à plus de 10 dB sous la session).
// Le texte n'est jamais changé, le 4ᵉ champ (`fort`) est gardé. Sans parole connue (aucun segment, ou parole tirée des
// mots eux-mêmes) : seuls les boucles, les piles et les mots étirés (plafond 0,8 s) sont traités.

import type { Mot, Sec } from '../../recette/types';
import type { EnveloppeDb } from '../types-v3';
import type { BilanMots, EntreeMots, MotsNettoyes, ParoleDetectee, SegmentParole } from '../types-v4';
import { estAudible, niveauParole, niveauxAutour, tramesDeParole } from '../vad/audible';
import { boucles, lettres, longueur, REGLAGES_PILES, trouverPiles } from './piles';

export const REGLAGES_MOTS_V4 = {
  ...REGLAGES_PILES,
  /** Un segment de parole « touche » une pile à ± `autourPile` s. */
  autourPile: 0.3,
  /** Un mot plus long est étiré. */
  etire: 0.8,
  /** Un mot de plus de `demiEtire` s dont la voix couvre moins de la moitié est réduit à sa voix. */
  demiEtire: 0.5,
  /** Un mot sans voix dedans mais collé à une voix garde `posee` s du côté de cette voix. */
  posee: 0.3,
  /** Une trame de la VAD est de la parole à partir de cette probabilité (sortie de Silero). */
  seuilParole: 0.35,
  /** Un mot est « hors parole » s'il n'y a aucune trame de parole à ± `autourMot` s. */
  autourMot: 0.3,
  /** Un mot hors parole est gardé s'il est fort : ≥ fond + `criDb` dB (un cri que la VAD a raté). */
  criDb: 15,
  /** Un bord qui déborde d'un segment de moins de `recalage` s est remis sur le segment. */
  recalage: 0.15,
  /** Répartition d'une pile : 0,07 s par lettre (débit normal), 0,035 s au plus vite ; un mot réparti dure ≥ 0,06 s. */
  parLettre: 0.07,
  parLettreMin: 0.035,
  motMin: 0.06,
} as const;

export type ReglagesMotsV4 = typeof REGLAGES_MOTS_V4;

const r2 = (x: number) => Math.round(x * 100) / 100;
/** Deux bouts de parole à moins de 0,2 s n'en font qu'un (dans un mot étiré). */
const TROU_PAROLE = 0.2;

/** Indices [i, j[ des segments (triés, sans chevauchement) qui touchent ]de, a[. Recherche dichotomique. */
function segmentsSur(segs: readonly SegmentParole[], de: Sec, a: Sec): [number, number] {
  let lo = 0;
  let hi = segs.length;
  while (lo < hi) {
    const mi = (lo + hi) >> 1;
    if (segs[mi]!.a <= de) lo = mi + 1;
    else hi = mi;
  }
  let j = lo;
  while (j < segs.length && segs[j]!.de < a) j++;
  return [lo, j];
}

/** Ce que le nettoyage sait de la parole : trames de la VAD, sinon segments. */
interface Ecoute {
  /** Y a-t-il de la parole sur [de, a] ? */
  parle(de: Sec, a: Sec): boolean;
  /** Les morceaux de parole dans [de, a] (trous de moins de 0,2 s bouchés), coupés à [de, a]. */
  parolesDans(de: Sec, a: Sec): { de: Sec; a: Sec }[];
  segments: readonly SegmentParole[];
}

function ecouteDe(parole: ParoleDetectee, seuil: number): Ecoute | null {
  if (parole.methode === 'mots' || parole.segments.length === 0) return null;
  const segs = parole.segments;
  const v = parole.probas;
  if (v && v.p.length > 0 && v.pas > 0) {
    const s = Math.ceil(seuil * 255 - 1e-9);
    const k0 = (t: Sec) => Math.max(0, Math.floor(t / v.pas));
    const k1 = (t: Sec) => Math.min(v.p.length, Math.ceil(t / v.pas));
    return {
      segments: segs,
      parle(de, a) {
        for (let k = k0(de); k < k1(a); k++) if (v.p[k]! >= s) return true;
        return false;
      },
      parolesDans(de, a) {
        const res: { de: Sec; a: Sec }[] = [];
        for (let k = k0(de); k < k1(a); k++) {
          if (v.p[k]! < s) continue;
          const x = Math.max(de, k * v.pas);
          const y = Math.min(a, (k + 1) * v.pas);
          const der = res[res.length - 1];
          if (der && x - der.a < TROU_PAROLE) der.a = y;
          else res.push({ de: x, a: y });
        }
        return res;
      },
    };
  }
  const dans = (de: Sec, a: Sec) => {
    const [i, j] = segmentsSur(segs, de, a);
    return segs.slice(i, j);
  };
  return {
    segments: segs,
    parle: (de, a) => dans(de, a).length > 0,
    parolesDans: (de, a) => dans(de, a).map((x) => ({ de: Math.max(de, x.de), a: Math.min(a, x.a) })),
  };
}

/**
 * Niveau du fond de la source : médiane des trames de 20 ms qui ne sont ni du silence numérique ni de la parole (le
 * bruit du jeu), dB. Un « cri que la VAD a raté » doit dépasser ce fond de 15 dB (vraie session : fond ≈ −67 dB, jeu
 * au 90ᵉ centile ≈ −53 dB, voix de Romain ≈ −43 dB).
 */
function fondDe(e: EnveloppeDb | null, segs: readonly SegmentParole[]): number | null {
  if (!e || e.db.length === 0) return null;
  const v: number[] = [];
  let j = 0;
  for (let k = 0; k < e.db.length; k++) {
    const x = e.db[k]!;
    if (!(x > -90)) continue;
    const t = (k + 0.5) * e.pas;
    while (j < segs.length && segs[j]!.a <= t) j++;
    if (j < segs.length && segs[j]!.de <= t) continue;
    v.push(x);
  }
  if (v.length === 0) return null;
  v.sort((x, y) => x - y);
  return v[Math.floor(0.5 * (v.length - 1))]!;
}

/** Niveau d'un mot : 80ᵉ centile des trames de 20 ms qu'il couvre (dB). */
function niveauMot(e: EnveloppeDb, de: Sec, a: Sec): number {
  const k0 = Math.max(0, Math.floor(de / e.pas));
  const k1 = Math.min(e.db.length, Math.max(k0 + 1, Math.ceil(a / e.pas)));
  const v = Array.from(e.db.subarray(k0, k1)).sort((x, y) => x - y);
  return v.length > 0 ? v[Math.floor(0.8 * (v.length - 1))]! : -Infinity;
}

/** La parole libre où répartir une pile : les segments qui la touchent, coupés entre les mots voisins. */
function parolePourPile(segs: readonly SegmentParole[], t0: Sec, t1: Sec, avant: Sec, apres: Sec, autour: Sec): { de: Sec; a: Sec }[] {
  const [i, j] = segmentsSur(segs, t0 - autour, t1 + autour);
  const touchent = segs.slice(i, j);
  return touchent.map((s) => ({ de: Math.max(s.de, avant), a: Math.min(s.a, apres) })).filter((p) => p.a - p.de > 0.01);
}

/**
 * Pose les mots d'une pile dans `zones` (triées), à la suite, au prorata des lettres : ~0,07 s par lettre, au plus
 * vite 0,035 s. Le bloc commence au début de la pile s'il tombe dans la parole (sinon au début de la parole libre).
 * Rend les mots posés (les derniers qui ne tiennent pas sont retirés), dans l'ordre.
 */
function repartir(pile: readonly Mot[], zones: readonly { de: Sec; a: Sec }[], t0: Sec, r: ReglagesMotsV4): Mot[] {
  const libre = longueur(zones);
  if (libre <= 0) return [];
  const l = pile.map(lettres);
  // Combien de mots tiennent au plus vite ?
  let n = 0;
  let besoinMin = 0;
  while (n < pile.length && besoinMin + Math.max(r.motMin, l[n]! * r.parLettreMin) <= libre + 1e-9) besoinMin += Math.max(r.motMin, l[n++]! * r.parLettreMin);
  if (n === 0) return [];
  const somme = l.slice(0, n).reduce((x, y) => x + y, 0);
  const bloc = Math.min(libre, Math.max(besoinMin, somme * r.parLettre));
  // Temps « de parole » (zones mises bout à bout) où commence le bloc.
  let debut = 0;
  let cumul = 0;
  for (const z of zones) {
    if (t0 >= z.de && t0 < z.a) {
      debut = cumul + (t0 - z.de);
      break;
    }
    if (t0 >= z.a) debut = cumul + (z.a - z.de);
    cumul += z.a - z.de;
  }
  debut = Math.max(0, Math.min(debut, libre - bloc));
  const versTemps = (x: number): { t: Sec; z: number } => {
    let c = 0;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i]!;
      if (x <= c + (z.a - z.de) + 1e-9) return { t: z.de + Math.max(0, x - c), z: i };
      c += z.a - z.de;
    }
    const der = zones[zones.length - 1]!;
    return { t: der.a, z: zones.length - 1 };
  };
  const res: Mot[] = [];
  let x = debut;
  for (let i = 0; i < n; i++) {
    const d = (l[i]! / somme) * bloc;
    const a = versTemps(x);
    // Un mot ne saute pas d'une zone à l'autre : il finit au plus tard à la fin de sa zone.
    const fin = Math.min(zones[a.z]!.a, a.t + d);
    const m = [...pile[i]!] as Mot;
    m[1] = a.t;
    m[2] = Math.max(fin, a.t + 0.02);
    res.push(m);
    x += d;
  }
  return res;
}

/** Sans parole connue, où étaler une pile : à partir de son début, entre ses voisins s'ils laissent la place. */
function placeSansParole(pile: readonly Mot[], t0: Sec, avant: Sec, apres: Sec, r: ReglagesMotsV4): { de: Sec; a: Sec }[] {
  const besoin = pile.reduce((s, m) => s + Math.max(r.motMin, lettres(m) * r.parLettre), 0);
  const mini = pile.reduce((s, m) => s + Math.max(r.motMin, lettres(m) * r.parLettreMin), 0);
  const de = Math.max(t0, Number.isFinite(avant) ? avant : t0);
  if (apres - de >= mini) return [{ de, a: Math.min(apres, de + besoin) }];
  return [{ de: t0, a: t0 + besoin }];
}

/** Nettoie les mots de Whisper (voir l'en-tête). Pure ; ne lève pas sur des données bizarres. */
export function nettoyerMotsV4(e: EntreeMots, r: ReglagesMotsV4 = REGLAGES_MOTS_V4): MotsNettoyes {
  const bilan: BilanMots = { avant: e.mots.length, apres: 0, piles: 0, motsDePiles: 0, repartis: 0, horsParole: 0, etires: 0, recales: 0 };
  // 0. Copie triée (tri stable : l'ordre de Whisper est gardé à temps égal), sans durée nulle.
  const tries = e.mots
    .filter((m) => Number.isFinite(m[1]) && Number.isFinite(m[2]))
    .map((m) => {
      const c = [...m] as Mot;
      if (!(c[2] > c[1])) c[2] = c[1] + 0.02;
      return c;
    })
    .sort((x, y) => x[1] - y[1]);
  bilan.horsParole += e.mots.length - tries.length;
  // 1. Boucles de répétition.
  const b = boucles(tries);
  const mots = tries.filter((_, i) => !b.retires.has(i));
  bilan.piles += b.boucles;
  bilan.motsDePiles += b.retires.size;
  // 2. Piles (sur les mots qui restent).
  const piles = trouverPiles(mots, r);
  const dansPile = new Int32Array(mots.length).fill(-1);
  piles.forEach(([i, j], p) => {
    for (let k = i; k <= j; k++) dansPile[k] = p;
  });
  bilan.piles += piles.length;
  bilan.motsDePiles += piles.reduce((s, [i, j]) => s + j - i + 1, 0);
  const ecoute = ecouteDe(e.parole, r.seuilParole);
  const fond = ecoute ? fondDe(e.energie, ecoute.segments) : null;
  // 3–5. Les mots qui ont un vrai temps : hors parole, étirés, bords.
  const gardes: (Mot | null)[] = mots.map((m, i) => {
    if (dansPile[i]! >= 0) return null;
    let [ts, fin] = [m[1], m[2]];
    if (ecoute && !ecoute.parle(ts - r.autourMot, fin + r.autourMot)) {
      const fort = fond !== null && e.energie !== null && niveauMot(e.energie, ts, fin) >= fond + r.criDb;
      if (!fort) {
        bilan.horsParole++;
        return null;
      }
    }
    if (ecoute && fin - ts > r.posee) {
      // Les bouts de voix du mot ; une trame isolée (< 0,06 s) ne compte pas comme de la voix.
      const tous = ecoute.parolesDans(ts, fin);
      const runs = tous.some((x) => x.a - x.de >= 0.06) ? tous.filter((x) => x.a - x.de >= 0.06) : tous;
      const d = fin - ts;
      if (runs.length === 0) {
        // Aucune voix dans le mot, mais juste après (ou juste avant) : il est collé à elle, du côté où elle est
        // (Whisper fait souvent commencer le 1er mot d'une phrase dans le silence d'avant).
        if (ecoute.parle(fin, fin + r.autourMot)) ts = fin - r.posee;
        else if (ecoute.parle(ts - r.autourMot, ts)) fin = ts + r.posee;
        else fin = Math.min(fin, ts + r.etire);
      } else {
        const premier = runs[0]!;
        const dernier = runs[runs.length - 1]!;
        const parle = longueur(runs);
        if (d > r.etire + 1e-9 && parle >= 0.6 * (dernier.a - premier.de)) {
          // La voix remplit le mot (à de petits trous près) : sa fin est la dernière trame de parole ; un début
          // posé bien avant la voix est avancé jusqu'à elle.
          fin = Math.max(dernier.a, ts + r.motMin);
          if (premier.de - ts > r.etire / 2) ts = Math.max(ts, premier.de - 0.03);
        } else if (d > r.etire + 1e-9) {
          // Le mot s'étale sur plusieurs bouts de voix séparés de silence : il garde le 1er vrai bout (≥ 0,1 s).
          const bout = runs.find((x) => x.a - x.de >= 0.1) ?? runs.reduce((x, y) => (y.a - y.de > x.a - x.de ? y : x));
          ts = Math.max(ts, bout.de - 0.03);
          fin = Math.min(fin, Math.max(bout.a + 0.03, ts + r.motMin));
        } else if (d > r.demiEtire && parle < 0.5 * d) {
          // Mot moyen (0,5 à 0,8 s) posé surtout sur du silence : réduit à sa voix.
          ts = Math.max(ts, premier.de - 0.03);
          fin = Math.min(fin, Math.max(dernier.a + 0.03, ts + 0.1));
        }
      }
      if (fin - ts < m[2] - m[1] - 1e-6) bilan.etires++;
    } else if (!ecoute && fin - ts > r.etire + 1e-9) {
      fin = ts + r.etire;
      bilan.etires++;
    }
    if (ecoute) {
      let bouge = false;
      const [i0, i1] = segmentsSur(ecoute.segments, ts, fin);
      if (i1 > i0) {
        const seg = ecoute.segments[i0]!;
        if (ts < seg.de && seg.de - ts < r.recalage && fin - seg.de >= 0.02) {
          ts = seg.de;
          bouge = true;
        }
        const der = ecoute.segments[i1 - 1]!;
        if (fin > der.a && fin - der.a < r.recalage && der.a - ts >= 0.02) {
          fin = der.a;
          bouge = true;
        }
      }
      if (bouge) bilan.recales++;
    }
    const c = [...m] as Mot;
    c[1] = ts;
    c[2] = fin;
    return c;
  });
  // 2 (suite). Chaque pile : répartie dans la parole libre qui la touche, sinon retirée.
  const reparties: Mot[] = [];
  const segs = ecoute?.segments ?? [];
  for (const [i, j] of piles) {
    const pile = mots.slice(i, j + 1);
    const t0 = Math.min(...pile.map((m) => m[1]));
    const t1 = Math.max(...pile.map((m) => m[2]));
    let avant = -Infinity;
    for (let k = i - 1; k >= 0; k--) {
      const g = gardes[k];
      if (g) {
        avant = g[2];
        break;
      }
    }
    let apres = Infinity;
    for (let k = j + 1; k < mots.length; k++) {
      const g = gardes[k];
      if (g) {
        apres = g[1];
        break;
      }
    }
    // Sans parole connue : la pile garde sa place, étalée à partir de son début (entre ses voisins s'il y a la place).
    const zones = ecoute ? parolePourPile(segs, t0, t1, avant, apres, r.autourPile) : placeSansParole(pile, t0, avant, apres, r);
    const poses = repartir(pile, zones, t0, r);
    bilan.repartis += poses.length;
    reparties.push(...poses);
  }
  const res = [...gardes.filter((m): m is Mot => m !== null), ...reparties]
    .map((m) => {
      const c = [...m] as Mot;
      c[1] = r2(m[1]);
      c[2] = Math.max(r2(m[2]), r2(m[1] + 0.02));
      return c;
    })
    .sort((x, y) => x[1] - y[1]);
  // 6. Mots sur une parole inaudible (bruit lointain) : retirés.
  const audibles = ecoute && e.energie ? motsAudibles(res, e.energie, ecoute.segments) : res;
  bilan.horsParole += res.length - audibles.length;
  bilan.apres = audibles.length;
  return { mots: audibles, bilan };
}

/** Les mots dont la parole autour est audible face à celle de la session (vad/audible.ts). */
function motsAudibles(mots: Mot[], energie: EnveloppeDb, segments: readonly SegmentParole[]): Mot[] {
  const parle = tramesDeParole(energie, segments);
  const reference = niveauParole(energie, parle);
  if (!reference) return mots;
  const autour = niveauxAutour(energie, parle);
  return mots.filter((m) => {
    const t = Math.max(0, Math.min(autour.length - 1, Math.floor((m[1] + m[2]) / 2)));
    const db = autour[t]!;
    return Number.isNaN(db) || estAudible(db, reference.db);
  });
}
