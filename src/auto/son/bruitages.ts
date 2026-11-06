// E. Bruitages automatiques (dev 3), fonctions PURES : à partir des mots (et des signaux du son), propose des bruitages
// à −4 dB, coupés à 4 s au plus avec un fondu de 0,3 s. L'écran de revue fait écouter chaque proposition dans son
// contexte ; rien n'est posé sans validation.
// Retour de Romain (6/11/2026, « atroces » sur le vrai montage) → mode PRUDENT par défaut :
//  - posés sur la RÉACTION (après la fin de la phrase, ou au rire / cri qui suit), jamais par-dessus la parole
//    (reaction.ts) ;
//  - seulement les déclencheurs très sûrs (expression de plusieurs mots, ou mot crié « ! » / sur un pic de son) ;
//  - 1 toutes les 2 minutes au plus.
// L'ancien mode (sur le mot + 0,1 s, 2 par minute, tous les déclencheurs) reste disponible : MODE_LARGE.

import type { Mot, Sec } from '../../recette/types';
import { sansAccents } from '../../sons/recherche';
import { TEXTES_SON_AUTO } from '../../ui/auto/son/textes';
import type { SignauxSource } from '../types';
import type { CategorieBruitage, Declencheur } from './declencheurs';
import { placeAvantParole, placerSurReaction } from './reaction';

export const BRUITAGES = { decalage: 0.1, gainDb: -4, durMin: 2, durMax: 4, fondu: 0.3, parMinute: 0.5, seuilSurete: 4 };
/** L'ancien réglage (avant le retour de Romain) : sur le mot, 2 par minute, tous les déclencheurs. */
export const MODE_LARGE: OptionsBruitages = { parMinute: 2, seuilSurete: 0, placement: 'mot' };
/** Deux bruitages jamais à moins de 4 s l'un de l'autre (ils ne se chevauchent pas). */
export const ECART_MIN: Sec = 4;
/** Juron « fort » : RMS au-dessus de −16 dBFS sur le mot, ou un pic de son à ±0,3 s. */
const JURON_FORT_DB = -16;
/** Rire « fort » : force ≥ 0,6. */
const RIRE_FORT = 0.6;
/** Silence gênant : 3 s sans parole après une question, 5 s sinon ; son du jeu calme (< −30 dBFS). */
const SILENCE = { apresQuestion: 3, sinon: 5, calmeDb: -30, apres: 1 };
const TX = TEXTES_SON_AUTO.bruitages;

export interface PropositionBruitage {
  /** Temps source où poser le son (début du mot + 0,1 s), et sa source vidéo. */
  ts: Sec;
  src: string;
  categorie: CategorieBruitage;
  /** Ce qui l'a déclenché, pour l'écran de revue (« "on a gagné" à 12:04 », « rire fort »). */
  pourquoi: string;
  /** Indice du mot déclencheur dans `mots` (null pour un déclencheur de son). */
  k: number | null;
  /** Volume linéaire (−4 dB ≈ 0,63), durée jouée AU PLUS (place avant que quelqu'un reparle) et fondu de sortie. */
  vol: number;
  dur: Sec;
  fondu: Sec;
}

export interface OptionsBruitages {
  /** Au plus tant de bruitages par minute de vidéo (défaut 0,5 : un toutes les 2 minutes). */
  parMinute?: number;
  /** Sûreté minimale (défaut 4 : expression de plusieurs mots, « ! » exigé, ou mot crié ; 3 = un mot seul ; 2 = juron
   *  crié, rire fort ; 1 = silence gênant). */
  seuilSurete?: number;
  /** 'reaction' (défaut) : après la phrase ou au rire qui suit ; 'mot' : au début du mot + 0,1 s (ancien). */
  placement?: 'reaction' | 'mot';
}

/** Une proposition avant le tri, avec sa sûreté (mot exact > signal). */
interface Candidat extends PropositionBruitage {
  surete: number;
}

/** −4 dB → 0,631 (linéaire, arrondi au 1/1000). */
export function volDepuisDb(db: number): number {
  return Math.round(Math.pow(10, db / 20) * 1000) / 1000;
}

/** Durée jouée d'un bruitage : la durée du son, bornée entre 2 et 4 s. */
export function dureeBruitage(dureeSon: Sec): Sec {
  return Math.min(BRUITAGES.durMax, Math.max(BRUITAGES.durMin, dureeSon));
}

