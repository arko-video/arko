// Outils purs pour les temps (en secondes) : lecture souple, arrondi au 1/100, affichage à la française.

import type { Plan, Sec } from './types';

/** Durée minimale d'un plan (en secondes de source). */
export const DUREE_MIN_PLAN: Sec = 0.1;

/** Arrondit un temps au 1/100 de seconde. */
export function arrondir(t: number): Sec {
  const r = Math.round((t + (t >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Lit un temps écrit de plusieurs façons : 12.5, "12,5", "12.5s", "2:14.5", "1:02:14,5".
 * Renvoie null si ce n'est pas un temps lisible.
 */
export function lireTemps(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().toLowerCase().replace(/,/g, '.');
  if (s.endsWith('s')) s = s.slice(0, -1).trim();
  if (s === '') return null;
  const negatif = s.startsWith('-');
  if (negatif) s = s.slice(1);
  const parties = s.split(':');
  if (parties.length > 3) return null;
  let total = 0;
  for (const p of parties) {
    if (!/^\d+(\.\d+)?$|^\.\d+$/.test(p)) return null;
    total = total * 60 + Number(p);
  }
  return negatif ? -total : total;
}

/** Nombre à la française : 0.9 → "0,90" (avec `decimales` chiffres après la virgule). */
export function formaterNombre(x: number, decimales = 2): string {
  return x.toFixed(decimales).replace('.', ',');
}

/** Temps pour les messages : 12 → "12,00 s". */
export function formaterSecondes(t: number): string {
  return `${formaterNombre(t, 2)} s`;
}

/**
 * Durée d'un plan dans la vidéo finale = (a − de) / vit + arrêt sur image.
 * C'est la SEULE formule de durée de tout le code (chronologie, opérations, normaliseur).
 */
export function dureePlan(p: Pick<Plan, 'de' | 'a' | 'vit' | 'fige'>): Sec {
  return (p.a - p.de) / (p.vit ?? 1) + (p.fige ?? 0);
}
