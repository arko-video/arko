// C v4. Zooms du Best-of v4 (dev-habillage), fonctions PURES. Contrat : §1.7 « Zooms ».
//
// Pourquoi une v4 : les zooms d'avant mettent ×1,32 sur CHAQUE plan qui contient un « rire » d'ia/rires.ts (le débit des
// syllabes) ou un pic : 56 % des plans de la vraie session (diagnostic 4.8), le punch perd son sens. La main (montage
// validé) : ×1,32 sur 35 % des plans (les plus forts, et les plus longs : 5,3 s en médiane contre 2,3 s pour les ×1),
// ×1,12 sur 23 % (jamais deux de suite), ×1 sinon ; 36 de ses 52 punchlines sont dans un plan ×1,32.
// Donc : chaque plan reçoit une note (le moment le plus fort qu'il contient — cri, rire, son fort, exclamation, phrase
// forte —, une punchline dedans, un pic de son, sa longueur) ; les mieux notés passent à ×1,32 jusqu'à 35 % des plans ;
// parmi les autres, un sur trois environ passe à ×1,12 (≈ 23 % des plans), jamais deux ×1,12 l'un après l'autre.

import type { PlagePunchline, Plan, Sec, ZoomFixe } from '../../recette/types';
import type { SignauxSource } from '../types';
import type { GenreMoment, MomentV4 } from '../types-v4';
import { CENTRE_ZOOMS_AUTO, FORCES_ZOOMS_AUTO, sonsForts, type ForceZoomsAuto } from './zooms-auto';

export const ZOOMS_V4 = {
  /** Part des plans en zoom fort (×1,32) et en zoom léger (×1,12) : celles de la main. */
  partForts: 0.35,
  partLegers: 0.23,
  /** Points de la note d'un plan. */
  moment: 1,
  punchline: 0.6,
  pic: 0.4,
  sonFort: 0.3,
  /** Longueur : + `longueur` × min(1, durée / `dureeRef`). */
  longueur: 0.35,
  dureeRef: 8,
} as const;

/** Les moments qui méritent un punch-in (pas les « échanges », qui durent 10 s). */
export const GENRES_ZOOM: readonly GenreMoment[] = ['cri', 'fouRire', 'rire', 'sonFort', 'calmePuisPic', 'exclamation', 'phraseForte', 'juron'];

export interface EntreeZoomsV4 {
  /** Source par défaut des plans (la 1re vidéo). */
  premiere: string;
  moments: readonly MomentV4[];
  /** Punchlines choisies (temps source de `premiere`). */
  punchlines: readonly PlagePunchline[];
  signaux: SignauxSource | null;
  force: ForceZoomsAuto;
}

/** Note d'un plan pour le zoom fort (0 = rien de fort dedans ; la longueur départage). */
export function noteZoom(p: Pick<Plan, 'de' | 'a'>, e: Pick<EntreeZoomsV4, 'moments' | 'punchlines' | 'signaux'>, forts: readonly Sec[] = []): number {
  const Z = ZOOMS_V4;
  const dans = (t: Sec) => t >= p.de && t < p.a;
  const moment = e.moments.reduce((f, m) => (GENRES_ZOOM.includes(m.genre) && dans(m.t) ? Math.max(f, m.force) : f), 0);
  const punch = e.punchlines.some((x) => dans((x.ts + x.fin) / 2)) ? 1 : 0;
  const pic = e.signaux?.pics.reduce((z, x) => (dans(x.ts) ? Math.max(z, Math.min(1, x.z / 10)) : z), 0) ?? 0;
  const sonFort = forts.some(dans) ? 1 : 0;
  const longueur = Math.min(1, Math.max(0, p.a - p.de) / Z.dureeRef);
  return Z.moment * moment + Z.punchline * punch + Z.pic * pic + Z.sonFort * sonFort + Z.longueur * longueur;
}

/**
 * Un ZoomFixe (ou null) par plan, dans l'ordre des plans : ×fort sur les ≈ 35 % mieux notés, ×léger sur ≈ 23 % des
 * plans parmi les autres (jamais deux de suite), ×1 sinon. Les plans d'une autre source ou les éléments insérés ne
 * sont jamais zoomés. Pure.
 */
export function planifierZoomsV4(plans: readonly Plan[], e: EntreeZoomsV4): (ZoomFixe | null)[] {
  const f = FORCES_ZOOMS_AUTO[e.force] ?? FORCES_ZOOMS_AUTO.normal;
  const y = CENTRE_ZOOMS_AUTO.y;
  const n = plans.length;
  const res: (ZoomFixe | null)[] = plans.map(() => null);
  const zoomables = plans.map((p, i) => ({ p, i })).filter(({ p }) => !p.ins && (p.src ?? e.premiere) === e.premiere && p.a > p.de);
  if (zoomables.length === 0) return res;
  const forts = e.signaux ? sonsForts(e.signaux) : [];
  const notes = new Map(zoomables.map(({ p, i }) => [i, noteZoom(p, e, forts)]));
  // 1. Zoom fort : les mieux notés (à égalité : le plus long, puis le premier), 35 % des plans.
  const nForts = Math.round(ZOOMS_V4.partForts * n);
  const classes = [...zoomables].sort((x, y2) => notes.get(y2.i)! - notes.get(x.i)! || y2.p.a - y2.p.de - (x.p.a - x.p.de) || x.i - y2.i);
  const estFort = new Set(classes.slice(0, Math.min(nForts, classes.length)).map((x) => x.i));
  for (const i of estFort) res[i] = { force: f.fort, y };
  // 2. Zoom léger : réparti régulièrement parmi les autres, jamais deux de suite.
  const autres = zoomables.filter(({ i }) => !estFort.has(i));
  const nLegers = Math.min(autres.length, Math.round(ZOOMS_V4.partLegers * n));
  if (nLegers > 0) {
    const pas = nLegers / autres.length;
    let acc = 0.5; // le 1er léger tombe vers le milieu du 1er groupe (pas au tout début)
    let poses = 0;
    for (const { i } of autres) {
      acc += pas;
      if (poses >= nLegers || acc < 1 - 1e-9) continue;
      if (i > 0 && res[i - 1] && res[i - 1]!.force === f.leger) continue;
      res[i] = { force: f.leger, y };
      acc -= 1;
      poses++;
    }
  }
  return res;
}
