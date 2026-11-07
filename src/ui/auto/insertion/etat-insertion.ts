// État de « Insérer ici » (B, dev 2) et du choix des pistes audio (E). Ouverts depuis Couper, Habiller → Couper,
// et à l'import d'une vidéo à plusieurs pistes.

import { signal } from '@preact/signals';

/** Ce qu'on peut insérer (le « mème » est une vidéo du rayon Mèmes de Ma bibliothèque). */
export type ChoixInsertion = 'clip' | 'meme' | 'image' | 'carton' | 'chibi';
export const CHOIX_INSERTION: readonly ChoixInsertion[] = ['clip', 'meme', 'image', 'carton', 'chibi'];

/** Panneau « Insérer quoi ? » ouvert (et d'où, et à quel temps de sortie). */
export const insertionOuverte = signal<{ lieu: 'couper' | 'habiller'; t: number } | null>(null);
/** Deuxième étape : les réglages de l'élément choisi (null = la liste des choix). */
export const choixInsertion = signal<ChoixInsertion | null>(null);

export function ouvrirInsertion(lieu: 'couper' | 'habiller', t: number) {
  choixInsertion.value = null;
  insertionOuverte.value = { lieu, t };
}

export function fermerInsertion() {
  insertionOuverte.value = null;
  choixInsertion.value = null;
}

/** Vidéo à plusieurs pistes qui attend le choix des pistes (id de la source), ou null. */
export const pistesAChoisir = signal<string | null>(null);

export function fermerPistes() {
  pistesAChoisir.value = null;
}
