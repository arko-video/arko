// État de l'atelier des chibis (D, dev 3). Ouvert depuis Ma bibliothèque → Chibis, et par ChoixChibi (« Qui parle ? »,
// « Insérer ici → Un chibi ») : `pour` reçoit alors le chibi choisi.

import { signal } from '@preact/signals';
import type { DefinitionChibi } from '../../../recette/types';

export interface DemandeAtelier {
  /** Chibi à modifier (id de Ma bibliothèque), ou null pour un nouveau. */
  id: string | null;
  /** Chibi de départ (celui de la personne, par exemple) quand ce n'est pas un chibi de Ma bibliothèque. */
  def?: DefinitionChibi;
  /** Appelé avec le chibi choisi (et son id dans Ma bibliothèque s'il y est gardé). */
  pour?: (def: DefinitionChibi, bib?: string) => void;
}

export const atelierOuvert = signal<DemandeAtelier | null>(null);

/** Ma bibliothèque montre le rayon « Chibis » (à la place du rayon actif). */
export const rayonChibisActif = signal(false);

export function ouvrirAtelier(d: DemandeAtelier = { id: null }) {
  atelierOuvert.value = d;
}

export function fermerAtelier() {
  atelierOuvert.value = null;
}
