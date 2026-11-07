// Contexte d'un moment fort (dev 1), fonctions PURES partagées par le monteur sans IA (ia/recit.ts) et le derush
// (derush.ts) : où commence la MISE EN PLACE (début de la phrase ou de l'échange qui précède, 5 à 15 s avant), où
// finit la CHUTE (fin de la phrase en cours), et où est le dernier calme quand il n'y a pas de mots.

import type { Mot, Sec } from '../../recette/types';
import type { SignauxSource } from '../types';

/** Trou entre deux mots au-delà duquel une phrase est finie (attribution des phrases, chute). */
export const TROU_PHRASE: Sec = 0.6;

/** Mots triés par début (copie). */
export function motsTries(mots: readonly Mot[]): Mot[] {
  return mots.filter((m) => Number.isFinite(m[1]) && Number.isFinite(m[2])).sort((x, y) => x[1] - y[1]);
}

/**
 * Début de la mise en place d'un moment au temps `t0` : on part du mot dit juste avant `t0` et on remonte de mot en
 * mot tant que le trou entre deux mots est < `pause` et qu'on reste à `max` s au plus de t0. Si on s'arrête à moins
 * de `min` s (longue pause juste avant), on prend t0 − min, recalé au début de la phrase qui le contient (si elle
 * commence encore à `max` s au plus). Sans mot avant t0 : null.
 */
export function debutDePhrase(mots: readonly Mot[], t0: Sec, min: Sec, max: Sec, pause: Sec): Sec | null {
  const tries = motsTries(mots);
  let k = -1;
  for (let i = 0; i < tries.length; i++) if (tries[i]![1] <= t0) k = i;
  if (k < 0 || tries[k]![1] < t0 - max) return null;
  let debut = tries[k]![1];
  while (k > 0) {
    const prec = tries[k - 1]!;
    if (debut - prec[2] >= pause || prec[1] < t0 - max) break;
    debut = prec[1];
    k--;
  }
  if (debut <= t0 - min) return debut;
  // Trop court : 5 s au moins, au début de la phrase qui contient t0 − min (sinon pile t0 − min, dans un silence).
  const cible = t0 - min;
  let j = -1;
  for (let i = 0; i < tries.length; i++) if (tries[i]![1] <= cible) j = i;
  if (j < 0 || tries[j]![2] + TROU_PHRASE < cible) return cible;
  let d = tries[j]![1];
  while (j > 0 && d - tries[j - 1]![2] < TROU_PHRASE && tries[j - 1]![1] >= t0 - max) d = tries[--j]![1];
  return d;
}

/**
 * Fin de la phrase en cours au temps `t` (fin du dernier mot d'une suite sans trou > 0,6 s qui a commencé avant `t`),
 * au plus `limite`. Pas de phrase en cours : `t`.
 */
export function finDePhrase(mots: readonly Mot[], t: Sec, limite: Sec): Sec {
  const tries = motsTries(mots);
  let k = -1;
  for (let i = 0; i < tries.length; i++) if (tries[i]![1] < t) k = i;
  if (k < 0 || tries[k]![2] + TROU_PHRASE < t) return t;
  let fin = Math.max(t, tries[k]![2]);
  while (k + 1 < tries.length && tries[k + 1]![1] - tries[k]![2] <= TROU_PHRASE && tries[k + 1]![2] <= limite) fin = tries[++k]![2];
  return Math.min(limite, fin);
}

/**
 * Sans mots : le dernier instant CALME (niveau sous le fond + 3 dB pendant ≥ 0,8 s) dans [t0 − max, t0 − min].
 * Fond = 20ᵉ centile des 30 s avant t0. Aucun calme : null.
 */
export function dernierCalme(s: SignauxSource, t0: Sec, min: Sec, max: Sec): Sec | null {
  const pas = s.pas;
  const db = (k: number) => 20 * Math.log10((s.rms[k] ?? 0) + 1e-12);
  const k0 = Math.max(0, Math.round((t0 - 30) / pas));
  const k1 = Math.min(s.rms.length, Math.round(t0 / pas));
  if (k1 - k0 < 10) return null;
  const tous: number[] = [];
  for (let k = k0; k < k1; k++) tous.push(db(k));
  tous.sort((a, b) => a - b);
  const seuil = tous[Math.floor(tous.length * 0.2)]! + 3;
  const a = Math.max(0, Math.round((t0 - max) / pas));
  const b = Math.min(s.rms.length - 1, Math.round((t0 - min) / pas));
  const tenue = Math.round(0.8 / pas);
  // On remonte depuis t0 − min : la 1re case calme qui fait partie d'une suite calme de 0,8 s.
  let suite = 0;
  let meilleur: number | null = null;
  for (let k = Math.min(s.rms.length - 1, b + tenue); k >= a; k--) {
    suite = db(k) < seuil ? suite + 1 : 0;
    if (suite >= tenue) {
      meilleur = Math.min(b, k + tenue - 1);
      break;
    }
  }
  return meilleur === null ? null : meilleur * pas;
}
