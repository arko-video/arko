// Sous-titres côté interface : accord pour le module, téléchargement, transcription, annulation.
// L'état vit hors du panneau : fermer le panneau n'arrête pas une transcription en cours.

import { signal } from '@preact/signals';
import {
  ErreurArko,
  listerCorrections,
  memoriserCorrection,
  oublierCorrection,
  moduleSousTitres,
  transcrireRecette,
} from '../moteur/api';
import { definirSousTitres, modifierMot } from '../recette/operations';
import { SOUS_TITRES, ySousTitres } from '../recette/defauts';
import { gabaritDe } from '../recette/destination';
import type { Mot, Recette } from '../recette/types';
import { T } from '../textes-fr';
import { afficherToast, modifier, projetActuel, quandProjetQuitte, recette, sources } from './etat';

export type TravailSousTitres =
  | { phase: 'rien' }
  | { phase: 'verif' }
  | { phase: 'accord'; taille: string }
  | { phase: 'encours'; p: number; etape: string }
  | { phase: 'erreur'; message: string };

export const travailSousTitres = signal<TravailSousTitres>({ phase: 'rien' });
let controleur: AbortController | null = null;

/** « environ 90 Mo » : arrondi à la dizaine, c'est une annonce, pas une mesure. */
export function tailleArrondie(octets: number): string {
  return `${Math.max(10, Math.round(octets / 1e7) * 10)}\u00a0Mo`;
}

function messageErreur(e: unknown): string {
  if (e instanceof ErreurArko) return e.message;
  console.error(e);
  return T.erreurInconnue;
}

function estAnnule(e: unknown) {
  return (e instanceof ErreurArko && e.code === 'annule') || (e instanceof DOMException && e.name === 'AbortError');
}

/** « Créer les sous-titres » / « Tout refaire » : demande l'accord si le module manque, sinon transcrit. */
export async function lancerSousTitres() {
  const ph = travailSousTitres.peek().phase;
  if (ph === 'encours' || ph === 'verif') return;
  travailSousTitres.value = { phase: 'verif' };
  try {
    const m = await moduleSousTitres();
    if (!m.present) {
      travailSousTitres.value = { phase: 'accord', taille: tailleArrondie(m.tailleOctets) };
      return;
    }
    await executer();
  } catch (e) {
    travailSousTitres.value = { phase: 'erreur', message: messageErreur(e) };
  }
}

/** L'utilisateur accepte de télécharger le module (seul appel réseau, après son accord). */
export function accepterModule() {
  void executer();
}

export function refuserModule() {
  travailSousTitres.value = { phase: 'rien' };
}

export function annulerSousTitres() {
  controleur?.abort();
}

// Quitter le projet arrête la transcription et oublie son état (le résultat ne doit jamais arriver ailleurs).
quandProjetQuitte(() => {
  controleur?.abort();
  controleur = null;
  travailSousTitres.value = { phase: 'rien' };
});

async function executer() {
  controleur?.abort();
  const ctrl = new AbortController();
  controleur = ctrl;
  // Jeton : le projet et la vidéo transcrits. Un résultat pour un autre projet est jeté.
  const projet = projetActuel();
  const emp = sources.peek()[0]?.infos.emp;
  const toujoursLa = () => controleur === ctrl && projetActuel() === projet && sources.peek()[0]?.infos.emp === emp;
  const surProgression = (p: number, etape: string) => {
    if (toujoursLa()) travailSousTitres.value = { phase: 'encours', p: Math.round(Math.min(1, Math.max(0, p)) * 100), etape };
  };
  travailSousTitres.value = { phase: 'encours', p: 0, etape: '' };
  try {
    const r = recette.peek();
    if (!r) throw new ErreurArko(T.erreurInconnue, 'lecture');
    // transcrireRecette télécharge le module s'il manque : une seule barre de 0 à 100 %, un seul chargement du modèle.
    const mots = await transcrireRecette(r, sources.peek(), { langue: 'fr', surProgression, signal: ctrl.signal });
    if (!toujoursLa()) return;
    if (ctrl.signal.aborted) throw new ErreurArko(T.sousTitres.annule, 'annule');
    if (mots.length === 0) throw new ErreurArko(T.sousTitres.aucun, 'pas_de_son');
    modifier((x) => poserSousTitres(x, mots));
    travailSousTitres.value = { phase: 'rien' };
  } catch (e) {
    if (!toujoursLa()) return;
    if (estAnnule(e)) {
      travailSousTitres.value = { phase: 'rien' };
      afficherToast(T.sousTitres.annule);
    } else travailSousTitres.value = { phase: 'erreur', message: messageErreur(e) };
  } finally {
    if (controleur === ctrl) controleur = null;
  }
}

