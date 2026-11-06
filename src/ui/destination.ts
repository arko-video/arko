// Choix de la plateforme (écran de départ) : TikTok, YouTube 16:9 ou YouTube Short.
// Le choix est mémorisé sur l'appareil (localStorage) et sert aux NOUVEAUX montages ; chaque montage garde
// la sienne dans sa recette (champ `destination`). Les anciens montages, sans ce champ, restent TikTok.

import { computed, signal } from '@preact/signals';
import { dejaAuFormat, destinationDe, estDestination, gabaritDe, type Destination } from '../recette/destination';
import { recette, sources } from './etat';

export const CLE_DESTINATION = 'arko.destination';

function lire(): Destination | null {
  try {
    const v = localStorage.getItem(CLE_DESTINATION);
    return estDestination(v) ? v : null;
  } catch {
    return null;
  }
}

/** Plateforme choisie pour les nouveaux montages (null = jamais choisie : l'écran de départ s'affiche). */
export const destinationChoisie = signal<Destination | null>(lire());

/** true quand l'utilisateur a touché « Changer » : l'écran de départ s'affiche par-dessus l'accueil. */
export const choixOuvert = signal(false);

export function choisirDestination(d: Destination) {
  try {
    localStorage.setItem(CLE_DESTINATION, d);
  } catch {
    /* stockage bloqué : le choix vaut pour cette séance */
  }
  destinationChoisie.value = d;
  choixOuvert.value = false;
}

export function ouvrirChoix() {
  choixOuvert.value = true;
}

/** Destination et gabarit du montage OUVERT (TikTok sans montage). */
export const destinationProjet = computed(() => destinationDe(recette.value));
export const gabaritProjet = computed(() => gabaritDe(recette.value));

/** true si l'étape 3 est inutile : vidéo déjà verticale (TikTok, Short) ou déjà en 16:9 (YouTube). */
export const etapeCadrageSautee = computed(() => {
  const s = sources.value[0];
  if (!s) return false;
  const g = gabaritProjet.value;
  return g.paysage ? dejaAuFormat(s.infos.l, s.infos.h, g) : s.verticale;
});
