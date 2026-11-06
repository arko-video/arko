// Chapitres YouTube (16:9) — partie pure : temps dans la vidéo finale, règles de YouTube, texte à coller.
//
// Règles vérifiées le 4 novembre 2026 (https://support.google.com/youtube/answer/9884579) :
//  - le premier horodatage commence à 0:00 ;
//  - au moins 3 horodatages, dans l'ordre croissant ;
//  - chaque chapitre dure au moins 10 secondes.

import { dureesGeneriques, dureeTotale } from './generiques';
import type { Chapitre, Recette, Sec } from './types';

export const CHAPITRES = { min: 3, dureeMin: 10, nomMax: 60, max: 100 } as const;

/** « 83.4 » → « 1:23 » ; « 3725 » → « 1:02:05 » (secondes entières, comme YouTube). */
export function formatHorodatage(t: Sec): string {
  const s = Math.max(0, Math.floor(t + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * Chapitres placés dans la vidéo FINALE (avec l'intro) : décalés de la durée de l'intro.
 * Un chapitre posé au tout début du montage commence à 0:00 (il englobe l'intro). Triés.
 */
export function chapitresFinaux(r: Pick<Recette, 'chapitres' | 'intro' | 'outro' | 'plans'>): Chapitre[] {
  const decalage = dureesGeneriques(r).intro;
  return [...(r.chapitres ?? [])]
    .map((c) => ({ nom: c.nom, t: c.t <= 0.5 ? 0 : c.t + decalage }))
    .sort((a, b) => a.t - b.t);
}

/** Texte prêt à coller dans la description YouTube : une ligne « 0:00 Intro » par chapitre. */
export function texteChapitres(liste: readonly Chapitre[]): string {
  return liste.map((c) => `${formatHorodatage(c.t)} ${c.nom.trim() || 'Chapitre'}`).join('\n');
}

/** Durée de chaque chapitre (jusqu'au suivant, le dernier jusqu'à la fin de la vidéo). */
export function dureesChapitres(liste: readonly Chapitre[], dureeVideo: Sec): Sec[] {
  return liste.map((c, i) => (liste[i + 1]?.t ?? dureeVideo) - c.t);
}

/** Problèmes vis-à-vis des règles de YouTube (liste vide = les chapitres s'afficheront). Messages en français. */
export function verifierChapitres(liste: readonly Chapitre[], dureeVideo: Sec): string[] {
  const res: string[] = [];
  if (liste.length < CHAPITRES.min) {
    res.push(`YouTube demande au moins ${CHAPITRES.min} chapitres (tu en as ${liste.length}).`);
  }
  if (liste.length > 0 && formatHorodatage(liste[0]!.t) !== '0:00') {
    res.push(`Le premier chapitre doit commencer à 0:00 (il commence à ${formatHorodatage(liste[0]!.t)}).`);
  }
  const durees = dureesChapitres(liste, dureeVideo);
  liste.forEach((c, i) => {
    const d = durees[i]!;
    if (d < CHAPITRES.dureeMin) {
      res.push(`Le chapitre « ${c.nom.trim() || 'Chapitre'} » dure ${Math.max(0, Math.floor(d))} s : il en faut au moins ${CHAPITRES.dureeMin}.`);
    }
  });
  for (let i = 1; i < liste.length; i++) {
    if (formatHorodatage(liste[i]!.t) === formatHorodatage(liste[i - 1]!.t)) {
      res.push(`Deux chapitres commencent à ${formatHorodatage(liste[i]!.t)} : écarte-les.`);
      break;
    }
  }
  return res;
}

/** Tout en un pour l'interface : chapitres finaux, texte à copier et problèmes. */
export function bilanChapitres(r: Pick<Recette, 'chapitres' | 'intro' | 'outro' | 'plans'>) {
  const liste = chapitresFinaux(r);
  return { liste, texte: texteChapitres(liste), problemes: verifierChapitres(liste, dureeTotale(r)) };
}
