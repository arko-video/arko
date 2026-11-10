// « Mes sons » : les sons que l'utilisateur garde pour TOUS ses projets (importés, reçus par Partager, ou gardés
// depuis un montage). Rangés sur l'appareil dans une base IndexedDB à part : le nettoyage automatique des sons
// des montages (stockage/sons.ts) n'y touche jamais. Plafond : 600 Mo en tout (un vrai pack ≈ 1 500 sons, 500 Mo),
// si le navigateur laisse la place (placeLibreAppareil).

import { createStore, del, get, getMany, keys, set } from 'idb-keyval';
import { ErreurArko } from '../moteur/erreurs';
import { calculerEmpreinte } from './fichiers';

/** Place maximale de tous les sons gardés (rayon Bruitages). */
export const LIMITE_MES_SONS = 600 * 1024 * 1024;
/** Place maximale du rayon Musiques de Ma bibliothèque (si le navigateur laisse la place). */
export const LIMITE_MUSIQUES = 2 * 1024 * 1024 * 1024;
/** Rayon d'un son : Bruitages (absent, comme tous les anciens sons) ou Musiques (Ma bibliothèque). */
export type RayonSon = 'bruitages' | 'musiques';
/** Longueur maximale d'un nom ou d'une étiquette. */
export const NOM_MAX = 60;

/** Fiche d'un son gardé (sans ses données). */
export interface MonSon {
  /** « m » + empreinte du fichier : le même fichier n'est jamais gardé deux fois. */
  id: string;
  nom: string;
  /** Étiquette choisie par l'utilisateur (« Memes »…), ou "". */
  etiquette: string;
  type: string;
  taille: number;
  duree: number;
  ajouteLe: number;
  /** Ma bibliothèque : 'musiques' pour une musique de fond ; absent = Bruitages. */
  rayon?: 'musiques';
  /**
   * « Arko écoute tes sons » (CLAP) : ce qu'Arko a entendu (whoosh, pop, impact, rire…), null = pas sûr.
   * Absent = pas encore écouté. Le texte reste un simple mot : aucune dépendance vers auto/.
   */
  ecoute?: string | null;
}

/** Rayon d'un son gardé. */
export const rayonDuSon = (s: Pick<MonSon, 'rayon'>): RayonSon => (s.rayon === 'musiques' ? 'musiques' : 'bruitages');

let base: ReturnType<typeof createStore> | null = null;
const magasin = () => (base ??= createStore('arko-mes-sons', 'sons'));
const cleFiche = (id: string) => `fiche:${id}`;
const cleFichier = (id: string) => `fichier:${id}`;

/** Nettoie un nom venu d'un fichier ou de l'utilisateur : une ligne, sans caractères de contrôle, 60 caractères. */
export function nettoyerNom(nom: string): string {
  return nom.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOM_MAX);
}

/** Nom affiché à partir d'un nom de fichier : sans le dossier ni l'extension, « _ » et « - » remplacés par des espaces. */
export function nomDepuisFichier(nomFichier: string): string {
  const base = nomFichier.split(/[\\/]/).pop() ?? '';
  return nettoyerNom(base.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ')) || 'Son sans nom';
}

/** Tous les sons gardés, du plus récent au plus ancien. */
export async function listerMesSons(): Promise<MonSon[]> {
  const cles = (await keys<string>(magasin())).filter((k) => k.startsWith('fiche:'));
  const fiches = (await getMany<MonSon>(cles, magasin())).filter((f): f is MonSon => !!f);
  return fiches.sort((a, b) => b.ajouteLe - a.ajouteLe);
}

/** Place utilisée par un rayon de sons (défaut : Bruitages = Mes sons), en octets. */
export async function placeUtilisee(rayon: RayonSon = 'bruitages'): Promise<number> {
  return (await listerMesSons()).filter((s) => rayonDuSon(s) === rayon).reduce((t, s) => t + s.taille, 0);
}

/** Place libre que le navigateur accorde encore à Arko (octets), ou null si on ne sait pas. */
export async function placeLibreAppareil(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && typeof e.quota === 'number' ? Math.max(0, e.quota - (e.usage ?? 0)) : null;
  } catch {
    return null;
  }
}

