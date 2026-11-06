// E. Bruitages posés sur la RÉACTION, pas sur le mot (retour de Romain, 6/11/2026 : posés sur le mot, ils tombaient
// mal et couvraient la parole). Fonction PURE : le son part après la fin de la phrase qui contient le déclencheur,
// ou au début du rire / du cri qui la suit ; il s'arrête avant que quelqu'un reparle. Si la parole reprend tout de
// suite (moins de 0,8 s de place), on ne propose rien.

import type { Mot, Sec } from '../../recette/types';
import { phrases } from '../habillage/punchlines';
import type { SignauxSource } from '../types';

export const REACTION = {
  /** Après la fin de la phrase (s). */
  apres: 0.15,
  /** Un rire ou un cri qui commence jusqu'à 3 s après la phrase est la réaction. */
  attente: 3,
  /** Il faut au moins 0,8 s sans parole pour poser le son ; il s'arrête 0,05 s avant le mot suivant. */
  placeMin: 0.8,
  marge: 0.05,
  /** Durée jouée au plus (s). */
  durMax: 4,
};

/** Où poser le bruitage d'un déclencheur qui finit au mot `k` (temps source) ; null si la parole ne laisse pas de place. */
export function placerSurReaction(mots: readonly Mot[], k: number, signaux: SignauxSource | null): { ts: Sec; dur: Sec } | null {
  if (!mots[k]) return null;
  const ph = phrases(mots).find((p) => k >= p.k0 && k < p.k1) ?? { k0: k, k1: k + 1 };
  const fin = mots[ph.k1 - 1]![2];
  const suivant = mots[ph.k1]?.[1] ?? Infinity;
  const reactions = signaux
    ? [...signaux.rires, ...signaux.cris].filter((r) => r.de >= fin - 0.3 && r.de <= fin + REACTION.attente).sort((a, b) => a.de - b.de)
    : [];
  const ts = Math.round((reactions[0] ? Math.max(reactions[0].de, fin + 0.05) : fin + REACTION.apres) * 100) / 100;
  const dur = Math.min(REACTION.durMax, suivant - REACTION.marge - ts);
  if (dur < REACTION.placeMin) return null;
  return { ts, dur: Math.round(dur * 100) / 100 };
}

/** Durée jouée d'un son posé à `ts` sans couvrir le mot suivant (null si moins de 0,8 s de place). */
export function placeAvantParole(mots: readonly Mot[], ts: Sec): Sec | null {
  const suivant = mots.find((m) => m[1] >= ts)?.[1] ?? Infinity;
  const dur = Math.min(REACTION.durMax, suivant - REACTION.marge - ts);
  return dur < REACTION.placeMin ? null : Math.round(dur * 100) / 100;
}