/** « 754,2 » → « 12:34 ». */
export function minutesSecondes(t: Sec): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Jetons comparables d'un mot (minuscules, sans accents ni ponctuation), avec l'indice du mot. */
function jetons(mots: readonly Mot[]): { j: string; k: number }[] {
  const res: { j: string; k: number }[] = [];
  mots.forEach((m, k) => {
    for (const j of sansAccents(m[0]).split(' ')) if (j) res.push({ j, k });
  });
  return res;
}

/** Le mot k (ou le jeton qui le suit) porte-t-il un « ! » ? */
function crie(mots: readonly Mot[], k: number): boolean {
  if (/!\s*$/.test(mots[k]?.[0] ?? '')) return true;
  const suivant = mots[k + 1]?.[0].trim();
  return suivant === '!';
}

/** Même mot, à l'accord près (« coincé » = « coincés », « coincée ») : jamais un autre mot (« mortel » ≠ « mort »). */
export function memeMot(jeton: string, cherche: string): boolean {
  if (jeton === cherche) return true;
  return cherche.length >= 3 && jeton.startsWith(cherche) && /^(e|s|x|es|ee|ees)$/.test(jeton.slice(cherche.length));
}

/** Expressions trouvées : pour chaque fin d'expression, l'indice du 1er et du dernier mot. */
export function trouverExpression(mots: readonly Mot[], expression: string): { k0: number; k1: number }[] {
  const cible = sansAccents(expression).split(' ').filter(Boolean);
  const exclamation = /!\s*$/.test(expression);
  if (cible.length === 0) return [];
  const liste = jetons(mots);
  const res: { k0: number; k1: number }[] = [];
  for (let i = 0; i + cible.length <= liste.length; i++) {
    if (!cible.every((c, d) => memeMot(liste[i + d]!.j, c))) continue;
    const k0 = liste[i]!.k;
    const k1 = liste[i + cible.length - 1]!.k;
    if (exclamation && !crie(mots, k1)) continue;
    if (res.some((r) => r.k0 === k0)) continue;
    res.push({ k0, k1 });
  }
  return res;
}

