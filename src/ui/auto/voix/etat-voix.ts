// État de l'écran « Qui parle ? » (dev 1). Ouvert depuis Habiller → Avatars, et par le Best-of (intégrateur).

import { signal } from '@preact/signals';

/** Écran « Qui parle ? » ouvert ? */
export const quiParleOuvert = signal(false);

export function ouvrirQuiParle() {
  quiParleOuvert.value = true;
}

export function fermerQuiParle() {
  quiParleOuvert.value = false;
}
