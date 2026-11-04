// Gestes au doigt sur la frise : glisser = défiler · pincer = zoomer · toucher un plan = le sélectionner ·
// poignées = rogner (avec aimant sur la tête de lecture) · tête de lecture ou règle = se déplacer.

import { bornesDesPlans, rognerDebut, rognerFin } from '../../recette/operations';
import type { Recette } from '../../recette/types';
import { modifier, recetteTemporaire, selection, teteLecture } from '../etat';
import { auCentieme, formatTemps, IPS } from '../format';
import { aimanterRythme, vibrer } from '../guide';
import { chercher } from '../lecture';
import { borner, bornerDecalage, MARGE_FRISE as MARGE } from './frise-outils';

const SEUIL = 6;
const AIMANT_PX = 10;

export type Geste =
  | { type: 'defile'; id: number; x0: number; dec0: number; bouge: boolean; plan: number | null }
  | { type: 'tete'; id: number }
  | { type: 'regle'; id: number }
  | { type: 'debut' | 'fin'; id: number; i: number; x0: number; r0: Recette; dec0: number; aimante: boolean; cale?: boolean }
  | { type: 'pince'; d0: number; zoom0: number; dec0: number; t0: number };

/** Ce que la frise affiche à cet instant (calculé à chaque rendu). */
export interface VueFrise {
  pps: number;
  ppsAjuste: number;
  zoom: number;
  zoomMax: number;
  decalage: number;
  decalageGeste: number | null;
  largeurVue: number;
  largeurContenu: number;
  duree: number;
  xDe(t: number): number;
  tempsA(x: number): number;
}

export interface ContexteGestes {
  vue: VueFrise;
  element: HTMLDivElement | null;
  geste: { current: Geste | null };
  pointeurs: { current: Map<number, number> };
  /** Recette validée (point de départ d'un rognage) et durée de la source. */
  recette: Recette;
  dureeSource: number;
  setZoom(z: number): void;
  setDecalage(d: number): void;
  setDecalageGeste(d: number | null): void;
  setBulle(b: { x: number; texte: string } | null): void;
}

