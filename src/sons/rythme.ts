// Temps forts d'un son (pour caler les coupes sur le son guide).
// Le son est lu morceau par morceau et analysé au fil de l'eau (attaques.ts) : peu de mémoire, même pour 10 min.

import type { SourceOuverte } from '../moteur/api';
import type { Sec } from '../recette/types';
import { DetecteurAttaques } from './attaques';
import { parcourirSon } from './import';

/** Temps forts de la source, en secondes dans le fichier. [] si elle n'a pas de son lisible. */
export async function tempsForts(source: SourceOuverte): Promise<Sec[]> {
  let detecteur: DetecteurAttaques | null = null;
  let debut = 0; // temps du tout premier échantillon (souvent 0)
  await parcourirSon(source, (mono, frequence, t) => {
    if (!detecteur) {
      detecteur = new DetecteurAttaques(frequence);
      debut = t;
    }
    detecteur.ajouter(mono);
  });
  const fini = detecteur as DetecteurAttaques | null;
  return fini ? fini.terminer().map((t) => Math.round((t + debut) * 1000) / 1000) : [];
}
