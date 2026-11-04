// Fichiers audio importés (sons, enregistrements du micro, son guide) gardés SUR L'APPAREIL, dans IndexedDB,
// rangés par empreinte. Ils sont petits (10 min au plus) : à la reprise, on ne les redemande pas.
// Nettoyage : on ne garde que les fichiers utilisés par un projet sauvegardé, et 200 Mo au plus.

import { createStore, delMany, get, getMany, keys, set } from 'idb-keyval';
import type { SourceOuverte } from '../moteur/api';
import { ouvrirSourceAudio } from '../moteur/sources';
import type { Recette } from '../recette/types';
import { CLE_ANCIENNE, CLE_INDEX, cleProjet, lireIndex } from './projets-index';

/** Taille maximale de tous les fichiers audio gardés. */
export const LIMITE_OCTETS = 200 * 1024 * 1024;
/** Un fichier qui vient d'être importé est gardé au moins 1 h, même s'il n'est encore dans aucun projet sauvegardé. */
export const GRACE_MS = 60 * 60 * 1000;

/** Fiche d'un fichier gardé (sans ses données). */
export interface FicheAudio {
  emp: string;
  nom: string;
  type: string;
  taille: number;
  /** Date.now() du dernier enregistrement ou de la dernière réouverture. */
  utiliseLe: number;
}

// Une base à part. Clés : « fiche:<empreinte> » (petite fiche) et « fichier:<empreinte> » (le fichier).
let base: ReturnType<typeof createStore> | null = null;
const magasin = () => (base ??= createStore('arko-sons', 'fichiers'));
const cleFiche = (emp: string) => `fiche:${emp}`;
const cleFichier = (emp: string) => `fichier:${emp}`;

/** Garde le fichier d'une source audio sur l'appareil (rien à faire si c'est une vidéo ou s'il est déjà gardé). */
export async function sauverFichierAudio(source: SourceOuverte): Promise<void> {
  const { infos, fichier } = source;
  if (infos.type !== 'audio' || !infos.emp) return;
  const fiche: FicheAudio = { emp: infos.emp, nom: infos.nom, type: fichier.type, taille: fichier.size, utiliseLe: Date.now() };
  if (!(await get(cleFichier(infos.emp), magasin()))) await set(cleFichier(infos.emp), fichier, magasin());
  await set(cleFiche(infos.emp), fiche, magasin());
}

/**
 * Rouvre les sources audio d'une recette à partir des fichiers gardés, avec LEUR id d'origine.
 * `manquants` : ids des sources audio introuvables ou illisibles (à redemander à l'utilisateur).
 */
export async function rouvrirSourcesAudio(recette: Recette): Promise<{ sources: SourceOuverte[]; manquants: string[] }> {
  const sources: SourceOuverte[] = [];
  const manquants: string[] = [];
  for (const s of recette.sources) {
    if (s.type !== 'audio') continue;
    try {
      const fiche = await get<FicheAudio>(cleFiche(s.emp), magasin());
      const blob = await get<Blob>(cleFichier(s.emp), magasin());
      if (!fiche || !blob) {
        manquants.push(s.id);
        continue;
      }
      const fichier = new File([blob], fiche.nom || s.nom, { type: fiche.type });
      sources.push(await ouvrirSourceAudio(fichier, s.id));
      await set(cleFiche(s.emp), { ...fiche, utiliseLe: Date.now() }, magasin());
    } catch {
      manquants.push(s.id);
    }
  }
  return { sources, manquants };
}

/**
 * Nettoyage. `recettes` : les recettes de TOUS les projets sauvegardés (projet courant compris).
 * À appeler après une sauvegarde de projet ou une suppression de projet. Renvoie le nombre de fichiers retirés.
 */
export async function nettoyerFichiersAudio(recettes: Recette[]): Promise<number> {
  const cles = (await keys<string>(magasin())).filter((k) => k.startsWith('fiche:'));
  const fiches = (await getMany<FicheAudio>(cles, magasin())).filter((f): f is FicheAudio => !!f);
  // Par sécurité, on ajoute TOUJOURS les recettes de tous les projets de « Mes montages » :
  // un appel avec le seul projet courant ne doit jamais effacer les sons des autres projets.
  const toutes = [...recettes, ...(await recettesSauvegardees())];
  const utilisees = new Set(toutes.flatMap((r) => (r.sources ?? []).filter((s) => s.type === 'audio').map((s) => s.emp)));
  const aRetirer = choisirFichiersARetirer(fiches, utilisees, Date.now());
  if (aRetirer.length > 0) await delMany(aRetirer.flatMap((emp) => [cleFiche(emp), cleFichier(emp)]), magasin());
  return aRetirer.length;
}

/** Recettes de tous les projets sauvegardés (et de l'ancienne sauvegarde pas encore migrée). */
async function recettesSauvegardees(): Promise<Recette[]> {
  try {
    const index = lireIndex(await get(CLE_INDEX));
    const cles = [...(index?.projets.map((p) => cleProjet(p.id)) ?? []), CLE_ANCIENNE];
    const bruts = await getMany<{ recette?: Recette } | undefined>(cles);
    return bruts.flatMap((b) => (b?.recette && Array.isArray(b.recette.sources) ? [b.recette] : []));
  } catch {
    return [];
  }
}

/**
 * Choix des fichiers à retirer (fonction pure) :
 * 1. ceux qu'aucun projet n'utilise, sauf s'ils ont servi il y a moins d'une heure ;
 * 2. puis, si le total dépasse encore `limite`, les moins récemment utilisés.
 */
export function choisirFichiersARetirer(
  fiches: FicheAudio[],
  utilisees: ReadonlySet<string>,
  maintenant: number,
  limite = LIMITE_OCTETS,
): string[] {
  const retires = new Set<string>();
  for (const f of fiches) {
    if (!utilisees.has(f.emp) && maintenant - f.utiliseLe > GRACE_MS) retires.add(f.emp);
  }
  let total = fiches.filter((f) => !retires.has(f.emp)).reduce((a, f) => a + f.taille, 0);
  const restants = fiches.filter((f) => !retires.has(f.emp)).sort((a, b) => a.utiliseLe - b.utiliseLe);
  for (const f of restants) {
    if (total <= limite) break;
    retires.add(f.emp);
    total -= f.taille;
  }
  return [...retires];
}
