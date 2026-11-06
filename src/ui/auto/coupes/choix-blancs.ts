// Choix du panneau « Couper les blancs » (A, dev 1), fonctions PURES : partie écoutée et plage de coupe selon
// « Mon montage / Toute la vidéo / Une partie », et durées lisibles (« 2 h 03 », « 41 min »).

import type { PlageTemps } from '../../../auto/types';
import { premiereVideo } from '../../../auto/coupes/decoupe';
import type { Recette } from '../../../recette/types';
import { TA } from '../../../textes-auto';
import { lireHeure } from '../../format';

export type SurQuoi = 'montage' | 'toute' | 'partie';

/** Partie écoutée et plage de coupe pour un choix (pure). Une chaîne = message d'erreur à afficher. */
export function plagesDuChoix(r: Recette, dureeSource: number, choix: SurQuoi, de: string, a: string): { zone: PlageTemps; coupe?: PlageTemps } | string {
  if (choix === 'toute') return { zone: { de: 0, a: dureeSource }, coupe: { de: 0, a: dureeSource } };
  if (choix === 'partie') {
    const t0 = lireHeure(de);
    const t1 = lireHeure(a);
    if (t0 === null || t1 === null) return TA.coupes.blancs.heureFausse;
    const p = { de: Math.max(0, t0), a: Math.min(dureeSource, t1) };
    if (p.a - p.de < 1) return TA.coupes.blancs.partieVide;
    return { zone: p, coupe: p };
  }
  const src = premiereVideo(r);
  const plans = r.plans.filter((p) => (p.src ?? src) === src);
  if (plans.length === 0) return TA.coupes.blancs.rien;
  return { zone: { de: Math.min(...plans.map((p) => p.de)), a: Math.max(...plans.map((p) => p.a)) } };
}

/** « 2 h 03 », « 41 min », ou « 1 min 12 s » pour une courte durée. */
export function dureeLisible(s: number): string {
  const r = Math.round(Math.max(0, s));
  if (r >= 3600) return `${Math.floor(r / 3600)} h ${String(Math.floor((r % 3600) / 60)).padStart(2, '0')}`;
  if (r >= 600) return `${Math.round(r / 60)} min`;
  if (r < 60) return `${r} s`;
  const sec = r % 60;
  return sec ? `${Math.floor(r / 60)} min ${sec} s` : `${Math.floor(r / 60)} min`;
}
