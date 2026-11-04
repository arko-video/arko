// « Mes montages » (phase 4) : plusieurs projets sauvegardés dans IndexedDB (idb-keyval).
// - arko.projets : l'index (résumés + id du projet courant) ;
// - arko.projet.<id> : chaque projet (la recette, jamais la vidéo).
// L'ancienne clé arko.projet (un seul projet) est migrée automatiquement à la première lecture.
// CONTRAT : signatures fixées. sauverProjet / chargerProjet / effacerProjet (stockage/projet.ts)
// passent par ici et visent le projet COURANT.

import { del, get, getMany, set } from 'idb-keyval';
import type { ProjetSauvegarde } from '../moteur/api';
import { ErreurArko } from '../moteur/erreurs';
import { creerFile } from '../moteur/file';
import type { Recette, Sec } from '../recette/types';
import {
  CLE_ANCIENNE, CLE_INDEX, cleProjet, copieDe, enregistrerDansIndex, indexVide, lireIndex, lireSauvegarde, migrerAncien,
  nettoyerTitre, nouvelId, resumeDe, retirerDuIndex, titreParDefaut, type IndexProjets,
} from './projets-index';
import { nettoyerFichiersAudio } from './sons';

export interface ResumeProjet {
  id: string;
  titre: string;
  /** Durée finale du montage. */
  duree: Sec;
  modifieLe: number;
  etape: string;
  /** Nom du fichier vidéo d'origine (pour le re-choisir). */
  nomSource: string;
  vignette?: string;
}

/** Toutes les opérations passent par cette file : jamais deux écritures de l'index en même temps. */
const file = creerFile();

/** Index actuel (avec migration de l'ancienne clé si besoin). À appeler DANS la file. */
async function indexActuel(): Promise<IndexProjets> {
  const index = lireIndex(await get(CLE_INDEX));
  if (index) return index;
  const ancien = await get(CLE_ANCIENNE);
  const migration = ancien ? migrerAncien(ancien, nouvelId()) : null;
  if (!migration) return indexVide();
  // D'abord le projet, puis l'index, et seulement ensuite on efface l'ancienne clé.
  await set(cleProjet(migration.index.courant!), migration.projet);
  await set(CLE_INDEX, migration.index);
  await del(CLE_ANCIENNE);
  return migration.index;
}

/** Recettes de TOUS les projets sauvegardés (pour le nettoyage des sons importés). */
export async function toutesLesRecettes(): Promise<Recette[]> {
  const index = await file(indexActuel);
  const bruts = await getMany<ProjetSauvegarde | undefined>(index.projets.map((p) => cleProjet(p.id)));
  return bruts.filter((b): b is ProjetSauvegarde => !!b?.recette).map((b) => b.recette);
}

/** Après un enregistrement ou une suppression : on retire les sons qu'aucun projet n'utilise (sans attendre). */
function nettoyerPlusTard() {
  void toutesLesRecettes()
    .then((recettes) => nettoyerFichiersAudio(recettes))
    .catch((e) => console.error(e));
}

/** Projets du plus récent au plus ancien. */
export async function listerProjets(): Promise<ResumeProjet[]> {
  return (await file(indexActuel)).projets;
}

/** Charge un projet et en fait le projet courant. */
export async function ouvrirProjet(id: string): Promise<ProjetSauvegarde | null> {
  return file(async () => {
    const index = await indexActuel();
    if (!index.projets.some((p) => p.id === id)) return null;
    const projet = lireSauvegarde(await get(cleProjet(id)));
    if (projet) await set(CLE_INDEX, { ...index, courant: id });
    return projet;
  });
}

/** Commence un nouveau projet courant (le précédent reste dans la liste). */
export async function nouveauProjet(): Promise<void> {
  await file(async () => {
    const index = await indexActuel();
    if (index.courant !== null) await set(CLE_INDEX, { ...index, courant: null });
  });
}

export async function renommerProjet(id: string, titre: string): Promise<void> {
  const propre = nettoyerTitre(titre);
  if (!propre) return;
  await file(async () => {
    const index = await indexActuel();
    const resume = index.projets.find((p) => p.id === id);
    if (resume) await set(CLE_INDEX, { ...index, projets: index.projets.map((p) => (p.id === id ? { ...p, titre: propre } : p)) });
  });
}

/** Copie un projet ; renvoie l'id de la copie. */
export async function dupliquerProjet(id: string): Promise<string> {
  return file(async () => {
    const index = await indexActuel();
    const resume = index.projets.find((p) => p.id === id);
    const projet = lireSauvegarde(await get(cleProjet(id)));
    if (!resume || !projet) throw new ErreurArko('Ce montage est introuvable.', 'introuvable');
    const id2 = nouvelId();
    const copie = copieDe(projet, resume, id2, Date.now());
    await set(cleProjet(id2), copie.projet);
    await set(CLE_INDEX, enregistrerDansIndex(index, copie.resume));
    return id2;
  });
}

export async function supprimerProjet(id: string): Promise<void> {
  await file(async () => {
    const index = await indexActuel();
    await del(cleProjet(id));
    await set(CLE_INDEX, retirerDuIndex(index, id));
  });
  nettoyerPlusTard();
}

/* ------------------------------------------------------------------ projet courant (pour stockage/projet.ts) */

/** Enregistre le projet courant (en crée un nouveau dans la liste s'il n'y en a pas). */
export async function enregistrerCourant(projet: ProjetSauvegarde): Promise<void> {
  await file(async () => {
    const index = await indexActuel();
    const id = index.courant ?? nouvelId();
    const titre = index.projets.find((p) => p.id === id)?.titre ?? titreParDefaut(projet.recette);
    await set(cleProjet(id), projet);
    await set(CLE_INDEX, enregistrerDansIndex(index, resumeDe(id, projet, titre), id));
  });
  nettoyerPlusTard();
}

/** Le projet courant tel qu'il a été enregistré (non vérifié), ou undefined. */
export async function lireCourant(): Promise<unknown> {
  return file(async () => {
    const index = await indexActuel();
    return index.courant ? get(cleProjet(index.courant)) : undefined;
  });
}

/** Supprime le projet courant de la liste. */
export async function supprimerCourant(): Promise<void> {
  const index = await file(indexActuel);
  if (index.courant) await supprimerProjet(index.courant);
}