export function creerGestesFrise(c: ContexteGestes) {
  const v = c.vue;
  const xLocal = (e: PointerEvent) => e.clientX - (c.element?.getBoundingClientRect().left ?? 0);

  function placerTete(x: number) {
    const t = auCentieme(borner(v.tempsA(x), 0, v.duree));
    chercher(t);
    c.setBulle({ x: v.xDe(t), texte: formatTemps(t) });
  }

  function bas(e: PointerEvent) {
    c.pointeurs.current.set(e.pointerId, xLocal(e));
    c.element?.setPointerCapture(e.pointerId);
    if (c.pointeurs.current.size === 2) {
      // Deux doigts : on abandonne le geste en cours et on zoome.
      const g = c.geste.current;
      if (g?.type === 'debut' || g?.type === 'fin') recetteTemporaire.value = null;
      const [a, b] = [...c.pointeurs.current.values()];
      const t0 = ((a + b) / 2 + v.decalage - MARGE) / v.pps;
      c.geste.current = { type: 'pince', d0: Math.max(20, Math.abs(a - b)), zoom0: v.zoom, dec0: v.decalage, t0 };
      c.setDecalageGeste(null);
      c.setBulle(null);
      return;
    }
    if (c.pointeurs.current.size > 2) return;
    const cible = (e.target as Element).closest<HTMLElement>('[data-cible]');
    const type = cible?.dataset.cible;
    const x = xLocal(e);
    if (type === 'debut' || type === 'fin') {
      const i = Number(cible!.dataset.i);
      c.geste.current = { type, id: e.pointerId, i, x0: x, r0: c.recette, dec0: v.decalage, aimante: false };
      selection.value = i;
    } else if (type === 'tete') {
      c.geste.current = { type: 'tete', id: e.pointerId };
      const t = teteLecture.peek();
      c.setBulle({ x: v.xDe(t), texte: formatTemps(t) });
    } else if (type === 'regle') {
      c.geste.current = { type: 'regle', id: e.pointerId };
      placerTete(x);
    } else {
      const plan = type === 'plan' ? Number(cible!.dataset.i) : null;
      c.geste.current = { type: 'defile', id: e.pointerId, x0: x, dec0: v.decalage, bouge: false, plan };
    }
  }

  function bouge(e: PointerEvent) {
    if (!c.pointeurs.current.has(e.pointerId)) return;
    const x = xLocal(e);
    c.pointeurs.current.set(e.pointerId, x);
    const g = c.geste.current;
    if (!g) return;
    if (g.type === 'pince') {
      if (c.pointeurs.current.size < 2) return;
      const [a, b] = [...c.pointeurs.current.values()];
      const zoom = borner(g.zoom0 * (Math.max(20, Math.abs(a - b)) / g.d0), 1, v.zoomMax);
      const pps = v.ppsAjuste * zoom;
      c.setZoom(zoom);
      c.setDecalage(bornerDecalage(MARGE + g.t0 * pps - (a + b) / 2, 2 * MARGE + v.duree * pps, v.largeurVue));
      return;
    }
    if (g.id !== e.pointerId) return;
    if (g.type === 'defile') {
      const dx = x - g.x0;
      if (!g.bouge && Math.abs(dx) > SEUIL) g.bouge = true;
      if (g.bouge) c.setDecalage(bornerDecalage(g.dec0 - dx, v.largeurContenu, v.largeurVue));
    } else if (g.type === 'tete' || g.type === 'regle') {
      placerTete(x);
    } else {
      rogner(g, x);
    }
  }

  function rogner(g: Extract<Geste, { type: 'debut' | 'fin' }>, x: number) {
    const plan = g.r0.plans[g.i];
    const vit = plan.vit ?? 1;
    const bornes0 = bornesDesPlans(g.r0);
    const dx = x - g.x0;
    const bordSource = g.type === 'debut' ? plan.de : plan.a;
    let ts = bordSource + (dx / v.pps) * vit;
    // Aimant : la poignée colle à la tête de lecture si elle passe tout près.
    const tete = teteLecture.peek();
    const xTete0 = MARGE + tete * v.pps - g.dec0;
    const xBord0 = MARGE + bornes0[g.type === 'debut' ? g.i : g.i + 1] * v.pps - g.dec0;
    const proche = Math.abs(xBord0 + dx - xTete0) < AIMANT_PX && tete >= bornes0[g.i] && tete <= bornes0[g.i + 1];
    if (proche) {
      ts = bordSource + ((xTete0 - xBord0) / v.pps) * vit;
      if (!g.aimante && 'vibrate' in navigator) navigator.vibrate(8);
    }
    g.aimante = proche;
    // Rythme : la fin du plan (la coupe qui bouge) se cale sur un temps fort à ±0,12 s.
    const finSortie = bornes0[g.i] + (g.type === 'fin' ? ts - plan.de : plan.a - ts) / vit;
    const temps = proche ? null : aimanterRythme(finSortie);
    if (temps !== null) {
      ts = g.type === 'fin' ? plan.de + (temps - bornes0[g.i]) * vit : plan.a - (temps - bornes0[g.i]) * vit;
      if (!g.cale) vibrer();
    }
    g.cale = temps !== null;
    ts = auCentieme(borner(ts, 0, c.dureeSource));
    const nouvelle = g.type === 'debut' ? rognerDebut(g.r0, g.i, ts) : rognerFin(g.r0, g.i, ts);
    recetteTemporaire.value = nouvelle;
    const b = bornesDesPlans(nouvelle);
    const p = nouvelle.plans[g.i];
    if (g.type === 'debut') {
      // Le bord gauche suit le doigt : on décale la vue de ce que le plan a perdu ou gagné.
      const decalagePx = ((p.de - plan.de) / vit) * v.pps;
      c.setDecalageGeste(g.dec0 - decalagePx);
      c.setBulle({ x: borner(xBord0 + decalagePx, 0, v.largeurVue), texte: formatTemps(p.de) });
      requestAnimationFrame(() => chercher(b[g.i]));
    } else {
      c.setBulle({ x: borner(MARGE + b[g.i + 1] * v.pps - g.dec0, 0, v.largeurVue), texte: formatTemps(p.a) });
      requestAnimationFrame(() => chercher(Math.max(b[g.i], b[g.i + 1] - 1 / IPS)));
    }
  }

  function haut(e: PointerEvent) {
    c.pointeurs.current.delete(e.pointerId);
    const g = c.geste.current;
    if (!g) return;
    if (g.type === 'pince') {
      if (c.pointeurs.current.size === 0) c.geste.current = null;
      return;
    }
    if (g.id !== e.pointerId) return;
    c.geste.current = null;
    c.setBulle(null);
    if (g.type === 'defile' && !g.bouge && e.type === 'pointerup') {
      selection.value = g.plan === null || g.plan === selection.peek() ? null : g.plan;
    }
    if (g.type === 'debut' || g.type === 'fin') {
      const finale = recetteTemporaire.peek();
      recetteTemporaire.value = null;
      if (e.type === 'pointerup' && finale) modifier(() => finale);
      if (v.decalageGeste !== null) {
        c.setDecalage(bornerDecalage(v.decalageGeste, v.largeurContenu, v.largeurVue));
        c.setDecalageGeste(null);
      }
    }
  }

  return { bas, bouge, haut };
}
