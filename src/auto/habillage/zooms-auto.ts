// C. Zooms automatiques (dev 2), fonctions PURES : punch-in ×1,32 sur chaque PLAN qui contient un moment fort
// (pic, cri, rire, son > −16 dBFS, ou bruitage posé), zoom léger ×1,12 un plan sur trois pour le rythme, sinon ×1,0.
// Centre un peu au-dessus du milieu (y 0,45). Force : Doux / Normal / Fort. Résultat : un ZoomFixe (ou null) par plan.

import type { Plan, Recette, Sec, ZoomFixe } from '../../recette/types';
import type { SignauxSource } from '../types';

export type ForceZoomsAuto = 'doux' | 'normal' | 'fort';

/** Normal = valeurs vérifiées sur une vraie vidéo ; Doux et Fort : proposition à régler. */
export const FORCES_ZOOMS_AUTO: Readonly<Record<ForceZoomsAuto, { fort: number; leger: number }>> = {
  doux: { fort: 1.2, leger: 1.06 },
  normal: { fort: 1.32, leger: 1.12 },
  fort: { fort: 1.45, leger: 1.18 },
};
export const CENTRE_ZOOMS_AUTO = { x: 0.5, y: 0.45 };
/** Un plan sur `rythme` reçoit le zoom léger (s'il n'a pas déjà le fort). */
export const RYTHME_ZOOMS_AUTO = 3;
/** Son fort : RMS moyen sur 100 ms au-dessus de −16 dBFS. */
export const SON_FORT = { db: -16, fenetre: 0.1 };

/** Un moment fort, en temps source d'une source. */
export interface MomentFort {
  src: string;
  ts: Sec;
}

/** Débuts des passages où le RMS moyen sur 100 ms dépasse −16 dBFS (un moment par passage, pas un par pas). */
export function sonsForts(s: SignauxSource): Sec[] {
  const n = Math.max(1, Math.round(SON_FORT.fenetre / s.pas));
  const seuil = 10 ** (SON_FORT.db / 20);
  const res: Sec[] = [];
  let somme = 0;
  let dedans = false;
  for (let i = 0; i < s.rms.length; i++) {
    somme += s.rms[i]! ** 2;
    if (i >= n) somme -= s.rms[i - n]! ** 2;
    if (i < n - 1) continue;
    const fort = Math.sqrt(Math.max(0, somme) / n) > seuil;
    if (fort && !dedans) res.push(Math.round((i - n + 1) * s.pas * 100) / 100);
    dedans = fort;
  }
  return res;
}

/** Moments forts d'une recette : signaux de la source (pics, cris, rires, sons forts) + bruitages posés (sons en `ts`). */
export function momentsForts(recette: Recette, signaux: SignauxSource | null): MomentFort[] {
  const premiere = recette.sources.find((s) => s.type === 'video')?.id ?? '';
  const res: MomentFort[] = [];
  for (const son of recette.sons) {
    if (son.ts !== undefined && son.role !== 'section') res.push({ src: son.src ?? premiere, ts: son.ts });
  }
  if (signaux) {
    const src = signaux.src;
    for (const p of signaux.pics) res.push({ src, ts: p.ts });
    for (const c of signaux.cris) res.push({ src, ts: c.t });
    for (const r of signaux.rires) res.push({ src, ts: r.t });
    for (const ts of sonsForts(signaux)) res.push({ src, ts });
  }
  return res.sort((a, b) => a.ts - b.ts);
}

/** Un ZoomFixe (ou null = pas de zoom) par plan, dans l'ordre des plans. `premiere` = source par défaut des plans. */
export function planifierZoomsAuto(plans: readonly Plan[], moments: readonly MomentFort[], force: ForceZoomsAuto, premiere: string): (ZoomFixe | null)[] {
  const f = FORCES_ZOOMS_AUTO[force] ?? FORCES_ZOOMS_AUTO.normal;
  return plans.map((p, i) => {
    const src = p.src ?? premiere;
    const fort = moments.some((m) => m.src === src && m.ts >= p.de && m.ts < p.a);
    if (fort) return { force: f.fort, y: CENTRE_ZOOMS_AUTO.y };
    if (i % RYTHME_ZOOMS_AUTO === RYTHME_ZOOMS_AUTO - 1) return { force: f.leger, y: CENTRE_ZOOMS_AUTO.y };
    return null;
  });
}
