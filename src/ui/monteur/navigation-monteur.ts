// Navigation du monteur IA : chaque écran (Demande, Analyse, Revue) a son entrée d'historique,
// sous l'écran Importer ({ ecran: 'importer', monteur: 'demande' }). Le bouton Retour d'Android
// ramène à l'écran d'avant ; pendant l'analyse, il ne la quitte pas sans le vouloir.

import { T } from '../../textes-fr';
import { afficherToast } from '../etat';
import {
  ecranMonteur,
  ECRANS_MONTEUR,
  etatAnalyse,
  revue,
  sourceMonteur,
  type EcranMonteur,
} from './etat-monteur';

function estEcranMonteur(x: unknown): x is EcranMonteur {
  return typeof x === 'string' && (ECRANS_MONTEUR as string[]).includes(x);
}

function etat(e: EcranMonteur) {
  return { arko: true, ecran: 'importer', monteur: e };
}

function afficher(e: EcranMonteur | null) {
  ecranMonteur.value = e;
  window.scrollTo(0, 0);
}

/** Va à un écran du monteur en ajoutant une entrée d'historique. */
export function allerMonteur(e: EcranMonteur) {
  if (ecranMonteur.peek() === e) return;
  history.pushState(etat(e), '');
  afficher(e);
}

/** Quitte le monteur pour l'écran Importer (nouvelle entrée d'historique). */
export function quitterMonteur() {
  history.pushState({ arko: true, ecran: 'importer' }, '');
  afficher(null);
}

/** Cet écran du monteur peut-il s'afficher (après un rechargement, l'état est perdu) ? */
function possible(e: EcranMonteur): boolean {
  if (e === 'revue')
    return revue.peek() !== null && (sourceMonteur.peek() !== null || revue.peek()!.restants.length === 0);
  return sourceMonteur.peek() !== null;
}

/**
 * Appelé par navigation.ts à chaque Retour / Avancer. Renvoie true si l'événement est réglé ici
 * (on reste sur l'analyse en cours), false pour laisser navigation.ts afficher l'écran visé.
 */
export function surNavigationMonteur(etatHistorique: unknown): boolean {
  const demande = (etatHistorique as { monteur?: unknown } | null)?.monteur;
  const vers = estEcranMonteur(demande) ? demande : null;
  const ph = etatAnalyse.peek().phase;
  if (ecranMonteur.peek() === 'analyse' && (ph === 'encours' || ph === 'ia') && vers !== 'analyse') {
    history.pushState(etat('analyse'), '');
    afficherToast(T.monteur.enCoursRetour);
    return true;
  }
  ecranMonteur.value = vers && possible(vers) ? vers : null;
  return false;
}

/** Bouton « Changer les réglages » : comme le bouton Retour du téléphone. */
export function retourMonteur() {
  history.back();
}
