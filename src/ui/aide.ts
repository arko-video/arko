// Aide (phase 5) : écran « Aide » (ouvert par « ? » sur Importer, avec son entrée d'historique) et conseils
// du tout premier lancement (vus une fois, retenus dans localStorage).

import { signal } from '@preact/signals';

/** Adresse du dépôt (code source et licence), facile à changer. */
export const DEPOT_CODE = 'https://github.com/arko-video/arko';

/** L'écran Aide est affiché (au-dessus d'Importer). */
export const aideOuverte = signal(false);

export function ouvrirAide() {
  if (aideOuverte.peek()) return;
  history.pushState({ arko: true, ecran: 'importer', aide: true }, '');
  aideOuverte.value = true;
  window.scrollTo(0, 0);
}

/** Appelé à chaque Retour / Avancer (navigation.ts). */
export function surNavigationAide(etat: unknown) {
  aideOuverte.value = (etat as { aide?: unknown } | null)?.aide === true;
}

const CLE_CONSEILS = 'arko.conseils.vus';

/** Les conseils du premier lancement ont déjà été vus (ou passés). Sans stockage : on ne les montre pas. */
export function conseilsVus(): boolean {
  try {
    return localStorage.getItem(CLE_CONSEILS) === '1';
  } catch {
    return true;
  }
}

export function marquerConseilsVus() {
  try {
    localStorage.setItem(CLE_CONSEILS, '1');
  } catch {
    // Stockage bloqué : ils reviendront au prochain lancement, tant pis.
  }
}
