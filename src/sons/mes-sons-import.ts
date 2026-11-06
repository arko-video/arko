// Import d'un pack de sons dans « Mes sons » : fichiers audio, vidéos courtes (seul leur son est gardé), .zip,
// ou un dossier entier. Le NOM DU DOSSIER devient l'étiquette (zip : chemin de l'entrée ; dossier : webkitRelativePath) ;
// un son sans dossier prend l'étiquette choisie. Chaque son est ouvert (vérifié, durée), puis gardé sur l'appareil,
// UN PAR UN : un pack de 500 Mo n'est jamais en mémoire d'un coup.
// Plafonds : 2 000 fichiers, 600 Mo, et la place que le navigateur accorde (× 1,2) ; sinon « importe dossier par dossier ».

import { estVideo, sonDeVideo } from '../auto/son/son-de-video';
import { ErreurArko } from '../moteur/erreurs';
import { fermerMedia, ouvrirMedia } from '../moteur/media';
import { garderMonSon, LIMITE_MES_SONS, nomDepuisFichier, placeLibreAppareil, placeUtilisee, type MonSon } from '../stockage/mes-sons';
import { TEXTES_SON_AUTO } from '../ui/auto/son/textes';
import { etiquettePour } from './dossiers';
import { DUREE_MAX_SON_S } from './import';
import { annoncesZip, EXTENSIONS_AUDIO, extension, parcourirZip, ZIP_MAX_FICHIERS } from './zip';

export interface BilanImport {
  gardes: MonSon[];
  /** Sons déjà dans Mes sons (même fichier). */
  deja: number;
  /** Fichiers ignorés ou illisibles. */
  refuses: number;
  /** Message à afficher si l'import s'est arrêté (Mes sons plein, .zip abîmé…). */
  erreur?: string;
}

/** Marge demandée au navigateur en plus de la taille du pack. */
export const MARGE_PLACE = 1.2;

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

/** Chemin d'un fichier choisi dans un dossier (« Pack/Laughs/x.mp3 »), ou "". */
function cheminDe(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
}

/** Ce que l'import va prendre : nombre de sons et octets annoncés (les .zip ne sont lus que par leur fin). */
export async function mesurerImport(fichiers: readonly File[]): Promise<{ nombre: number; octets: number; refuses: number }> {
  const res = { nombre: 0, octets: 0, refuses: 0 };
  for (const f of fichiers) {
    if (estZip(f)) {
      const a = await annoncesZip(f);
      res.nombre += a.annonces.length;
      res.octets += a.total;
      res.refuses += a.ignores;
    } else if (estSon(f) || estVideo(f)) {
      res.nombre++;
      res.octets += f.size;
    } else res.refuses++;
  }
  return res;
}

/** Message si le pack ne rentre pas (trop de fichiers, plus de 600 Mo, ou pas la place sur l'appareil), sinon null. */
export function refusPlace(nombre: number, octets: number, dejaPris: number, libre: number | null): string | null {
  if (nombre > ZIP_MAX_FICHIERS) return TEXTES_SON_AUTO.import.tropDeFichiers(ZIP_MAX_FICHIERS);
  if (dejaPris + octets > LIMITE_MES_SONS) return TEXTES_SON_AUTO.import.parDossier;
  if (libre !== null && octets * MARGE_PLACE > libre) return TEXTES_SON_AUTO.import.parDossier;
  return null;
}

/** Tous les fichiers à garder, un par un, avec leur chemin (zip : chemin de l'entrée ; dossier : chemin relatif). */
async function* aGarder(fichiers: readonly File[], refuser: () => void): AsyncGenerator<{ fichier: File; chemin: string }> {
  for (const f of fichiers) {
    if (estZip(f)) yield* parcourirZip(f, refuser);
    else if (estSon(f) || estVideo(f)) yield { fichier: f, chemin: cheminDe(f) };
    else refuser();
  }
}

/**
 * Importe des fichiers (sons, vidéos courtes, .zip, dossier) dans Mes sons. `etiquette` = celle des sons sans dossier.
 * Ne lève pas : tout est dans le bilan.
 */
export async function importerDansMesSons(fichiers: readonly File[], etiquette: string, surProgres?: (fait: number, total: number) => void): Promise<BilanImport> {
  const bilan: BilanImport = { gardes: [], deja: 0, refuses: 0 };
  let place: number;
  let total: number;
  try {
    const mesure = await mesurerImport(fichiers);
    total = mesure.nombre;
    place = await placeUtilisee();
    const refus = refusPlace(mesure.nombre, mesure.octets, place, await placeLibreAppareil());
    if (refus) return { ...bilan, refuses: mesure.refuses, erreur: refus };
  } catch (e) {
    bilan.erreur = e instanceof ErreurArko ? e.message : 'Impossible de lire ces fichiers.';
    return bilan;
  }
  let fait = 0;
  surProgres?.(0, total);
  try {
    for await (const { fichier, chemin } of aGarder(fichiers, () => bilan.refuses++)) {
      surProgres?.(fait++, total);
      let son = fichier;
      let duree: number;
      try {
        if (estVideo(fichier)) son = await sonDeVideo(fichier);
        duree = await verifierSon(son);
      } catch {
        bilan.refuses++;
        continue;
      }
      const r = await garderMonSon(son, { nom: nomDepuisFichier(fichier.name), etiquette: etiquettePour(chemin, etiquette), duree }, { placeUtilisee: place });
      if (r.nouveau) {
        bilan.gardes.push(r.son);
        place += r.son.taille;
      } else bilan.deja++;
    }
  } catch (e) {
    bilan.erreur = e instanceof ErreurArko ? e.message : 'Impossible de garder ces sons sur l\'appareil.';
  }
  surProgres?.(total, total);
  return bilan;
}
