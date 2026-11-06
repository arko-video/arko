// État et actions de « Mes sons » (sons gardés sur l'appareil pour tous les montages) :
// liste, import de plusieurs sons ou d'un .zip avec une étiquette, renommer, supprimer, poser dans le montage,
// garder un son importé dans un montage, et réception des sons partagés vers Arko.

import { signal } from '@preact/signals';
import {
  ErreurArko,
  garderMonSon,
  importerDansMesSons,
  importerSon,
  lireMonSon,
  lireSonsPartages,
  listerMesSons,
  modifierMonSon,
  supprimerMonSon,
  viderSonsPartages,
  type MonSon,
  type SourceOuverte,
} from '../moteur/api';
import { T } from '../textes-fr';
import { ecouterFichier } from './ecoute-sons';
import { ajouterSonIci } from './effets';
import { afficherToast, ajouterSourceOuverte, idsPris } from './etat';
import { garderFichier } from './sons-gardes';

export const mesSons = signal<MonSon[]>([]);
/** Import en cours : « 3 / 12 », ou null. */
export const progresImport = signal<string | null>(null);
/** Étiquette proposée pour le prochain import (la dernière utilisée). */
export const etiquetteImport = signal<string>(T.messons.etiquetteDefaut);
/** Sons reçus par « Partager → Arko », en attente de la réponse « Les garder ? ». */
export const sonsRecus = signal<File[] | null>(null);

function message(e: unknown, defaut = T.erreurInconnue): string {
  if (e instanceof ErreurArko) return e.message;
  console.error(e);
  return defaut;
}

export async function chargerMesSons() {
  try {
    mesSons.value = await listerMesSons();
  } catch (e) {
    console.error('Mes sons illisibles', e);
  }
}

/** Importe des fichiers (sons et/ou .zip) dans Mes sons, avec l'étiquette choisie. */
export async function importerMesSons(fichiers: readonly File[], etiquette = etiquetteImport.peek()) {
  if (fichiers.length === 0 || progresImport.peek()) return;
  etiquetteImport.value = etiquette;
  progresImport.value = T.messons.import(0, fichiers.length);
  try {
    const bilan = await importerDansMesSons(fichiers, etiquette, (fait, total) => (progresImport.value = T.messons.import(fait, total)));
    await chargerMesSons();
    afficherToast(bilan.erreur ?? T.messons.bilan(bilan.gardes.length, bilan.deja, bilan.refuses), 5000);
  } finally {
    progresImport.value = null;
  }
}

export async function renommerMonSon(id: string, nom: string, etiquette: string) {
  await modifierMonSon(id, { nom, etiquette });
  await chargerMesSons();
}

export async function oublierMonSon(son: MonSon) {
  await supprimerMonSon(son.id);
  await chargerMesSons();
  afficherToast(T.messons.supprime(son.nom));
}

/** Écoute un son de Mes sons. */
export async function ecouterMonSon(son: MonSon) {
  const f = await lireMonSon(son.id).catch(() => null);
  if (!f) afficherToast(T.messons.introuvable);
  else await ecouterFichier(f, son.id);
}

/** Pose un son de Mes sons dans le montage : il devient un son importé du projet (copie gardée avec le projet). */
export async function poserMonSon(son: MonSon) {
  try {
    const f = await lireMonSon(son.id);
    if (!f) throw new ErreurArko(T.messons.introuvable, 'introuvable');
    const source = await importerSon(f, idsPris());
    ajouterSourceOuverte(source);
    garderFichier(source);
    ajouterSonIci(source.infos.id, source);
  } catch (e) {
    afficherToast(message(e));
  }
}

/** « Garder dans Mes sons » pour un son importé dans ce montage. */
export async function garderSonImporte(s: SourceOuverte) {
  try {
    const r = await garderMonSon(s.fichier, { nom: s.infos.nom.replace(/\.[a-z0-9]{1,5}$/i, ''), duree: s.infos.duree, etiquette: '' });
    await chargerMesSons();
    afficherToast(r.nouveau ? T.messons.garde(r.son.nom) : T.messons.dejaGarde(r.son.nom), 4000);
  } catch (e) {
    afficherToast(message(e));
  }
}

/* ------------------------------------------------------------------ Partager → Arko */

/** Au démarrage : si Arko a été ouvert par un partage (« ?partage=N »), lit les sons reçus et pose la question. */
export async function verifierPartage(adresse: URL = new URL(location.href)) {
  if (!adresse.searchParams.has('partage')) return;
  adresse.searchParams.delete('partage');
  history.replaceState(history.state, '', adresse.pathname + adresse.search + adresse.hash);
  const fichiers = await lireSonsPartages();
  if (fichiers.length === 0) afficherToast(T.partage.aucun, 5000);
  else sonsRecus.value = fichiers;
}

/** Réponse à « Les garder ? ». */
export async function repondrePartage(garder: boolean, etiquette: string) {
  const fichiers = sonsRecus.peek() ?? [];
  sonsRecus.value = null;
  if (garder) await importerMesSons(fichiers, etiquette);
  await viderSonsPartages();
}
