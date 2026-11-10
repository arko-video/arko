// PRISES RATÉES (10/11/2026, demande de Romain : « des fois je me répète pour avoir une bonne intonation pour YouTube,
// il doit garder le bon moment, là il les a tous mis »). Une phrase redite peu après (15 s au plus) presque à
// l'identique, ou commencée puis reprise depuis le début, est une PRISE RATÉE : seule la DERNIÈRE prise est gardée
// (c'est celle que l'on garde quand on se reprend). Prudent : 3 mots au moins, 70 % de mots communs dans l'ordre.
// Pur ; appliqué à la transcription (nettoyer), donc aux coupes, aux sous-titres et au monteur IA.

import type { Mot, Sec } from '../../recette/types';

export const PRISES = { ecartMax: 15, pause: 0.7, motsMin: 3, ressemblance: 0.7 } as const;

const cleMot = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9']/g, '');

/** Phrases : indices [k0, k1[ dans `mots` (pause de plus de 0,7 s ou ponctuation finale). */
function phrases(mots: readonly Mot[]): { k0: number; k1: number }[] {
  const res: { k0: number; k1: number }[] = [];
  let k0 = 0;
  for (let k = 1; k <= mots.length; k++) {
    const fin = k === mots.length || mots[k]![1] - mots[k - 1]![2] > PRISES.pause || /[.!?…]\s*$/.test(mots[k - 1]![0]);
    if (fin) {
      res.push({ k0, k1: k });
      k0 = k;
    }
  }
  return res;
}

/** Longueur de la plus longue sous-suite commune (mots dans l'ordre). */
function lcs(a: readonly string[], b: readonly string[]): number {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) t[i]![j] = a[i - 1] === b[j - 1] ? t[i - 1]![j - 1]! + 1 : Math.max(t[i - 1]![j]!, t[i]![j - 1]!);
  return t[a.length]![b.length]!;
}

/** `a` est une prise ratée de `b` (dite après) : presque la même phrase, ou son début. */
export function estPriseDe(a: readonly string[], b: readonly string[]): boolean {
  if (a.length < PRISES.motsMin || b.length < PRISES.motsMin) return false;
  const commun = lcs(a, b);
  if (commun / Math.max(a.length, b.length) >= PRISES.ressemblance) return true;
  // Commencée puis reprise : les mots de `a` forment (presque) le début de `b`.
  const debut = b.slice(0, a.length + 1);
  return a.length <= b.length && lcs(a, debut) / a.length >= 0.85;
}

export interface ResultatPrises {
  mots: Mot[];
  /** Plages retirées (temps source), pour le dire à l'utilisateur. */
  retirees: { de: Sec; a: Sec; texte: string }[];
}

export function retirerPrisesRatees(mots: readonly Mot[]): ResultatPrises {
  const ph = phrases(mots);
  const cles = ph.map((p) => mots.slice(p.k0, p.k1).map((m) => cleMot(m[0])).filter(Boolean));
  const ratee = new Set<number>();
  for (let i = 0; i < ph.length; i++) {
    const fin = mots[ph[i]!.k1 - 1]![2];
    for (let j = i + 1; j < ph.length && j <= i + 4; j++) {
      if (mots[ph[j]!.k0]![1] - fin > PRISES.ecartMax) break;
      if (estPriseDe(cles[i]!, cles[j]!)) {
        ratee.add(i);
        break;
      }
    }
  }
  if (ratee.size === 0) return { mots: [...mots], retirees: [] };
  const res: Mot[] = [];
  const retirees: ResultatPrises['retirees'] = [];
  ph.forEach((p, i) => {
    const ceux = mots.slice(p.k0, p.k1);
    if (ratee.has(i)) retirees.push({ de: ceux[0]![1], a: ceux[ceux.length - 1]![2], texte: ceux.map((m) => m[0]).join(' ') });
    else res.push(...ceux);
  });
  return { mots: res, retirees };
}
