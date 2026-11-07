// Fonctions PURES pour la transcription facultative des moments : quelle partie de la source transcrire
// (v3 : de 15 s avant à 8 s après chaque pic, pour trouver la mise en place), puis ranger les mots entendus dans
// chaque moment (en TEMPS SOURCE).

import { recetteVide } from '../recette/defauts';
import type { Mot, Recette, Sec, Source } from '../recette/types';
import type { Moment } from './moments';

/** Ancienne fenêtre (±6 s), gardée pour information. */
export const AUTOUR_DU_PIC: Sec = 6;
/** v3 : on transcrit de 15 s avant à 8 s après chaque pic (jamais les 5 h) : la mise en place y est. */
export const ECOUTE_AVANT: Sec = 15;
export const ECOUTE_APRES: Sec = 8;

/** Pic d'un moment (son milieu s'il n'en a pas). */
export function picDe(m: Moment): Sec {
  return m.pic ?? (m.debut + m.fin) / 2;
}

/** Plage écoutée pour un moment : de 15 s avant à 8 s après le pic, dans la source. */
export function plageEcoutee(m: Moment, duree: Sec): { de: Sec; a: Sec } {
  const p = picDe(m);
  return { de: Math.max(0, p - ECOUTE_AVANT), a: Math.min(duree, p + ECOUTE_APRES) };
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
  // Les plages qui se chevauchent sont réunies : aucun passage n'est transcrit deux fois (pas de mots en double).
  const unies: { de: Sec; a: Sec }[] = [];
  for (const p of plans) {
    const der = unies[unies.length - 1];
    if (der && p.de <= der.a) der.a = Math.max(der.a, p.a);
    else unies.push({ ...p });
  }
  return { ...recetteVide(), sources: [{ ...source }], plans: unies };
}

/** Texte d'une liste de mots (« attends attends NON »). */
export function texteDesMots(mots: Mot[]): string {
  return mots.map((m) => m[0]).join(' ').replace(/\s+([,.!?…])/g, '$1').trim();
}

/** Range les mots (temps source) dans chaque moment : ceux entendus dans sa plage écoutée. Renvoie de nouveaux moments. */
export function rangerMots(moments: Moment[], mots: Mot[], duree: Sec): Moment[] {
  const tries = [...mots].sort((a, b) => a[1] - b[1]);
  return moments.map((m) => {
    const { de, a } = plageEcoutee(m, duree);
    const siens = tries.filter((w) => w[1] >= de - 0.05 && w[1] < a);
    if (siens.length === 0) return { ...m };
    return { ...m, mots: siens.map((w) => [...w] as Mot), extrait: texteDesMots(siens) };
  });
}
