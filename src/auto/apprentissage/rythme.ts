// E4 (docs/monteur-ia/etapes.md) : le RYTHME d'un montage, en nombre par minute de vidéo finale — coupes, zooms,
// sons (bruitages + accents + à la main), mèmes / fonds verts, textes, transitions — et la durée moyenne d'un plan.
// Sert à « copier le rythme » d'un montage que Romain trouve réussi (E4b, E4c). Pur.

import { compiler } from '../../recette/chronologie';
import type { Recette, Sec } from '../../recette/types';
import type { Famille } from './gouts';

export interface Rythme {
  minutes: number;
  coupes: number;
  zooms: number;
  sons: number;
  memes: number;
  textes: number;
  transitions: number;
  /** Durée moyenne d'un plan (s). */
  plan: Sec;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function rythmeDe(r: Recette): Rythme {
  const sc = compiler(r);
  const min = Math.max(1 / 60, sc.duree / 60);
  const plans = sc.plans.filter((p) => !p.ins);
  const zooms = sc.zooms.length + plans.filter((p) => p.zoomFixe && p.zoomFixe.force >= 1.25).length;
  const sons = sc.sons.filter((s) => s.element.role !== 'section').length;
  return {
    minutes: r2(sc.duree / 60),
    coupes: r2(Math.max(0, sc.plans.length - 1) / min),
    zooms: r2(zooms / min),
    sons: r2(sons / min),
    memes: r2((r.incrustations?.length ?? 0) / min),
    textes: r2(sc.textes.length / min),
    transitions: r2(plans.filter((p) => p.trans).length / min),
    plan: plans.length > 0 ? r2(plans.reduce((t, p) => t + (p.t1 - p.t0), 0) / plans.length) : 0,
  };
}

/**
 * E4c : densités pour se rapprocher du modèle (rythme voulu / rythme obtenu par Arko), bornées ×0,25 à ×3. Une
 * famille absente des deux côtés ne bouge pas.
 */
export function densitesVers(modele: Rythme, arko: Rythme): Partial<Record<Famille, number>> {
  const k = (voulu: number, obtenu: number) => (obtenu <= 0 && voulu <= 0 ? null : Math.round(Math.min(3, Math.max(0.25, (voulu + 0.1) / (obtenu + 0.1))) * 100) / 100);
  const res: Partial<Record<Famille, number>> = {};
  const poser = (f: Famille, v: number | null) => v !== null && (res[f] = v);
  poser('zooms', k(modele.zooms, arko.zooms));
  poser('bruitages', k(modele.sons, arko.sons));
  poser('accents', k(modele.sons, arko.sons));
  poser('memes', k(modele.memes, arko.memes));
  poser('punchlines', k(modele.textes, arko.textes));
  poser('transitions', k(modele.transitions, arko.transitions));
  return res;
}