function dbfs(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** RMS moyen (dBFS) de [de, a[ dans les signaux. */
function niveau(s: SignauxSource, de: Sec, a: Sec): number {
  const i0 = Math.max(0, Math.floor(de / s.pas));
  const i1 = Math.min(s.rms.length, Math.max(i0 + 1, Math.ceil(a / s.pas)));
  let somme = 0;
  for (let i = i0; i < i1; i++) somme += s.rms[i]! * s.rms[i]!;
  return i1 > i0 ? dbfs(Math.sqrt(somme / (i1 - i0))) : -Infinity;
}

/** Le mot [de, a] est-il dit fort ? Sans signaux : seulement s'il porte un « ! ». */
function ditFort(signaux: SignauxSource | null, de: Sec, a: Sec, exclame: boolean): boolean {
  if (!signaux) return exclame;
  if (signaux.pics.some((p) => p.ts >= de - 0.3 && p.ts <= a + 0.3)) return true;
  let max = -Infinity;
  for (let t = de; t < a; t += 0.1) max = Math.max(max, niveau(signaux, t, Math.min(a, t + 0.1)));
  return max > JURON_FORT_DB;
}

/** Tous les candidats, avant la limite par minute. */
function candidats(mots: readonly Mot[], src: string, signaux: SignauxSource | null, declencheurs: readonly Declencheur[], reaction: boolean): Candidat[] {
  const res: Candidat[] = [];
  /** En mode réaction : déplace le candidat après la phrase (ou le retire s'il couvrirait la parole). */
  const placer = (c: Candidat, k: number | null): Candidat | null => {
    if (!reaction) return c;
    const p = k === null ? ((d) => (d === null ? null : { ts: c.ts, dur: d }))(placeAvantParole(mots, c.ts)) : placerSurReaction(mots, k, signaux);
    return p ? { ...c, ts: p.ts, dur: Math.min(c.dur, p.dur) } : null;
  };
  const ajouter = (c: Candidat, k: number | null) => {
    const placee = placer(c, k);
    if (placee) res.push(placee);
  };
  const base = { src, vol: volDepuisDb(BRUITAGES.gainDb), dur: BRUITAGES.durMax, fondu: BRUITAGES.fondu };
  const motsPris = new Set<number>();
  for (const d of declencheurs) {
    for (const expr of d.mots) {
      for (const { k0, k1 } of trouverExpression(mots, expr)) {
        if (Array.from({ length: k1 - k0 + 1 }, (_, d) => k0 + d).some((k) => motsPris.has(k))) continue;
        const debut = mots[k0]![1];
        const texte = mots.slice(k0, k1 + 1).map((m) => m[0].trim()).join(' ');
        if (d.signal === 'juron-fort') {
          if (!ditFort(signaux, debut, mots[k1]![2], crie(mots, k1))) continue;
          ajouter({ ...base, ts: debut + BRUITAGES.decalage, categorie: d.categorie, pourquoi: TX.pourquoiJuron(texte, minutesSecondes(debut)), k: k0, surete: 2 }, k1);
        } else {
          // Expression de plusieurs mots, « ! » exigé, ou mot crié (« ! » ou pic de son) : plus sûr qu'un mot seul.
          const crieFort = crie(mots, k1) || (signaux?.pics.some((p) => p.ts >= debut - 0.3 && p.ts <= mots[k1]![2] + 0.3) ?? false);
          const surete = 3 + (k1 > k0 || /!\s*$/.test(expr) || crieFort ? 1 : 0);
          ajouter({ ...base, ts: debut + BRUITAGES.decalage, categorie: d.categorie, pourquoi: TX.pourquoiMot(texte, minutesSecondes(debut)), k: k0, surete }, k1);
        }
        for (let k = k0; k <= k1; k++) motsPris.add(k);
      }
    }
    if (d.signal === 'rire' && signaux) {
      for (const r of signaux.rires) {
        if (r.force < RIRE_FORT) continue;
        ajouter({ ...base, ts: r.de + BRUITAGES.decalage, categorie: d.categorie, pourquoi: TX.pourquoiRire(minutesSecondes(r.de)), k: null, surete: 2 }, null);
      }
    }
    if (d.signal === 'silence') {
      for (let k = 0; k + 1 < mots.length; k++) {
        const fin = mots[k]![2];
        const trou = mots[k + 1]![1] - fin;
        const question = /[?…]\s*$|\.\.\.\s*$/.test(mots[k]![0]);
        if (trou < (question ? SILENCE.apresQuestion : SILENCE.sinon)) continue;
        if (signaux && niveau(signaux, fin + 0.3, mots[k + 1]![1] - 0.3) > SILENCE.calmeDb) continue;
        ajouter({ ...base, ts: fin + SILENCE.apres, categorie: d.categorie, pourquoi: TX.pourquoiSilence(minutesSecondes(fin)), k: null, surete: 1 }, null);
      }
    }
  }
  return res;
}

/**
 * Garde les plus sûrs : au plus `parMinute` dans toute fenêtre de 60 s, et 4 s d'écart au moins. Moins de 1 par minute
 * (0,5) : un seul dans toute fenêtre de 60 / parMinute s (2 min).
 */
export function limiterParMinute<T extends { ts: Sec; surete: number }>(liste: readonly T[], parMinute: number): T[] {
  const tries = [...liste].sort((a, b) => b.surete - a.surete || a.ts - b.ts);
  const gardes: T[] = [];
  const ecart = parMinute < 1 ? 60 / Math.max(0.01, parMinute) : ECART_MIN;
  for (const c of tries) {
    if (gardes.some((g) => Math.abs(g.ts - c.ts) < ecart)) continue;
    if (parMinute < 1) {
      gardes.push(c);
      continue;
    }
    const temps = [...gardes.map((g) => g.ts), c.ts].sort((a, b) => a - b);
    let ok = true;
    for (let i = 0; i + parMinute < temps.length; i++) if (temps[i + parMinute]! - temps[i]! < 60) ok = false;
    if (ok) gardes.push(c);
  }
  return gardes.sort((a, b) => a.ts - b.ts);
}

/** Propositions de bruitages pour les mots d'UNE source (`src`), triées par temps. */
export function proposerBruitages(
  mots: readonly Mot[],
  src: string,
  signaux: SignauxSource | null,
  declencheurs: readonly Declencheur[],
  options: OptionsBruitages = {},
): PropositionBruitage[] {
  const brut = options.parMinute ?? BRUITAGES.parMinute;
  const parMinute = brut < 1 ? Math.max(0.05, brut) : Math.round(brut);
  const seuil = options.seuilSurete ?? BRUITAGES.seuilSurete;
  const tous = candidats(mots, src, signaux, declencheurs, (options.placement ?? 'reaction') === 'reaction');
  const gardes = limiterParMinute(tous.filter((c) => c.surete >= seuil), parMinute);
  return gardes.map((c) => {
    const p: PropositionBruitage & { surete?: number } = { ...c, ts: Math.round(c.ts * 100) / 100 };
    delete p.surete;
    return p;
  });
}
