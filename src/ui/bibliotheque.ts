// État et actions de « Ma bibliothèque » (écran par-dessus les autres, avec son entrée d'historique : Retour le ferme) :
// rayon affiché, clips vidéo (Fonds verts, Mèmes), import d'un dossier / de fichiers / d'un .zip avec la question
// « Où ranger ? » pour les fichiers sans dossier reconnu, renommer, supprimer. Les sons (Bruitages, Musiques) sont
// ceux de Mes sons (ui/mes-sons.ts).

import { signal } from '@preact/signals';
import { analyserImport, importerBibliotheque, type BilanBibliotheque } from '../bibliotheque/importer';
import type { Rayon } from '../bibliotheque/rayons';
import { listerClips, modifierClip, placeLibre, supprimerClip, type MonClip } from '../moteur/api';
import { modifierMonSon } from '../moteur/api';
import { TB } from './textes-bibliotheque';
import { afficherToast } from './etat';
import { chargerMesSons } from './mes-sons';

export const bibliothequeOuverte = signal(false);
export const rayonActif = signal<Rayon>('bruitages');
/** Clips vidéo gardés (tous rayons ; null = pas encore lus). */
export const mesClips = signal<MonClip[] | null>(null);
/** Import en cours : « Import : 3 / 12 », ou null. */
export const progresBibliotheque = signal<string | null>(null);
/** Fichiers en attente de la réponse « Où ranger ? ». */
export const demandeRayon = signal<{ fichiers: File[]; sansRayon: number } | null>(null);
/** Dernier bilan détaillé (fichiers à convertir, illisibles), affiché dans l'écran. */
export const dernierBilan = signal<BilanBibliotheque | null>(null);
/** Place libre sur l'appareil (octets), ou null. */
export const placeAppareil = signal<number | null>(null);

/** Ouvre Ma bibliothèque (sur un rayon). Ajoute une entrée d'historique : Retour la ferme. */
export function ouvrirBibliotheque(rayon?: Rayon) {
  if (rayon) rayonActif.value = rayon;
  if (bibliothequeOuverte.peek()) return;
  history.pushState({ ...(history.state as object | null), bib: true }, '');
  bibliothequeOuverte.value = true;
  void chargerBibliotheque();
}

export function fermerBibliotheque() {
  if (!bibliothequeOuverte.peek()) return;
  if ((history.state as { bib?: unknown } | null)?.bib) history.back();
  else bibliothequeOuverte.value = false;
}

/** Appelé à chaque Retour / Avancer (navigation.ts). */
export function surNavigationBibliotheque(etat: unknown) {
  bibliothequeOuverte.value = (etat as { bib?: unknown } | null)?.bib === true;
}

export async function chargerClips() {
  try {
    mesClips.value = await listerClips();
  } catch (e) {
    console.error('Ma bibliothèque illisible', e);
    mesClips.value = [];
  }
}

export async function chargerBibliotheque() {
  await Promise.all([chargerClips(), chargerMesSons(), placeLibre().then((p) => (placeAppareil.value = p))]);
}

/** Importe : si des fichiers n'ont pas de dossier reconnu, on demande d'abord leur rayon. */
export async function importerDansBibliotheque(fichiers: readonly File[]) {
  if (fichiers.length === 0 || progresBibliotheque.peek()) return;
  try {
    const a = await analyserImport(fichiers, null);
    if (a.plan.sansRayon > 0) {
      demandeRayon.value = { fichiers: [...fichiers], sansRayon: a.plan.sansRayon };
      return;
    }
  } catch (e) {
    console.error(e);
  }
  await lancerImport(fichiers, null);
}

/** Réponse à « Où ranger ? » (null = les laisser de côté). */
export async function repondreRayon(rayon: Rayon | null) {
  const d = demandeRayon.peek();
  demandeRayon.value = null;
  if (d) await lancerImport(d.fichiers, rayon);
}

async function lancerImport(fichiers: readonly File[], choisi: Rayon | null) {
  progresBibliotheque.value = TB.import(0, fichiers.length);
  dernierBilan.value = null;
  try {
    const bilan = await importerBibliotheque(fichiers, choisi, { surProgres: (f, t) => (progresBibliotheque.value = TB.import(f, t)) });
    dernierBilan.value = bilan;
    await chargerBibliotheque();
    afficherToast(bilan.erreur ?? TB.bilan(bilan.gardes, bilan.deja), 5000);
    // On montre le rayon qui a reçu le plus de fichiers.
    const meilleur = (Object.keys(bilan.gardes) as Rayon[]).sort((a, b) => bilan.gardes[b] - bilan.gardes[a])[0];
    if (meilleur && bilan.gardes[meilleur] > 0 && bilan.gardes[rayonActif.peek()] === 0) rayonActif.value = meilleur;
  } finally {
    progresBibliotheque.value = null;
  }
}

/** Renomme un clip vidéo. */
export async function renommerClip(id: string, nom: string, etiquette: string) {
  await modifierClip(id, { nom, etiquette });
  await chargerClips();
}

export async function oublierClip(c: MonClip) {
  await supprimerClip(c.id);
  await chargerClips();
  afficherToast(TB.supprime(c.nom));
}

/** Change un son de rayon (Bruitages ↔ Musiques). */
export async function changerRayonSon(id: string, rayon: 'bruitages' | 'musiques') {
  await modifierMonSon(id, { rayon });
  await chargerMesSons();
}