/** Remplace les mots en gardant le style choisi ; hauteur par défaut selon la mise en page. */
function poserSousTitres(r: Recette, mots: Mot[]): Recette {
  const st = r.sousTitres;
  return definirSousTitres(r, {
    style: st?.style ?? SOUS_TITRES.style,
    y: ySousTitres(r.mise, gabaritDe(r)),
    parLigne: st?.parLigne ?? SOUS_TITRES.parLigne,
    mots,
  });
}

/* ------------------------------------------------------------ corrections de mots */

/** Forme de comparaison : sans casse ni ponctuation (comme les corrections mémorisées). */
export function formeMot(txt: string): string {
  return txt.toLowerCase().replace(/[\p{P}\p{S}]+/gu, '').trim();
}

/** Indices des mots identiques à `avant` (même forme). Pure. */
export function motsIdentiques(mots: Mot[], avant: string): number[] {
  const f = formeMot(avant);
  if (!f) return [];
  const res: number[] = [];
  mots.forEach((m, j) => {
    if (formeMot(m[0]) === f) res.push(j);
  });
  return res;
}

/** Corrige le mot k ; `identiques` = aussi tous les mots identiques de cette vidéo ; `retenir` = pour les prochaines. */
export function corrigerMot(k: number, apres: string, choix: { identiques: boolean; retenir: boolean }) {
  const r = recette.peek();
  const mots = r?.sousTitres?.mots;
  const nouveau = apres.trim();
  if (!r || !Array.isArray(mots) || !mots[k] || !nouveau) return;
  const avant = mots[k][0];
  if (choix.retenir) {
    memoriserCorrection(avant, nouveau);
    correctionsRetenues.value = lireCorrectionsRetenues();
  }
  const ks = choix.identiques ? motsIdentiques(mots, avant) : [k];
  // Une seule entrée d'annulation pour tous les mots.
  modifier((x) =>
    ks.reduce((acc, j) => {
      // Les autres mots gardent leur ponctuation finale (« jlb, » → « JLB, »).
      const ponct = j === k ? '' : (mots[j][0].match(/[\p{P}]+$/u)?.[0] ?? '');
      return modifierMot(acc, j, { txt: j === k ? nouveau : nouveau.replace(/[\p{P}]+$/u, '') + ponct });
    }, x),
  );
}

/* ------------------------------------------------------------ mots retenus (pour les prochaines vidéos) */

export interface CorrectionRetenue {
  avant: string;
  apres: string;
}

function lireCorrectionsRetenues(): CorrectionRetenue[] {
  try {
    return listerCorrections();
  } catch (e) {
    console.error(e);
    return [];
  }
}

/** Corrections mémorisées, affichées dans le panneau Sous-titres (« Mots retenus »). */
export const correctionsRetenues = signal<CorrectionRetenue[]>([]);

export function rafraichirCorrections() {
  correctionsRetenues.value = lireCorrectionsRetenues();
}

export function oublierMotRetenu(avant: string) {
  try {
    oublierCorrection(avant);
  } catch (e) {
    console.error(e);
  }
  rafraichirCorrections();
}
