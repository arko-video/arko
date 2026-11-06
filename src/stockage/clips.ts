// « Ma bibliothèque », rayons Fonds verts et Mèmes : les VIDÉOS gardées sur l'appareil pour tous les montages.
// Fiches (petites) dans une base IndexedDB à part ; fichiers ENTIERS dans l'OPFS (stockage privé du navigateur,
// écrit par morceaux, lu par morceaux), sinon dans IndexedDB. Jamais envoyés, jamais nettoyés automatiquement.
// Plafond : la place que le navigateur accorde à Arko (navigator.storage.estimate) ; sinon un message clair.

import { createStore, del, get, getMany, keys, set } from 'idb-keyval';
import { ErreurArko } from '../moteur/erreurs';
import { calculerEmpreinte } from './fichiers';
import { nettoyerNom } from './mes-sons';

export type RayonVideo = 'fondsVerts' | 'memes';

/** Fiche d'un clip gardé (sans ses données). */
export interface MonClip {
  /** « v » + empreinte du fichier : le même fichier n'est jamais gardé deux fois. */
  id: string;
  rayon: RayonVideo;
  nom: string;
  /** Nom du dossier d'origine (« Boutons »), ou "". */
  etiquette: string;
  type: string;
  taille: number;
  duree: number;
  /** Dimensions affichées. */
  l: number;
  h: number;
  /** Fond vert (ou bleu) trouvé sur les bords d'une image du clip ; null = pas de fond uni. */
  fond: { couleur: [number, number, number]; type: 'vert' | 'bleu' } | null;
  /** Petite image (data:image/jpeg), facultative. */
  vignette?: string;
  /** Où est rangé le fichier. */
  ou: 'opfs' | 'idb';
  ajouteLe: number;
}

/** Marge gardée libre sur l'appareil en plus du fichier (exports, montages). */
export const MARGE_APPAREIL = 200 * 1024 * 1024;

let base: ReturnType<typeof createStore> | null = null;
const magasin = () => (base ??= createStore('arko-bibliotheque', 'clips'));
const cleFiche = (id: string) => `fiche:${id}`;
const cleFichier = (id: string) => `fichier:${id}`;
const DOSSIER_OPFS = 'bibliotheque';

async function dossierOpfs(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const racine = await navigator.storage?.getDirectory?.();
    return racine ? await racine.getDirectoryHandle(DOSSIER_OPFS, { create: true }) : null;
  } catch {
    return null;
  }
}

/** Tous les clips gardés, du plus récent au plus ancien (`rayon` : seulement ceux de ce rayon). */
export async function listerClips(rayon?: RayonVideo): Promise<MonClip[]> {
  const cles = (await keys<string>(magasin())).filter((k) => k.startsWith('fiche:'));
  const fiches = (await getMany<MonClip>(cles, magasin())).filter((f): f is MonClip => !!f && (!rayon || f.rayon === rayon));
  return fiches.sort((a, b) => b.ajouteLe - a.ajouteLe);
}

/** Place libre que le navigateur accorde encore (octets), ou null si on ne sait pas. */
export async function placeLibre(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && typeof e.quota === 'number' ? Math.max(0, e.quota - (e.usage ?? 0)) : null;
  } catch {
    return null;
  }
}

/** Message si `octets` ne rentrent pas sur l'appareil (avec la marge), sinon null. */
export function refusPlaceClips(octets: number, libre: number | null): string | null {
  if (libre === null || octets + MARGE_APPAREIL <= libre) return null;
  const mo = (n: number) => `${Math.max(0, Math.round(n / (1024 * 1024)))} Mo`;
  return `Pas assez de place sur l'appareil : il faut ${mo(octets)}, il reste ${mo(libre - MARGE_APPAREIL)} pour Arko. Libère de la place (photos, vidéos, applis) ou importe dossier par dossier.`;
}

/** Écrit le fichier dans l'OPFS par morceaux (jamais tout en mémoire). false si l'OPFS n'est pas utilisable. */
async function ecrireOpfs(id: string, fichier: Blob): Promise<boolean> {
  const dossier = await dossierOpfs();
  if (!dossier) return false;
  try {
    const poignee = await dossier.getFileHandle(id, { create: true });
    if (typeof poignee.createWritable !== 'function') return false;
    const flux = await poignee.createWritable();
    await fichier.stream().pipeTo(flux);
    return true;
  } catch (e) {
    await dossier.removeEntry(id).catch(() => undefined);
    if (e instanceof DOMException && e.name === 'QuotaExceededError') throw new ErreurArko(refusPlaceClips(fichier.size, 0) ?? 'Plus de place.', 'place');
    return false;
  }
}

