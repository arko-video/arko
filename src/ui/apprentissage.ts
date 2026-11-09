// Branchement de l'apprentissage des goûts (auto/apprentissage/gouts.ts) : après un montage auto, Arko garde son
// EMPREINTE (localStorage, par vidéo source) ; à l'export, il la compare à la version finale, met à jour les goûts et
// le dit en une phrase. Les montages suivants lisent `gouts` (densités, sons rejetés / aimés). Tout sur l'appareil.

import { signal } from '@preact/signals';
import { apprendre, comparer, empreinteDe, exempleDe, GOUTS_DEPART, lireGouts, resumeGouts, type Empreinte, type ExempleMonteur, type Gouts } from '../auto/apprentissage/gouts';
import { densitesVers, rythmeDe, type Rythme } from '../auto/apprentissage/rythme';
import type { Recette } from '../recette/types';

const CLE_GOUTS = 'arko.gouts';
const CLE_EMPREINTE = (emp: string) => `arko.empreinte.${emp}`;

function lire(cle: string): string | null {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
}
function ecrire(cle: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, v);
  } catch {
    /* stockage bloqué : l'apprentissage vaut pour cette session */
  }
}

export const gouts = signal<Gouts>(lireGouts(lire(CLE_GOUTS)));

const empDe = (r: Recette) => r.sources.find((s) => s.type === 'video')?.emp ?? null;

const CLE_MODELE = 'arko.modeleRythme';
const CLE_EXEMPLES = 'arko.exemplesMonteur';

/** D1. Les derniers exemples « Arko a proposé → Romain a fait » (le plus récent d'abord). */
export function lireExemples(): ExempleMonteur[] {
  try {
    const l = JSON.parse(lire(CLE_EXEMPLES) ?? '[]') as unknown;
    return Array.isArray(l) ? (l as ExempleMonteur[]).slice(0, 20) : [];
  } catch {
    return [];
  }
}

/** E4b. Le rythme d'un montage réussi pris comme modèle (null : aucun). */
export const modeleRythme = signal<Rythme | null>(((b) => {
  try {
    return b ? (JSON.parse(b) as Rythme) : null;
  } catch {
    return null;
  }
})(lire(CLE_MODELE)));

/** E4b. « Prendre ce montage comme modèle de rythme ». */
export function prendreModeleRythme(r: Recette | null): Rythme | null {
  if (!r) return null;
  const y = rythmeDe(r);
  modeleRythme.value = y;
  ecrire(CLE_MODELE, JSON.stringify(y));
  return y;
}

export function oublierModeleRythme() {
  modeleRythme.value = null;
  ecrire(CLE_MODELE, null);
}

/**
 * E4c. Après un montage auto : s'il y a un modèle, les densités font la moitié du chemin vers son rythme (elles
 * servent au montage SUIVANT ; celui-ci reste modifiable à la main).
 */
function rapprocherDuModele(r: Recette) {
  const m = modeleRythme.peek();
  if (!m) return;
  const vers = densitesVers(m, rythmeDe(r));
  const g = gouts.peek();
  const densite = { ...g.densite };
  for (const [f, k] of Object.entries(vers) as [keyof typeof densite, number][]) densite[f] = Math.round(Math.min(3, Math.max(0.25, densite[f] * (0.5 + 0.5 * k))) * 100) / 100;
  gouts.value = { ...g, densite };
  ecrire(CLE_GOUTS, JSON.stringify(gouts.peek()));
}

/** Après un montage auto (et après « Tout poser » des bruitages) : l'empreinte de ce qu'Arko a posé. */
export function memoriserMontageAuto(r: Recette | null) {
  const emp = r && empDe(r);
  if (!r || !emp) return;
  rapprocherDuModele(r);
  try {
    ecrire(CLE_EMPREINTE(emp), JSON.stringify(empreinteDe(r)));
  } catch (e) {
    console.warn('[Arko] empreinte du montage', e);
  }
}

/** À l'export : apprend de la version finale (une fois par montage auto). Renvoie le résumé, ou null. */
export function apprendreDeLExport(r: Recette): string[] | null {
  const emp = empDe(r);
  const brut = emp ? lire(CLE_EMPREINTE(emp)) : null;
  if (!emp || !brut) return null;
  try {
    const auto = JSON.parse(brut) as Empreinte;
    const obs = comparer(auto, empreinteDe(r));
    // D1 : l'exemple « proposé → fait » pour le monteur IA (les 20 derniers, sur l'appareil).
    const ex = [exempleDe(obs, new Date().toISOString().slice(0, 10)), ...lireExemples()].slice(0, 20);
    ecrire(CLE_EXEMPLES, JSON.stringify(ex));
    const g = apprendre(gouts.peek(), obs);
    gouts.value = g;
    ecrire(CLE_GOUTS, JSON.stringify(g));
    ecrire(CLE_EMPREINTE(emp), null);
    return resumeGouts(g);
  } catch (e) {
    console.warn('[Arko] apprentissage', e);
    return null;
  }
}

/** « Oublier ce qu'Arko a appris ». */
export function oublierGouts() {
  gouts.value = structuredClone(GOUTS_DEPART);
  ecrire(CLE_GOUTS, null);
}
