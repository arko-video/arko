// Placement des textes sur l'image 9:16 : la BOÎTE entière reste dans la zone sûre de TikTok
// (comme au dessin), et un nouveau texte ne se pose pas sur un texte déjà visible. Fonctions pures.

import { boitesTextes, type Boite } from '../moteur/api';
import { ajouterTexte } from '../recette/operations';
import { TEXTE, ZONE_SURE } from '../recette/defauts';
import { gabaritDe } from '../recette/destination';
import type { Recette, Texte } from '../recette/types';
import { auCentieme } from './format';

/** Zone sûre en fractions de l'image (même source que le moteur) : haut, bas, côtés. TikTok par défaut. */
export const ZONE = { haut: ZONE_SURE.haut, bas: 1 - ZONE_SURE.bas, cote: ZONE_SURE.cote };
export type ZoneUI = typeof ZONE;

/** Zone sûre d'une recette, selon sa destination (YouTube 16:9, Short ou TikTok). */
export function zoneDe(r: Pick<Recette, 'destination'> | null | undefined): ZoneUI {
  const z = gabaritDe(r).zone;
  return { haut: z.haut, bas: 1 - z.bas, cote: z.cote };
}

/** Borne v dans [a, b] puis arrondit au 1/100 VERS L'INTÉRIEUR (l'arrondi ne doit pas faire sortir la boîte). */
function bornerArrondi(v: number, a: number, b: number): number {
  if (a > b) return auCentieme((a + b) / 2);
  const min = Math.ceil(a * 100 - 1e-9) / 100;
  const max = Math.floor(b * 100 + 1e-9) / 100;
  return min > max ? auCentieme((a + b) / 2) : Math.min(Math.max(auCentieme(v), min), max);
}

/** Centre (x, y) d'un texte de taille (l, h) borné pour que sa boîte reste dans la zone sûre. */
export function bornerCentre(x: number, y: number, l: number, h: number, zone: ZoneUI = ZONE): { x: number; y: number } {
  return {
    x: bornerArrondi(x, zone.cote + l / 2, 1 - zone.cote - l / 2),
    y: bornerArrondi(y, zone.haut + h / 2, zone.bas - h / 2),
  };
}

export function chevauche(a: Boite, b: Boite): boolean {
  return a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Hauteurs essayées pour un nouveau texte : sous l'accroche d'abord. */
export const HAUTEURS_NOUVEAU = [0.35, 0.5, 0.27, 0.6, 0.2, 0.43];

/** Boîtes des textes de r visibles pendant [t0, t1] (chacune prise à un instant où elle est affichée). */
function boitesPendant(r: Recette, t0: number, t1: number): Boite[] {
  const res: Boite[] = [];
  r.textes.forEach((x, i) => {
    const debut = Math.max(t0, x.t);
    if (debut >= Math.min(t1, x.t + (x.dur ?? TEXTE.dur))) return;
    const b = boitesTextes(r, debut + 0.01).find((bt) => bt.i === i);
    if (b) res.push(b);
  });
  return res;
}

/**
 * Ajoute un texte à une hauteur où il ne chevauche aucun texte visible en même temps.
 * Si aucune hauteur n'est libre, il prend la première (sous l'accroche).
 */
export function ajouterTexteLibre(r: Recette, texte: Partial<Texte> & { txt: string; t: number }): { recette: Recette; i: number } {
  const dur = texte.dur ?? TEXTE.dur;
  let autres: Boite[] = [];
  try {
    autres = boitesPendant(r, texte.t, texte.t + dur);
  } catch (e) {
    console.error(e);
  }
  let premier: { recette: Recette; i: number } | null = null;
  for (const y of HAUTEURS_NOUVEAU) {
    const res = ajouterTexte(r, { ...texte, x: texte.x ?? TEXTE.x, y });
    if (res.i < 0) return res;
    premier ??= res;
    let b: Boite | undefined;
    try {
      b = boitesTextes(res.recette, texte.t + 0.01).find((bt) => bt.i === res.i);
    } catch {
      b = undefined;
    }
    if (!b || !autres.some((a) => chevauche(a, b))) return res;
  }
  return premier ?? { recette: r, i: -1 };
}
