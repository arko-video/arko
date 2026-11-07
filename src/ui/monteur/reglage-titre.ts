// Réglage « Mettre un titre sur les clips » du monteur (A, v3, dev 1) : coché d'office, mémorisé sur l'appareil
// (localStorage `arko.monteur.titre` : '1' / '0'). Décoché : le monteur sans IA ne pose aucun texte sur les clips.

import { signal } from '@preact/signals';

export const CLE_TITRE = 'arko.monteur.titre';

function lire(): boolean {
  try {
    return localStorage.getItem(CLE_TITRE) !== '0';
  } catch {
    return true;
  }
}

export const titreSurClips = signal(lire());

export function reglerTitre(oui: boolean) {
  titreSurClips.value = oui;
  try {
    localStorage.setItem(CLE_TITRE, oui ? '1' : '0');
  } catch {
    // Stockage bloqué : le réglage vaut pour cette fois.
  }
}