/**
 * Garde un son. Renvoie sa fiche (celle qui existait déjà si le même fichier est déjà gardé).
 * Lève ErreurArko "place" si les 600 Mo seraient dépassés. `placeUtilisee` : place déjà prise, si l'appelant la
 * connaît (import d'un gros pack : on ne relit pas toute la liste à chaque son).
 */
export async function garderMonSon(
  fichier: Blob,
  infos: { nom: string; etiquette?: string; duree: number; rayon?: RayonSon },
  o: { placeUtilisee?: number } = {},
): Promise<{ son: MonSon; nouveau: boolean }> {
  const id = `m${await calculerEmpreinte(fichier)}`;
  const deja = await get<MonSon>(cleFiche(id), magasin());
  if (deja) return { son: deja, nouveau: false };
  const rayon = infos.rayon ?? 'bruitages';
  if ((o.placeUtilisee ?? (await placeUtilisee(rayon))) + fichier.size > (rayon === 'musiques' ? LIMITE_MUSIQUES : LIMITE_MES_SONS)) {
    throw new ErreurArko(
      rayon === 'musiques'
        ? 'Le rayon Musiques est plein (2 Go). Supprime des musiques pour en garder d\'autres.'
        : 'Mes sons est plein (600 Mo). Supprime des sons pour en garder d\'autres.',
      'place',
    );
  }
  const son: MonSon = {
    id,
    nom: nettoyerNom(infos.nom) || 'Son sans nom',
    etiquette: nettoyerNom(infos.etiquette ?? ''),
    type: fichier.type || 'audio/mpeg',
    taille: fichier.size,
    duree: infos.duree,
    ajouteLe: Date.now(),
  };
  if (rayon === 'musiques') son.rayon = 'musiques';
  await set(cleFichier(id), fichier, magasin());
  await set(cleFiche(id), son, magasin());
  return { son, nouveau: true };
}

/** Le fichier d'un son gardé (pour l'écouter ou le poser dans un montage), ou null s'il a disparu. */
export async function lireMonSon(id: string): Promise<File | null> {
  const [fiche, blob] = await Promise.all([get<MonSon>(cleFiche(id), magasin()), get<Blob>(cleFichier(id), magasin())]);
  if (!fiche || !blob) return null;
  return new File([blob], `${fiche.nom}`, { type: fiche.type });
}

/** Renomme un son gardé, change son étiquette, ou le change de rayon (Bruitages ↔ Musiques). */
export async function modifierMonSon(id: string, partiel: { nom?: string; etiquette?: string; rayon?: RayonSon }): Promise<MonSon | null> {
  const fiche = await get<MonSon>(cleFiche(id), magasin());
  if (!fiche) return null;
  const nouveau: MonSon = { ...fiche };
  if (partiel.nom !== undefined) nouveau.nom = nettoyerNom(partiel.nom) || fiche.nom;
  if (partiel.etiquette !== undefined) nouveau.etiquette = nettoyerNom(partiel.etiquette);
  if (partiel.rayon === 'musiques') nouveau.rayon = 'musiques';
  else if (partiel.rayon === 'bruitages') delete nouveau.rayon;
  await set(cleFiche(id), nouveau, magasin());
  return nouveau;
}

/** Retient ce qu'Arko a entendu dans un son (« Arko écoute tes sons »). */
export async function noterEcoute(id: string, genre: string | null): Promise<void> {
  const fiche = await get<MonSon>(cleFiche(id), magasin());
  if (!fiche) return;
  await set(cleFiche(id), { ...fiche, ecoute: genre }, magasin());
}

/** Supprime un son gardé (les montages qui l'utilisent gardent leur propre copie). */
export async function supprimerMonSon(id: string): Promise<void> {
  await del(cleFiche(id), magasin());
  await del(cleFichier(id), magasin());
}
