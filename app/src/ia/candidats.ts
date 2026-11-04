// Fusion des signaux en moments candidats (fonction PURE) : on repère les événements (pics, calme → pic,
// cris, rires, changements de scène), on donne à chacun un score de 0 à 100, puis on garde les 40 meilleurs,
// espacés d'au moins 20 s, chacun avec une plage de 8 à 30 s autour du pic.

import type { Sec } from '../recette/types';
import { changementsDeScene, type Difference } from './images';
import type { Moment } from './moments';
import { detecterRires } from './rires';
import { calmeAvant, detecterCris, detecterPics, enDecibels, fondGlissant, lisser, type Pic, type Plage } from './signaux';

/** Tout ce que l'analyse a mesuré sur une source (c'est aussi ce qu'on garde dans le point de reprise). */
export interface Signaux {
  pas: Sec;
  duree: Sec;
  /** Volume (RMS) toutes les `pas` secondes. */
  enveloppe: Float32Array;
  /** Différence de chaque image clé avec la précédente. */
  diffs: Difference[];
}

export interface OptionsCandidats {
  /** Nombre de candidats gardés (40). */
  max?: number;
  /** Écart minimal entre deux pics gardés (20 s). */
  espacement?: Sec;
  dureeMin?: Sec;
  dureeMax?: Sec;
}

export interface Evenements {
  pics: (Pic & { calme: boolean })[];
  cris: Plage[];
  rires: Plage[];
  scenes: Difference[];
}

/** Détecte tous les événements d'une source à partir de ses signaux. */
export function evenements(s: Signaux): Evenements {
  const { pas, enveloppe: env } = s;
  const db = lisser(enDecibels(env), 5);
  const fond = fondGlissant(db, Math.round(30 / pas), Math.round(0.3 / pas));
  const pics = detecterPics(db, fond, pas).map((p) => ({ ...p, calme: calmeAvant(db, p, pas) }));
  return {
    pics,
    cris: detecterCris(db, env, fond, pas),
    rires: detecterRires(env, db, fond, pas),
    scenes: changementsDeScene(s.diffs),
  };
}

/** Premier indice d'une liste triée par `t` dont le temps est ≥ a (recherche par dichotomie). */
function premierApres<T extends { t: Sec }>(liste: T[], a: Sec): number {
  let bas = 0;
  let haut = liste.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (liste[m]!.t < a) bas = m + 1;
    else haut = m;
  }
  return bas;
}

/** Éléments de `liste` (triée par t) dont le temps est dans [a, b]. */
function entre<T extends { t: Sec }>(liste: T[], a: Sec, b: Sec): T[] {
  const res: T[] = [];
  for (let i = premierApres(liste, a); i < liste.length && liste[i]!.t <= b; i++) res.push(liste[i]!);
  return res;
}

/** Plage (cri, rire) qui chevauche [a, b], la plus forte. */
function plageVers(liste: Plage[], a: Sec, b: Sec): Plage | null {
  let meilleure: Plage | null = null;
  for (const p of entre(liste, a - 4, b + 4)) {
    if (p.fin >= a && p.debut <= b && (!meilleure || p.force > meilleure.force)) meilleure = p;
  }
  return meilleure;
}

/** Un candidat avant sélection. */
interface Brut {
  pic: Sec;
  score: number;
  etiquettes: string[];
  raison: string;
  finAction: Sec;
  calme: boolean;
}

/** Évalue l'événement placé en `t` : ce qu'il y a autour, son score et sa raison en français. */
function evaluer(t: Sec, ev: Evenements): Brut {
  const pics = entre(ev.pics, t - 1, t + 1);
  const zMax = pics.reduce((m, p) => Math.max(m, p.z), 0);
  const calme = pics.some((p) => p.calme);
  const cri = plageVers(ev.cris, t - 1.5, t + 1.5);
  const rire = plageVers(ev.rires, t - 1, t + 6);
  const scene = entre(ev.scenes, t - 2, t + 2).length > 0;

  let score = 0;
  if (zMax > 0) score += Math.min(45, 15 + (zMax - 3) * 4);
  if (calme) score += 25;
  if (cri) score += 15 + 10 * cri.force;
  if (rire) score += 15 + 10 * rire.force;
  if (scene) score += 5;

  const etiquettes: string[] = [];
  if (calme) etiquettes.push('silence>pic');
  else if (zMax > 0) etiquettes.push('pic');
  if (cri) etiquettes.push('cri');
  if (rire) etiquettes.push('rire');
  if (scene) etiquettes.push('scene');

  let raison = calme ? 'Gros pic de son après un calme' : cri ? 'Cri' : zMax > 0 ? 'Pic de son' : rire ? 'Rires' : 'Moment fort';
  if (cri && raison !== 'Cri') raison += ', avec un cri';
  if (rire && raison !== 'Rires') raison += ', puis des rires';
  if (scene) raison += ' (changement de scène)';

  const finAction = Math.max(t, cri?.fin ?? t, rire?.fin ?? t);
  return { pic: t, score: Math.round(Math.min(100, Math.max(0, score))), etiquettes, raison, finAction, calme };
}

/** Plage [debut, fin] de durée comprise entre `min` et `max`, gardée dans [0, duree]. */
export function cadrer(debut: Sec, fin: Sec, duree: Sec, min: Sec, max: Sec): { debut: Sec; fin: Sec } {
  let d = debut;
  let f = Math.max(fin, d + min);
  if (f - d > max) f = d + max;
  if (d < 0) {
    f -= d;
    d = 0;
  }
  if (f > duree) {
    d = Math.max(0, d - (f - duree));
    f = duree;
  }
  return { debut: arrondi(d), fin: arrondi(f) };
}

function arrondi(x: number): Sec {
  return Math.round(x * 100) / 100;
}

/**
 * Les meilleurs moments candidats d'une source, triés par début, avec un identifiant « m01 »…
 * Plage : 5 s avant le pic (6 s après un calme, pour montrer le calme), jusqu'à 4 s après la fin
 * de l'action (cri, rires), puis bornée entre 8 et 30 s.
 */
export function candidats(s: Signaux, o: OptionsCandidats = {}): Moment[] {
  const max = o.max ?? 40;
  const espacement = o.espacement ?? 20;
  const ev = evenements(s);
  // Chaque pic, cri ou rire est un point de départ ; ses voisins enrichissent son score.
  const departs = [...ev.pics.map((p) => p.t), ...ev.cris.map((c) => c.t), ...ev.rires.map((r) => r.t)];
  const bruts = departs.map((t) => evaluer(t, ev)).sort((a, b) => b.score - a.score || a.pic - b.pic);
  const choisis: Brut[] = [];
  for (const b of bruts) {
    if (choisis.length >= max) break;
    if (choisis.every((c) => Math.abs(c.pic - b.pic) >= espacement)) choisis.push(b);
  }
  const moments = choisis.map((b) => {
    const avant = b.calme ? 6 : 5;
    const plage = cadrer(b.pic - avant, b.finAction + 4, s.duree, o.dureeMin ?? 8, o.dureeMax ?? 30);
    const m: Moment = { ...plage, score: b.score, etiquettes: b.etiquettes, pic: arrondi(b.pic), raison: b.raison };
    return m;
  });
  moments.sort((a, b) => a.debut - b.debut);
  const largeur = Math.max(2, String(moments.length).length);
  moments.forEach((m, i) => (m.id = `m${String(i + 1).padStart(largeur, '0')}`));
  return moments;
}
