// Import de plusieurs sons d'un coup dans « Mes sons » : fichiers audio et/ou .zip de sons.
// Chaque son est d'abord ouvert (pour vérifier qu'il se lit et connaître sa durée), puis gardé sur l'appareil.

import { ErreurArko } from '../moteur/erreurs';
import { fermerMedia, ouvrirMedia } from '../moteur/media';
import { garderMonSon, nomDepuisFichier, type MonSon } from '../stockage/mes-sons';
import { DUREE_MAX_SON_S } from './import';
import { EXTENSIONS_AUDIO, extension, lireZip, ZIP_MAX_FICHIERS } from './zip';

export interface BilanImport {
  gardes: MonSon[];
  /** Sons déjà dans Mes sons (même fichier). */
  deja: number;
  /** Fichiers ignorés ou illisibles. */
  refuses: number;
  /** Message à afficher si l'import s'est arrêté (Mes sons plein, .zip abîmé…). */
  erreur?: string;
}

/** Est-ce un .zip ? */
export function estZip(f: File): boolean {
  return extension(f.name) === 'zip' || f.type === 'application/zip' || f.type === 'application/x-zip-compressed';
}

/** Est-ce un son qu'on sait reconnaître (type audio, ou extension audio connue) ? */
export function estSon(f: File): boolean {
  return f.type.startsWith('audio/') || !!EXTENSIONS_AUDIO[extension(f.name)];
}

/** Durée d'un son, en vérifiant qu'il se lit. Lève ErreurArko si ce n'est pas un son lisible ou s'il est trop long. */
export async function verifierSon(f: File): Promise<number> {
  const media = await ouvrirMedia(f, 'audio');
  try {
    if (!media.sinkAudio) throw new ErreurArko('Ce fichier n\'a pas de son lisible.', 'pas_de_son');
    if (media.duree > DUREE_MAX_SON_S) throw new ErreurArko('Ce son dure plus de 10 minutes.', 'trop_long');
    return Math.round(media.duree * 100) / 100;
  } finally {
    fermerMedia(media);
  }
}

/** Ouvre les .zip et garde les sons (au plus 200 en tout). */
export async function deballer(fichiers: readonly File[]): Promise<{ sons: File[]; refuses: number }> {
  const sons: File[] = [];
  let refuses = 0;
  for (const f of fichiers) {
    if (estZip(f)) {
      const r = await lireZip(f);
      sons.push(...r.fichiers);
      refuses += r.ignores;
    } else if (estSon(f)) sons.push(f);
    else refuses++;
  }
  if (sons.length > ZIP_MAX_FICHIERS) {
    refuses += sons.length - ZIP_MAX_FICHIERS;
    sons.length = ZIP_MAX_FICHIERS;
  }
  return { sons, refuses };
}

/** Importe des fichiers (sons et .zip) dans Mes sons, avec l'étiquette choisie. Ne lève pas : tout est dans le bilan. */
export async function importerDansMesSons(fichiers: readonly File[], etiquette: string, surProgres?: (fait: number, total: number) => void): Promise<BilanImport> {
  const bilan: BilanImport = { gardes: [], deja: 0, refuses: 0 };
  let sons: File[];
  try {
    const d = await deballer(fichiers);
    sons = d.sons;
    bilan.refuses += d.refuses;
  } catch (e) {
    bilan.erreur = e instanceof ErreurArko ? e.message : 'Impossible de lire ces fichiers.';
    return bilan;
  }
  for (let i = 0; i < sons.length; i++) {
    surProgres?.(i, sons.length);
    const f = sons[i]!;
    let duree: number;
    try {
      duree = await verifierSon(f);
    } catch {
      bilan.refuses++;
      continue;
    }
    try {
      const r = await garderMonSon(f, { nom: nomDepuisFichier(f.name), etiquette, duree });
      if (r.nouveau) bilan.gardes.push(r.son);
      else bilan.deja++;
    } catch (e) {
      bilan.erreur = e instanceof ErreurArko ? e.message : 'Impossible de garder ces sons sur l\'appareil.';
      break;
    }
  }
  surProgres?.(sons.length, sons.length);
  return bilan;
}
