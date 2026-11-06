// Écoute d'un son dans le panneau Sons (catalogue d'Arko, son importé ou son de « Mes sons »).
// Un seul son à la fois ; `enChargement` = clé du son qu'on prépare (pour afficher « chargement » sur sa ligne).

import { signal } from '@preact/signals';
import { ecouterSon, ErreurArko, fermerSource, ouvrirSourceAudio, type SourceOuverte } from '../moteur/api';
import { T } from '../textes-fr';
import { afficherToast } from './etat';

/** Clé (id) du son en cours de chargement, ou null. */
export const enChargement = signal<string | null>(null);

let arret: (() => void) | null = null;
/** Source ouverte juste pour écouter un son de Mes sons : fermée à l'écoute suivante. */
let sourceTemporaire: SourceOuverte | null = null;
/** Numéro de la dernière demande : une écoute plus ancienne qui finit de charger ne joue pas. */
let demande = 0;

export function arreterLecture() {
  arret?.();
  arret = null;
  if (sourceTemporaire) {
    fermerSource(sourceTemporaire);
    sourceTemporaire = null;
  }
}

function message(e: unknown): string {
  if (e instanceof ErreurArko) return e.message;
  console.error(e);
  return T.erreurInconnue;
}

/** Écoute un son du catalogue (id) ou un son importé (source). */
export async function ecouter(son: string | SourceOuverte, cle = typeof son === 'string' ? son : son.infos.id) {
  arreterLecture();
  const n = ++demande;
  enChargement.value = cle;
  try {
    const stop = await ecouterSon(son);
    if (n === demande) arret = stop;
    else stop();
  } catch (e) {
    if (n === demande) afficherToast(message(e));
  } finally {
    if (n === demande) enChargement.value = null;
  }
}

/** Écoute un fichier (son de Mes sons) sans l'ajouter au montage. */
export async function ecouterFichier(fichier: File, cle: string) {
  arreterLecture();
  const n = ++demande;
  enChargement.value = cle;
  try {
    const source = await ouvrirSourceAudio(fichier, 'ecoute');
    if (n !== demande) {
      fermerSource(source);
      return;
    }
    sourceTemporaire = source;
    arret = await ecouterSon(source);
  } catch (e) {
    if (n === demande) afficherToast(message(e));
  } finally {
    if (n === demande) enChargement.value = null;
  }
}
