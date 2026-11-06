// G. Titres de section à l'écran (dev 2), fonctions PURES : le titre de chaque chapitre YouTube (ou d'un titre posé
// à la main) s'affiche 2,2 s au début de la section, en bandeau gras avec une animation « pop » et un whoosh.
// Les titres deviennent des textes de rôle « section » (style « bandeau ») et des sons de rôle « section ».

import { ACCROCHE } from '../../recette/defauts';
import type { Recette, Sec } from '../../recette/types';

/** Un titre à afficher, en temps de SORTIE (sans compter l'intro, comme les chapitres). */
export interface TitreSection {
  t: Sec;
  nom: string;
}

/** Son posé avec chaque titre (catalogue d'Arko, CC0). */
export const SON_SECTION = 'whoosh.rapide';
/** Bandeau : position (haut de l'image, loin des sous-titres) et volume du whoosh. */
export const TITRE_SECTION = { y: 0.2, volSon: 0.7 };

/** Titres tirés des chapitres YouTube (le chapitre « 0:00 » compris s'il a un nom). */
export function titresDesChapitres(recette: Recette): TitreSection[] {
  return [...(recette.chapitres ?? [])]
    .map((c) => ({ t: c.t <= 0.5 ? 0 : c.t, nom: c.nom.trim() }))
    .filter((c) => c.nom.length > 0)
    .sort((a, b) => a.t - b.t);
}

/**
 * Fin de la zone réservée à l'accroche (0 à 2,5 s, ou plus si l'accroche posée dure plus) : un titre qui
 * commencerait avant chevaucherait l'accroche, il est sauté.
 */
export function finAccroche(recette: Recette): Sec {
  let fin = ACCROCHE.t + ACCROCHE.dur;
  for (const x of recette.textes) if (x.role === 'accroche') fin = Math.max(fin, x.t + (x.dur ?? ACCROCHE.dur));
  return fin;
}

/** Titres gardés : hors de l'accroche et avant la fin de la vidéo ; un seul par instant. */
export function titresAPoser(titres: readonly TitreSection[], recette: Recette, dureeVideo: Sec): TitreSection[] {
  const debut = finAccroche(recette);
  const res: TitreSection[] = [];
  for (const x of titres) {
    if (x.t < debut - 1e-6 || x.t >= dureeVideo) continue;
    if (res.some((y) => Math.abs(y.t - x.t) < 0.01)) continue;
    res.push(x);
  }
  return res;
}
