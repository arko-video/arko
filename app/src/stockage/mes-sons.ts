// « Mes sons » : les sons que l'utilisateur garde pour TOUS ses projets (importés, reçus par Partager, ou gardés
// depuis un montage). Rangés sur l'appareil dans une base IndexedDB à part : le nettoyage automatique des sons
// des montages (stockage/sons.ts) n'y touche jamais. Plafond : 100 Mo en tout.

import { createStore, del, get, getMany, keys, set } from 'idb-keyval';
import { ErreurArko } from '../moteur/erreurs';
import { calculerEmpreinte } from './fichiers';

/** Place maximale de tous les sons gardés. */
export const LIMITE_MES_SONS = 100 * 1024 * 1024;
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
}

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

/** Place utilisée par Mes sons (en octets). */
export async function placeUtilisee(): Promise<number> {
  return (await listerMesSons()).reduce((t, s) => t + s.taille, 0);
}

/**
 * Garde un son. Renvoie sa fiche (celle qui existait déjà si le même fichier est déjà gardé).
 * Lève ErreurArko "place" si les 100 Mo seraient dépassés.
 */
export async function garderMonSon(fichier: Blob, infos: { nom: string; etiquette?: string; duree: number }): Promise<{ son: MonSon; nouveau: boolean }> {
  const id = `m${await calculerEmpreinte(fichier)}`;
  const deja = await get<MonSon>(cleFiche(id), magasin());
  if (deja) return { son: deja, nouveau: false };
  if ((await placeUtilisee()) + fichier.size > LIMITE_MES_SONS) {
    throw new ErreurArko('Mes sons est plein (100 Mo). Supprime des sons pour en garder d\'autres.', 'place');
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

/** Renomme un son gardé et/ou change son étiquette. */
export async function modifierMonSon(id: string, partiel: { nom?: string; etiquette?: string }): Promise<MonSon | null> {
  const fiche = await get<MonSon>(cleFiche(id), magasin());
  if (!fiche) return null;
  const nouveau: MonSon = { ...fiche };
  if (partiel.nom !== undefined) nouveau.nom = nettoyerNom(partiel.nom) || fiche.nom;
  if (partiel.etiquette !== undefined) nouveau.etiquette = nettoyerNom(partiel.etiquette);
  await set(cleFiche(id), nouveau, magasin());
  return nouveau;
}

/** Supprime un son gardé (les montages qui l'utilisent gardent leur propre copie). */
export async function supprimerMonSon(id: string): Promise<void> {
  await del(cleFiche(id), magasin());
  await del(cleFichier(id), magasin());
}
