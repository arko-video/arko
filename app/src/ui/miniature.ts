// État de l'écran Miniature (YouTube) : ouvert depuis l'étape Exporter, réglages gardés le temps de la séance.

import { signal } from '@preact/signals';
import type { ReglagesMiniature } from '../moteur/api';
import { TY } from '../textes-youtube';
import { quandProjetQuitte } from './etat';

export const miniatureOuverte = signal(false);

export const REGLAGES_DEPART: ReglagesMiniature = {
  t: 0,
  texte: TY.miniature.texteParDefaut,
  style: 'alerte',
  position: 'haut',
  emoji: '',
  fleche: 'aucune',
};

export const reglagesMiniature = signal<ReglagesMiniature>({ ...REGLAGES_DEPART });

quandProjetQuitte(() => {
  miniatureOuverte.value = false;
  reglagesMiniature.value = { ...REGLAGES_DEPART };
});

export function reglerMiniature(partiel: Partial<ReglagesMiniature>) {
  reglagesMiniature.value = { ...reglagesMiniature.peek(), ...partiel };
}
