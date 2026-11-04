// « Mes montages » (écran Importer) : liste des projets, ouverture (on re-choisit la vidéo, contrôlée par empreinte,
// et les sons gardés sur l'appareil sont rouverts tout seuls), renommer, dupliquer, supprimer, nouveau montage.
// Le projet ouvert dans cette session se reprend sans rien re-choisir.

import { signal } from '@preact/signals';
import {
  dupliquerProjet,
  listerProjets,
  memeSource,
  nouveauProjet,
  ouvrirProjet,
  ouvrirSource,
  recetteInitiale,
  renommerProjet,
  supprimerProjet,
  type ResumeProjet,
  type SourceOuverte,
} from '../moteur/api';
import { T } from '../textes-fr';
import {
  afficherToast,
  demarrerProjet,
  derniereEtape,
  fermerSession,
  historique,
  quandProjetQuitte,
  sauverEnAttente,
  vignetteProjet,
} from './etat';
import { allerA, reprendreA } from './navigation';
import { rouvrirSons } from './sons-gardes';

/** Projets, du plus récent au plus ancien (null : pas encore lus). */
export const montages = signal<ResumeProjet[] | null>(null);
/** Id du projet ouvert dans cette session (null : aucun, ou pas encore enregistré). */
export const idCourant = signal<string | null>(null);
quandProjetQuitte(() => (idCourant.value = null));

/** true si ce projet est celui ouvert dans la session (il se reprend sans re-choisir la vidéo). */
export function estOuvert(id: string): boolean {
  return historique.value !== null && idCourant.value === id;
}

/** Relit la liste (après avoir écrit la sauvegarde en attente du projet ouvert). */
export async function rafraichirMontages() {
  await sauverEnAttente();
  try {
    const liste = await listerProjets();
    // Projet ouvert pas encore repéré : c'est le dernier enregistré.
    if (historique.peek() && idCourant.peek() === null) idCourant.value = liste[0]?.id ?? null;
    montages.value = liste;
  } catch (e) {
    console.error(e);
    montages.value = [];
  }
}

/** Nouveau montage : le projet ouvert reste dans la liste. */
export async function nouveauMontage(fichier: File, progression: (etape: string) => void) {
  await sauverEnAttente();
  await demarrerMontage(await ouvrirSource(fichier, progression));
}

/** Nouveau montage sur une vidéo déjà ouverte (Importer, ou « Je monte moi-même » du monteur IA). */
export async function demarrerMontage(source: SourceOuverte) {
  await sauverEnAttente();
  await nouveauProjet();
  demarrerProjet(source, recetteInitiale(source));
  idCourant.value = null;
  derniereEtape.value = 'couper';
  allerA('couper');
}

/**
 * Ouvre le montage `id` avec la vidéo re-choisie. Renvoie un message si ce n'est pas la bonne vidéo
 * (le projet ouvert avant redevient alors le projet courant), sinon null.
 */
export async function ouvrirMontage(
  id: string,
  fichier: File,
  progression: (etape: string) => void,
): Promise<string | null> {
  await sauverEnAttente();
  const precedent = historique.peek() ? idCourant.peek() : null;
  const restaurer = async () => {
    if (precedent) await ouvrirProjet(precedent).catch((e: unknown) => console.error(e));
  };
  try {
    const p = await ouvrirProjet(id);
    const attendue = p?.recette.sources[0];
    if (!p || !attendue) {
      await restaurer();
      return T.montages.illisible;
    }
    if (!(await memeSource(fichier, attendue))) {
      await restaurer();
      return T.importer.pasLaMeme(attendue.nom);
    }
    const source = await ouvrirSource(fichier, progression);
    const sons = await rouvrirSons(p.recette);
    demarrerProjet(source, sons.recette, sons.audio);
    idCourant.value = id;
    vignetteProjet.value = p.vignette;
    reprendreA(p.etape);
    if (sons.messages.length > 0) afficherToast(sons.messages.join(' '), 6000);
    return null;
  } catch (e) {
    await restaurer();
    throw e;
  }
}

/** Reprend le projet de la session là où on s'était arrêté. */
export function continuerMontage() {
  reprendreA(derniereEtape.peek());
}

export async function renommerMontage(id: string, titre: string) {
  const t = titre.trim();
  if (!t) return;
  try {
    await renommerProjet(id, t);
  } catch (e) {
    console.error(e);
    afficherToast(T.erreurInconnue);
  }
  await rafraichirMontages();
}

export async function dupliquerMontage(m: ResumeProjet) {
  try {
    await sauverEnAttente();
    await dupliquerProjet(m.id);
    afficherToast(T.montages.duplique(m.titre));
  } catch (e) {
    console.error(e);
    afficherToast(T.erreurInconnue);
  }
  await rafraichirMontages();
}

export async function supprimerMontage(id: string) {
  try {
    await sauverEnAttente();
    await supprimerProjet(id);
    // Le projet ouvert vient d'être supprimé : on le ferme sans l'enregistrer.
    if (historique.peek() && idCourant.peek() === id) {
      fermerSession();
      idCourant.value = null;
    }
    afficherToast(T.montages.supprime);
  } catch (e) {
    console.error(e);
    afficherToast(T.erreurInconnue);
  }
  await rafraichirMontages();
}
