// Lien entre l'aperçu (un seul lecteur du moteur à la fois) et le reste de l'interface.

import { signal } from '@preact/signals';
import type { Lecteur } from '../moteur/api';
import { dureeFinale } from '../recette/operations';
import { recetteAffichee, teteLecture } from './etat';

/** L'aperçu est en train de jouer. */
export const enLecture = signal(false);

let lecteur: Lecteur | null = null;

export function brancherLecteur(l: Lecteur | null) {
  lecteur = l;
  if (!l) enLecture.value = false;
}

/** Durée de la vidéo finale affichée (0 sans recette). */
export function dureeAffichee(): number {
  const r = recetteAffichee.peek();
  return r ? dureeFinale(r) : 0;
}

/** Place la tête de lecture au temps de sortie t (borné à la vidéo). */
export function chercher(t: number) {
  const d = dureeAffichee();
  const borne = Math.min(Math.max(0, t), d);
  teteLecture.value = borne;
  lecteur?.aller(borne);
}

export function basculerLecture() {
  if (!lecteur) return;
  if (lecteur.enLecture) lecteur.pause();
  else {
    // Relancer depuis le début si on est à la fin.
    if (lecteur.temps >= lecteur.duree - 0.05) lecteur.aller(lecteur.debut);
    lecteur.lire();
  }
}

/** Va au début de l'intro ou de l'outro (YouTube) et lance la lecture : on voit ce qui sera exporté. */
export function lireGenerique(place: 'intro' | 'outro') {
  const r = recetteAffichee.peek();
  if (!r || !r[place]) return;
  const t = place === 'intro' ? -r[place].dur : dureeFinale(r);
  mettreEnPause();
  teteLecture.value = t;
  lecteur?.aller(t);
  lecteur?.lire();
}

export function mettreEnPause() {
  if (lecteur?.enLecture) lecteur.pause();
}

let minuteurExtrait: ReturnType<typeof setTimeout> | undefined;

/**
 * Joue l'aperçu de `de` à `a` (temps de sortie) puis s'arrête et appelle `fini` : sert à écouter un bruitage proposé
 * dans son contexte (la recette d'essai est chargée par l'aperçu à l'image suivante).
 */
export function lireExtrait(de: number, a: number, fini?: () => void) {
  clearTimeout(minuteurExtrait);
  const l = lecteur;
  if (!l) return void fini?.();
  if (l.enLecture) l.pause();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const debut = Math.max(0, de);
      teteLecture.value = debut;
      l.aller(debut);
      l.lire();
      minuteurExtrait = setTimeout(() => {
        if (l.enLecture) l.pause();
        fini?.();
      }, Math.max(0.2, a - debut) * 1000);
    }),
  );
}