/**
 * Garde un clip (vidéo entière). Renvoie sa fiche (celle qui existait déjà si le même fichier est déjà gardé).
 * Lève ErreurArko « place » si l'appareil n'a plus la place.
 */
export async function garderClip(
  fichier: Blob,
  infos: Pick<MonClip, 'rayon' | 'nom' | 'etiquette' | 'duree' | 'l' | 'h' | 'fond'> & { vignette?: string },
  o: { libre?: number | null } = {},
): Promise<{ clip: MonClip; nouveau: boolean }> {
  const id = `v${await calculerEmpreinte(fichier)}`;
  const deja = await get<MonClip>(cleFiche(id), magasin());
  if (deja) return { clip: deja, nouveau: false };
  const refus = refusPlaceClips(fichier.size, o.libre !== undefined ? o.libre : await placeLibre());
  if (refus) throw new ErreurArko(refus, 'place');
  const ou: MonClip['ou'] = (await ecrireOpfs(id, fichier)) ? 'opfs' : 'idb';
  if (ou === 'idb') await set(cleFichier(id), fichier, magasin());
  const clip: MonClip = {
    id,
    rayon: infos.rayon,
    nom: nettoyerNom(infos.nom) || 'Clip sans nom',
    etiquette: nettoyerNom(infos.etiquette),
    type: fichier.type || 'video/mp4',
    taille: fichier.size,
    duree: infos.duree,
    l: infos.l,
    h: infos.h,
    fond: infos.fond,
    ou,
    ajouteLe: Date.now(),
  };
  if (infos.vignette) clip.vignette = infos.vignette;
  await set(cleFiche(id), clip, magasin());
  return { clip, nouveau: true };
}

/** La fiche d'un clip (null s'il n'est plus là). */
export async function ficheClip(id: string): Promise<MonClip | null> {
  return (await get<MonClip>(cleFiche(id), magasin())) ?? null;
}

/** Le fichier d'un clip (lu par morceaux par le moteur), ou null s'il a disparu. */
export async function lireClip(id: string): Promise<File | null> {
  const fiche = await ficheClip(id);
  if (!fiche) return null;
  if (fiche.ou === 'opfs') {
    try {
      const f = await (await (await dossierOpfs())?.getFileHandle(id))?.getFile();
      return f ? new File([f], fiche.nom, { type: fiche.type }) : null;
    } catch {
      return null;
    }
  }
  const blob = await get<Blob>(cleFichier(id), magasin());
  return blob ? new File([blob], fiche.nom, { type: fiche.type }) : null;
}

/** Renomme un clip et/ou change son étiquette, ou le change de rayon. */
export async function modifierClip(id: string, partiel: { nom?: string; etiquette?: string; rayon?: RayonVideo }): Promise<MonClip | null> {
  const fiche = await ficheClip(id);
  if (!fiche) return null;
  const nouveau: MonClip = { ...fiche };
  if (partiel.nom !== undefined) nouveau.nom = nettoyerNom(partiel.nom) || fiche.nom;
  if (partiel.etiquette !== undefined) nouveau.etiquette = nettoyerNom(partiel.etiquette);
  if (partiel.rayon) nouveau.rayon = partiel.rayon;
  await set(cleFiche(id), nouveau, magasin());
  return nouveau;
}

/** Supprime un clip (les montages qui l'utilisent le signaleront à leur reprise et le retireront proprement). */
export async function supprimerClip(id: string): Promise<void> {
  const fiche = await ficheClip(id);
  await del(cleFiche(id), magasin());
  await del(cleFichier(id), magasin());
  if (fiche?.ou === 'opfs') await (await dossierOpfs())?.removeEntry(id).catch(() => undefined);
}

/** Place prise par les clips (octets). */
export async function placeClips(): Promise<number> {
  return (await listerClips()).reduce((t, c) => t + c.taille, 0);
}
