// D. Rayon « Chibis » de Ma bibliothèque (dev 3) : les personnages créés, gardés sur l'appareil (IndexedDB, base
// « arko-chibis » via idb-keyval), réutilisables d'un montage à l'autre. Une fiche = une définition (quelques octets).
// Contrat : conception/contrat-wankil.md §5.

import { createStore, del, get, set, values } from 'idb-keyval';
import { ErreurArko } from '../moteur/erreurs';
import { normaliserChibi } from '../recette/normaliser-chibis';
import { Journal } from '../recette/normaliser-outils';
import type { DefinitionChibi } from '../recette/types';

export interface MonChibi {
  id: string;
  nom: string;
  def: DefinitionChibi;
  /** Date.now() à la création. */
  cree: number;
}

export const CHIBIS_MAX = 200;
export const NOM_CHIBI_MAX = 24;

let base: ReturnType<typeof createStore> | null = null;
function magasin() {
  base ??= createStore('arko-chibis', 'chibis');
  return base;
}

/** Définition propre (valeurs inconnues remplacées, comme dans une recette). */
function propre(def: DefinitionChibi): DefinitionChibi {
  return normaliserChibi(def, 'chibi', new Journal()) ?? def;
}

function nomPropre(nom: string): string {
  return nom.trim().slice(0, NOM_CHIBI_MAX) || 'Mon perso';
}

/** Les chibis gardés, du plus récent au plus ancien. */
export async function listerChibis(): Promise<MonChibi[]> {
  const tous = (await values<MonChibi>(magasin())).filter((c) => c && typeof c.id === 'string' && c.def);
  return tous.sort((a, b) => b.cree - a.cree);
}

export async function garderChibi(def: DefinitionChibi, nom: string): Promise<MonChibi> {
  const deja = await listerChibis();
  if (deja.length >= CHIBIS_MAX) throw new ErreurArko(`Ma bibliothèque a déjà ${CHIBIS_MAX} persos : supprimes-en un d'abord.`, 'chibis_pleins');
  const cree = Date.now();
  const c: MonChibi = { id: `c${cree.toString(36)}${Math.floor((cree % 997) * 37).toString(36)}`, nom: nomPropre(nom), def: propre(def), cree };
  while (deja.some((x) => x.id === c.id)) c.id += 'x';
  await set(c.id, c, magasin());
  return c;
}

export async function modifierChibi(id: string, partiel: { nom?: string; def?: DefinitionChibi }): Promise<MonChibi | null> {
  const c = await get<MonChibi>(id, magasin());
  if (!c) return null;
  const res: MonChibi = { ...c, ...(partiel.nom !== undefined ? { nom: nomPropre(partiel.nom) } : {}), ...(partiel.def ? { def: propre(partiel.def) } : {}) };
  await set(id, res, magasin());
  return res;
}

export async function supprimerChibi(id: string): Promise<void> {
  await del(id, magasin());
}
