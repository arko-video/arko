// Frise au clavier : flèches = ±1 image, Page haut/bas = ±1 s, Début/Fin. Toujours sur la grille des images.

import { rognerDebut, rognerFin } from '../../recette/operations';
import { modifier } from '../etat';
import { IPS, pasImage } from '../format';
import { chercher } from '../lecture';

/** Tête de lecture. Renvoie true si la touche a été utilisée. */
export function clavierTete(e: KeyboardEvent, tete: number, duree: number): boolean {
  const pas: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: IPS, PageDown: -IPS };
  if (e.key in pas) chercher(pasImage(tete, pas[e.key]));
  else if (e.key === 'Home') chercher(0);
  else if (e.key === 'End') chercher(duree);
  else return false;
  e.preventDefault();
  return true;
}

/** Poignée de début ou de fin du plan i : flèches = ±1 image (en temps source). */
export function clavierPoignee(e: KeyboardEvent, type: 'debut' | 'fin', i: number) {
  const sens = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!sens) return;
  e.preventDefault();
  modifier((r) => {
    const p = r.plans[i];
    if (!p) return r;
    // Le pas suit la vitesse du plan : une image de sortie = vit images source.
    const n = sens * (p.vit ?? 1);
    return type === 'debut' ? rognerDebut(r, i, pasImage(p.de, n)) : rognerFin(r, i, pasImage(p.a, n));
  });
}
