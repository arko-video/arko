// E1 / E2 (docs/monteur-ia/etapes.md) : les goûts appris appliqués aux RÉGLAGES du Montage express avant le montage :
// zooms plus forts / plus doux / aucun, punchlines éclaircies ou retirées, durée visée ajustée. Pur ; les réglages
// choisis à la main sur l'écran restent la base (on ne fait que les nuancer).

import type { ReglagesExpress } from '../express/express';
import type { ForceZoomsAuto } from '../habillage/zooms-auto';
import type { Gouts } from './gouts';

const ECHELLE: readonly (ForceZoomsAuto | null)[] = [null, 'doux', 'normal', 'fort'];

/** Zooms : un cran de moins sous ×0,6, aucun sous ×0,35 ; un cran de plus au-dessus de ×1,5. */
export function zoomsAvecGouts(z: ForceZoomsAuto | null, densite: number): ForceZoomsAuto | null {
  if (z === null) return null;
  if (densite <= 0.35) return null;
  const i = ECHELLE.indexOf(z);
  const j = densite <= 0.6 ? i - 1 : densite >= 1.5 ? i + 1 : i;
  return ECHELLE[Math.max(1, Math.min(ECHELLE.length - 1, j))] ?? z;
}

export function reglagesAvecGouts(reg: ReglagesExpress, g: Gouts): ReglagesExpress {
  if (g.n === 0) return reg;
  const d = g.densite;
  const res: ReglagesExpress = { ...reg, zooms: zoomsAvecGouts(reg.zooms, d.zooms) };
  if (d.punchlines <= 0.35) res.punchlines = false;
  // E2 : la durée visée suit la durée que Romain garde (×0,5 à ×1,5), bornes arrondies à 10 s.
  if (Math.abs(g.duree - 1) >= 0.05) {
    const k = g.duree;
    res.dureeVisee = { min: Math.round((reg.dureeVisee.min * k) / 10) * 10, max: Math.round((reg.dureeVisee.max * k) / 10) * 10 };
  }
  return res;
}

/** Punchlines éclaircies (densité < 1) : on en garde une part régulière, les plus longues d'abord à égalité. */
export function eclaircir<T>(liste: readonly T[], densite: number): T[] {
  if (densite >= 1 || liste.length === 0) return [...liste];
  const n = Math.max(1, Math.round(liste.length * densite));
  const pas = liste.length / n;
  return Array.from({ length: n }, (_, k) => liste[Math.min(liste.length - 1, Math.floor(k * pas))]!);
}
