// Intro et outro (YouTube 16:9) — partie pure : modèles, durées, durée totale de la vidéo exportée.
// L'outro sert d'« écran de fin » YouTube : YouTube permet d'y poser des éléments pendant les 5 à 20 dernières
// secondes, sur une vidéo d'au moins 25 s (vérifié le 4/11/2026 : https://support.google.com/youtube/answer/6388789).

import { dureePlan } from './temps';
import type { Generique, Recette, Sec } from './types';

export type ModeleGenerique = NonNullable<Generique['modele']>;
export const MODELES_GENERIQUE: readonly ModeleGenerique[] = ['abonne', 'neon', 'ecranFin'];

/** Durées permises (s). Outro : la fenêtre de l'écran de fin YouTube (5 à 20 s). */
export const DUREES_GENERIQUE = {
  intro: { min: 1, max: 10, defaut: 3 },
  outro: { min: 5, max: 20, defaut: 10 },
} as const;

/** Une vidéo doit durer au moins 25 s pour avoir un écran de fin YouTube. */
export const DUREE_MIN_ECRAN_FIN: Sec = 25;
export const CHAINE_MAX = 40;
export const TEXTE_GENERIQUE_MAX = 40;

export type Place = 'intro' | 'outro';

/** Texte par défaut d'un modèle, selon qu'il ouvre ou ferme la vidéo. */
export function texteParDefaut(place: Place): string {
  return place === 'outro' ? 'Abonne-toi !' : 'C\'est parti !';
}

/** Durée du corps du montage (plans gardés), sans intro ni outro. */
export function dureeCorps(r: Pick<Recette, 'plans'>): Sec {
  return Math.round(r.plans.reduce((s, p) => s + dureePlan(p), 0) * 100) / 100;
}

export function dureesGeneriques(r: Pick<Recette, 'intro' | 'outro'>): { intro: Sec; outro: Sec } {
  return { intro: r.intro?.dur ?? 0, outro: r.outro?.dur ?? 0 };
}

/** Durée de la vidéo exportée : intro + montage + outro. */
export function dureeTotale(r: Pick<Recette, 'plans' | 'intro' | 'outro'>): Sec {
  const g = dureesGeneriques(r);
  return Math.round((g.intro + dureeCorps(r) + g.outro) * 100) / 100;
}

/** Un générique sans rien à montrer (ni modèle ni vidéo) n'existe pas. */
export function generiqueValide(g: Generique | undefined): g is Generique {
  return !!g && g.dur > 0 && (!!g.modele || !!g.src);
}
