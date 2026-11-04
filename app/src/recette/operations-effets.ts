// Opérations « effets » (phase 3) : sons, transitions, zooms, son guide, sources audio.
// Mêmes règles que operations.ts : NOUVELLE recette normalisée, ou la recette d'origine si sans effet.
// CONTRAT : signatures fixées.
//
// Son importé : son `id` est celui de sa source audio (ex. « a1 »), et `src` reste la source VIDÉO de `ts`,
// comme pour les sons du catalogue.

import { trouverSon } from '../sons/catalogue';
import { compiler } from './chronologie';
import { SON, ZOOM } from './defauts';
import { normaliser } from './normaliser';
import { arrondir } from './temps';
import type { Plan, Recette, Sec, Son, SonGuide, Source, Transition, Zoom } from './types';

/**
 * Normalise ; renvoie la recette d'origine si rien n'a changé.
 * `nettoyer` : retire les sources audio que plus rien n'utilise (après avoir retiré un son ou changé le guide).
 */
function finir(origine: Recette, modifiee: Recette, nettoyer = false): Recette {
  const r = normaliser(modifiee, { sources: modifiee.sources }, { retirerSourcesAudioInutiles: nettoyer }).recette;
  return JSON.stringify(r) === JSON.stringify(origine) ? origine : r;
}

function indiceValide(liste: readonly unknown[], i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < liste.length;
}

/**
 * Fusionne une modification d'un élément posé (son, zoom) : donner `t` seul retire `ts` (et sa source),
 * donner `ts` seul retire `t`. Sinon le normaliseur garderait l'ancien `ts`, prioritaire.
 */
function fusionnerPose<T extends { t?: Sec; ts?: Sec; src?: string }>(ancien: T, partiel: Partial<T>): T {
  const res: T = { ...ancien, ...partiel };
  if (partiel.t !== undefined && partiel.ts === undefined) {
    delete res.ts;
    if (partiel.src === undefined) delete res.src;
  }
  if (partiel.ts !== undefined && partiel.t === undefined) delete res.t;
  return res;
}

/** Ajoute une source (ex. un son importé, type 'audio') si son id n'existe pas déjà. */
export function ajouterSource(recette: Recette, source: Source): Recette {
  if (!source?.id || recette.sources.some((s) => s.id === source.id)) return recette;
  return finir(recette, { ...recette, sources: [...recette.sources, { ...source }] });
}

/** Ajoute un effet sonore ; renvoie la recette et l'indice du son dans recette.sons (-1 si refusé). */
export function ajouterSon(recette: Recette, son: Son): { recette: Recette; i: number } {
  const r = finir(recette, { ...recette, sons: [...recette.sons, { vol: SON.vol, ...son }] });
  if (r === recette || r.sons.length !== recette.sons.length + 1) return { recette, i: -1 };
  return { recette: r, i: r.sons.length - 1 };
}

export function modifierSon(recette: Recette, i: number, partiel: Partial<Son>): Recette {
  if (!indiceValide(recette.sons, i)) return recette;
  const sons = recette.sons.map((s, k) => (k === i ? fusionnerPose(s, partiel) : s));
  return finir(recette, { ...recette, sons });
}

export function supprimerSon(recette: Recette, i: number): Recette {
  if (!indiceValide(recette.sons, i)) return recette;
  return finir(recette, { ...recette, sons: recette.sons.filter((_, k) => k !== i) }, true);
}

/** Copie d'une transition (null, 'coupe' ou type « coupe » = coupe franche = pas de champ). */
function copieTransition(trans: string | Transition | null): Plan['trans'] | undefined {
  if (trans === null || trans === undefined) return undefined;
  if (typeof trans === 'string') return trans === 'coupe' ? undefined : trans;
  return trans.type === 'coupe' ? undefined : { ...trans };
}

function avecTransition(p: Plan, trans: Plan['trans'] | undefined): Plan {
  const res: Plan = { ...p };
  if (trans === undefined) delete res.trans;
  else res.trans = typeof trans === 'string' ? trans : { ...trans };
  return res;
}

/** Transition d'ENTRÉE du plan i (i ≥ 1). null ou 'coupe' = coupe franche. */
export function choisirTransition(recette: Recette, i: number, trans: string | Transition | null): Recette {
  if (!indiceValide(recette.plans, i) || i === 0) return recette;
  const t = copieTransition(trans);
  return finir(recette, { ...recette, plans: recette.plans.map((p, k) => (k === i ? avecTransition(p, t) : p)) });
}

/** Même transition à toutes les coupes. */
export function transitionPartout(recette: Recette, trans: string | Transition | null): Recette {
  if (recette.plans.length < 2) return recette;
  const t = copieTransition(trans);
  return finir(recette, { ...recette, plans: recette.plans.map((p, k) => (k === 0 ? p : avecTransition(p, t))) });
}

/** Ajoute un zoom ; renvoie la recette et l'indice dans recette.zooms (-1 si refusé). */
export function ajouterZoom(recette: Recette, zoom: Zoom): { recette: Recette; i: number } {
  const r = finir(recette, { ...recette, zooms: [...recette.zooms, { ...zoom }] });
  if (r === recette || r.zooms.length !== recette.zooms.length + 1) return { recette, i: -1 };
  return { recette: r, i: r.zooms.length - 1 };
}

export function modifierZoom(recette: Recette, i: number, partiel: Partial<Zoom>): Recette {
  if (!indiceValide(recette.zooms, i)) return recette;
  const zooms = recette.zooms.map((z, k) => (k === i ? fusionnerPose(z, partiel) : z));
  return finir(recette, { ...recette, zooms });
}

export function supprimerZoom(recette: Recette, i: number): Recette {
  if (!indiceValide(recette.zooms, i)) return recette;
  return finir(recette, { ...recette, zooms: recette.zooms.filter((_, k) => k !== i) });
}

/** Définit (ou retire avec null) le son guide. */
export function definirGuide(recette: Recette, guide: SonGuide | null): Recette {
  if (guide === null) return recette.guide === null ? recette : finir(recette, { ...recette, guide: null }, true);
  // On ne nettoie que si un AUTRE guide était posé (son ancienne source ne sert peut-être plus).
  const remplace = recette.guide !== null && recette.guide.src !== guide.src;
  return finir(recette, { ...recette, guide: { ...guide } }, remplace);
}

/** Un élément posé sur la frise de sortie (pour les repères de la mini-frise). */
export interface Repere {
  /** Indice dans recette.sons ou recette.zooms. */
  i: number;
  t: Sec;
  dur: Sec;
}

/** Durée d'un son : celle du catalogue, ou celle de la source audio importée (0,5 s si inconnue). */
function dureeDuSon(recette: Recette, id: string): Sec {
  return trouverSon(id)?.duree ?? recette.sources.find((s) => s.id === id && s.type === 'audio')?.duree ?? 0.5;
}

/** Sons et zooms en temps de SORTIE (un son attaché à un temps source peut apparaître 0, 1 ou plusieurs fois). */
export function reperesEffets(recette: Recette): { sons: Repere[]; zooms: Repere[]; coupes: Sec[] } {
  const sc = compiler(recette);
  return {
    sons: sc.sons.map((p) => ({ i: recette.sons.indexOf(p.element), t: p.t, dur: dureeDuSon(recette, p.element.id) })),
    zooms: sc.zooms.map((p) => ({ i: recette.zooms.indexOf(p.element), t: p.t, dur: p.element.dur ?? ZOOM.dur })),
    coupes: sc.plans.slice(1).map((p) => arrondir(p.t0)),
  };
}
