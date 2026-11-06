// B. Sous-titres « punchlines » (dev 2), fonctions PURES : seules les phrases fortes s'affichent.
// Une phrase (mots consécutifs sans trou > 0,6 s ni fin de phrase « . ! ? … ») est une punchline si elle est
// COURTE (≤ 7 mots) ET contient au moins : un mot fort (mot[3] === 1 ou liste des mots forts), une exclamation
// (« ! »), un juron (jurons.ts), un rire (signaux.rires), ou si elle tombe juste avant / après un pic de son
// (signaux.pics ou signaux.cris, ±1,5 s).

import type { Mot, PlagePunchline, Sec } from '../../recette/types';
import { estFort } from '../../sous-titres/nettoyage';
import type { SignauxSource } from '../types';
import { estJuron, motNu } from './jurons';

export const PUNCHLINES = {
  motsMax: 7,
  /** Une phrase « autour d'un pic » commence au plus 1,5 s avant ou finit au plus 1,5 s après. */
  autourPic: 1.5,
  /** Un rire compte s'il commence pendant la phrase ou au plus 1 s après (on rit APRÈS la blague). */
  apresRire: 1,
  /** Un trou de plus de 0,6 s entre deux mots coupe la phrase (comme les lignes de sous-titres). */
  trouMax: 0.6,
};

export type RaisonPunchline = 'mot-fort' | 'exclamation' | 'juron' | 'rire' | 'pic';

/** Une punchline proposée : plage (temps source) + mots [k0, k1[ + raison + mot clé à colorer (indice dans `mots`). */
export interface PunchlineProposee extends PlagePunchline {
  k0: number;
  k1: number;
  raison: RaisonPunchline;
  cle: number | null;
}

const FIN_DE_PHRASE = /[.!?…]$/;

/** Le mot k termine-t-il sa phrase (ponctuation, ou trou de plus de 0,6 s avant le suivant) ? */
function finDePhrase(mots: readonly Mot[], k: number): boolean {
  const m = mots[k]!;
  const suivant = mots[k + 1];
  return !suivant || FIN_DE_PHRASE.test(m[0].trim()) || suivant[1] - m[2] > PUNCHLINES.trouMax;
}

/** Les phrases d'une transcription : indices [k0, k1[. */
export function phrases(mots: readonly Mot[]): { k0: number; k1: number }[] {
  const res: { k0: number; k1: number }[] = [];
  let k0 = 0;
  for (let k = 0; k < mots.length; k++) {
    if (finDePhrase(mots, k)) {
      res.push({ k0, k1: k + 1 });
      k0 = k + 1;
    }
  }
  return res;
}

const aExclamation = (m: Mot) => m[0].includes('!');
const estMotFort = (m: Mot) => m[3] === 1 || (estFort(m[0]) && !aExclamation(m));

/** Mot clé à colorer dans une ligne : juron, sinon mot fort, sinon mot avec « ! », sinon le plus long (≥ 3 lettres). */
export function indiceCle(mots: readonly Mot[]): number | null {
  const chercher = (test: (m: Mot) => boolean) => {
    const i = mots.findIndex(test);
    return i >= 0 ? i : null;
  };
  const trouve = chercher((m) => estJuron(m[0])) ?? chercher(estMotFort) ?? chercher(aExclamation);
  if (trouve !== null) return trouve;
  let meilleur: number | null = null;
  mots.forEach((m, i) => {
    const n = motNu(m[0]).length;
    if (n >= 3 && (meilleur === null || n >= motNu(mots[meilleur]![0]).length)) meilleur = i;
  });
  return meilleur;
}

/** Raison qui fait de la phrase une punchline (null si aucune). */
function raisonDe(mots: readonly Mot[], ts: Sec, fin: Sec, signaux: SignauxSource | null): RaisonPunchline | null {
  if (mots.some(estMotFort)) return 'mot-fort';
  if (mots.some(aExclamation)) return 'exclamation';
  if (mots.some((m) => estJuron(m[0]))) return 'juron';
  if (!signaux) return null;
  if (signaux.rires.some((r) => r.de < fin + PUNCHLINES.apresRire && r.a > ts)) return 'rire';
  const pres = (t: Sec) => t >= ts - PUNCHLINES.autourPic && t <= fin + PUNCHLINES.autourPic;
  if (signaux.pics.some((p) => pres(p.ts)) || signaux.cris.some((c) => pres(c.t))) return 'pic';
  return null;
}

/** Les punchlines d'une transcription (mots d'UNE source, triés). */
export function trouverPunchlines(mots: readonly Mot[], signaux: SignauxSource | null): PunchlineProposee[] {
  const res: PunchlineProposee[] = [];
  for (const { k0, k1 } of phrases(mots)) {
    if (k1 - k0 > PUNCHLINES.motsMax) continue;
    const ceux = mots.slice(k0, k1);
    const ts = ceux[0]![1];
    const fin = ceux[ceux.length - 1]![2];
    const raison = raisonDe(ceux, ts, fin, signaux);
    if (!raison) continue;
    const c = indiceCle(ceux);
    res.push({ ts, fin, k0, k1, raison, cle: c === null ? null : k0 + c });
  }
  return res;
}

/** Plage (temps source) de la phrase qui contient le mot k : pour ajouter / retirer une punchline d'un toucher. */
export function phraseDuMot(mots: readonly Mot[], k: number): PlagePunchline & { k0: number; k1: number } {
  const p = phrases(mots).find((x) => k >= x.k0 && k < x.k1) ?? { k0: k, k1: k + 1 };
  return { ts: mots[p.k0]![1], fin: mots[p.k1 - 1]![2], k0: p.k0, k1: p.k1 };
}

/** true si le milieu du mot tombe dans une des plages (règle d'affichage du mode punchlines). */
export function dansPunchline(mot: Mot, plages: readonly PlagePunchline[]): boolean {
  const milieu = (mot[1] + mot[2]) / 2;
  return plages.some((p) => milieu >= p.ts && milieu <= p.fin);
}

/** Durée totale (s) des punchlines, pour l'interface (« 42 punchlines · 2 min 10 »). */
export function dureePunchlines(p: readonly PlagePunchline[]): Sec {
  return p.reduce((s, x) => s + (x.fin - x.ts), 0);
}
