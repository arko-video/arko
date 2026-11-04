// Fonctions PURES pour la transcription facultative des moments : quelle partie de la source transcrire
// (±6 s autour de chaque pic), puis ranger les mots entendus dans chaque moment (en TEMPS SOURCE).

import { recetteVide } from '../recette/defauts';
import type { Mot, Recette, Sec, Source } from '../recette/types';
import type { Moment } from './moments';

/** On transcrit seulement ±6 s autour de chaque pic (jamais les 5 h). */
export const AUTOUR_DU_PIC: Sec = 6;

/** Pic d'un moment (son milieu s'il n'en a pas). */
export function picDe(m: Moment): Sec {
  return m.pic ?? (m.debut + m.fin) / 2;
}

/** Plage écoutée pour un moment : ±6 s autour du pic, dans la source. */
export function plageEcoutee(m: Moment, duree: Sec): { de: Sec; a: Sec } {
  const p = picDe(m);
  return { de: Math.max(0, p - AUTOUR_DU_PIC), a: Math.min(duree, p + AUTOUR_DU_PIC) };
}

/**
 * Recette temporaire dont les plans sont les plages à écouter : c'est ce que sait transcrire
 * `transcrireRecette` (module sous-titres). Elle ne sert qu'à ça, elle n'est jamais montrée.
 */
export function recetteATranscrire(moments: Moment[], source: Source): Recette {
  const plans = moments
    .map((m) => plageEcoutee(m, source.duree))
    .filter((p) => p.a > p.de)
    .sort((x, y) => x.de - y.de);
  return { ...recetteVide(), sources: [{ ...source }], plans };
}

/** Texte d'une liste de mots (« attends attends NON »). */
export function texteDesMots(mots: Mot[]): string {
  return mots.map((m) => m[0]).join(' ').replace(/\s+([,.!?…])/g, '$1').trim();
}

/** Range les mots (temps source) dans chaque moment : ceux entendus à ±6 s du pic. Renvoie de nouveaux moments. */
export function rangerMots(moments: Moment[], mots: Mot[], duree: Sec): Moment[] {
  const tries = [...mots].sort((a, b) => a[1] - b[1]);
  return moments.map((m) => {
    const { de, a } = plageEcoutee(m, duree);
    const siens = tries.filter((w) => w[1] >= de - 0.05 && w[1] < a);
    if (siens.length === 0) return { ...m };
    return { ...m, mots: siens.map((w) => [...w] as Mot), extrait: texteDesMots(siens) };
  });
}
