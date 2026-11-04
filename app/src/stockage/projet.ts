// Sauvegarde automatique du projet COURANT de « Mes montages » (voir projets.ts) dans IndexedDB.
// On ne stocke que la recette (quelques Ko), jamais la vidéo : à la reprise, l'utilisateur re-choisit le fichier.

import type { ProjetSauvegarde } from '../moteur/api';
import { enregistrerCourant, lireCourant, supprimerCourant } from './projets';
import { lireSauvegarde, vignetteValide } from './projets-index';

export async function sauverProjet(projet: ProjetSauvegarde): Promise<void> {
  const copie = JSON.parse(JSON.stringify(projet)) as ProjetSauvegarde;
  if (copie.vignette !== undefined && !vignetteValide(copie.vignette)) delete copie.vignette;
  await enregistrerCourant(copie);
}

/** Projet courant sauvegardé, ou null. Une sauvegarde illisible ou sans plan est ignorée. */
export async function chargerProjet(): Promise<ProjetSauvegarde | null> {
  try {
    return lireSauvegarde(await lireCourant());
  } catch {
    return null;
  }
}

/** Supprime le projet courant (de la liste « Mes montages » aussi). */
export async function effacerProjet(): Promise<void> {
  await supprimerCourant();
}
