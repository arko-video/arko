// Fonctions pures : quelles parties de la source écouter, et comment retrouver le temps source
// d'un mot entendu dans une fenêtre (table des décalages).

import type { Recette, Sec } from '../recette/types';
import type { Plage } from './messages';

/** Un morceau de source collé dans une fenêtre : il commence à `decalage` secondes dans la fenêtre. */
export interface Piece {
  decalage: Sec;
  de: Sec;
  a: Sec;
}

/** Source des sous-titres : celle choisie dans la recette, sinon la première vidéo. */
export function sourceDesSousTitres(recette: Recette): string {
  return recette.sousTitres?.src ?? recette.sources.find((s) => s.type === 'video')?.id ?? '';
}

/**
 * Plages de temps source à écouter : les plans gardés de cette source, triés et fusionnés.
 * Un passage utilisé deux fois n'est écouté qu'une fois (les mots sont en temps source).
 * La vitesse du plan est ignorée : on écoute toujours à vitesse normale.
 */
export function plagesAEcouter(recette: Recette, src: string): Plage[] {
  const premiere = recette.sources.find((s) => s.type === 'video')?.id ?? '';
  const plages = recette.plans
    .filter((p) => (p.src ?? premiere) === src && p.a > p.de)
    .map((p) => ({ de: p.de, a: p.a }));
  return fusionner(plages);
}

/** Trie et fusionne les plages qui se touchent ou se chevauchent (à 50 ms près). */
export function fusionner(plages: Plage[]): Plage[] {
  const triees = [...plages].sort((x, y) => x.de - y.de);
  const res: Plage[] = [];
  for (const p of triees) {
    const derniere = res[res.length - 1];
    if (derniere && p.de <= derniere.a + 0.05) derniere.a = Math.max(derniere.a, p.a);
    else res.push({ ...p });
  }
  return res;
}

/** Durée totale des plages, en secondes. */
export function dureeTotale(plages: Plage[]): Sec {
  return plages.reduce((s, p) => s + (p.a - p.de), 0);
}

/**
 * Convertit un temps `t` de la fenêtre en temps source, grâce à la table des pièces.
 * Un temps tombé dans un blanc entre deux pièces est ramené au début de la pièce suivante.
 * Renvoie aussi l'indice de la pièce (pour borner la fin du mot).
 */
export function versSource(t: Sec, pieces: Piece[]): { ts: Sec; i: number } | null {
  if (pieces.length === 0) return null;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    const fin = p.decalage + (p.a - p.de);
    if (t < p.decalage) return { ts: p.de, i };
    if (t <= fin) return { ts: p.de + (t - p.decalage), i };
  }
  const der = pieces[pieces.length - 1]!;
  return { ts: der.a, i: pieces.length - 1 };
}

/**
 * Remet un mot [t0, t1] (temps de la fenêtre) en temps source.
 * La fin reste dans la même pièce que le début (un mot ne saute pas une coupe).
 */
export function motEnSource(t0: Sec, t1: Sec, pieces: Piece[]): { ts: Sec; fin: Sec } | null {
  const debut = versSource(t0, pieces);
  if (!debut) return null;
  const piece = pieces[debut.i]!;
  const fin = Math.min(piece.a, piece.de + Math.max(0, t1 - piece.decalage));
  const ts = arrondi(debut.ts);
  return { ts, fin: Math.max(ts + 0.02, arrondi(fin)) };
}

function arrondi(x: number): Sec {
  return Math.round(x * 100) / 100;
}
