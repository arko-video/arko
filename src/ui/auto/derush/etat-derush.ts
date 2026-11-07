// État de l'écran « Passages pas retenus » (dev 1). Ouvert depuis Couper, Habiller → Couper et la revue du Best-of.

import { signal } from '@preact/signals';

/** Écran « Passages pas retenus » ouvert ? */
export const passagesOuverts = signal(false);

export function ouvrirPassages() {
  passagesOuverts.value = true;
}

export function fermerPassages() {
  passagesOuverts.value = false;
}
