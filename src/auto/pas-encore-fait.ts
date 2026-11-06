// Échafaudage du Montage auto : une fonction pas encore écrite lève cette erreur (code stable « pas_encore_fait »).
// L'interface l'attrape et affiche « Bientôt disponible ». À retirer d'un fichier quand toutes ses fonctions sont faites.

import { ErreurArko } from '../moteur/erreurs';

export const CODE_PAS_ENCORE_FAIT = 'pas_encore_fait';

export function pasEncoreFait(quoi: string): never {
  throw new ErreurArko(`« ${quoi} » n'est pas encore fait.`, CODE_PAS_ENCORE_FAIT);
}

/** true si l'erreur vient d'une fonction pas encore écrite. */
export function estPasEncoreFait(e: unknown): boolean {
  return e instanceof ErreurArko && e.code === CODE_PAS_ENCORE_FAIT;
}
