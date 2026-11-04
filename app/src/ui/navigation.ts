// Navigation entre les étapes. Chaque étape ajoute une entrée dans l'historique du navigateur
// (history.pushState) : le bouton Retour d'Android ramène à l'étape précédente sans rien perdre.

import { T } from '../textes-fr';
import {
  afficherToast,
  derniereEtape,
  ecran,
  etatExport,
  historique,
  ORDRE_ECRANS,
  type Ecran,
} from './etat';
import { etapeCadrageSautee, gabaritProjet } from './destination';
import { TY } from '../textes-youtube';
import { panneauDepuisHistorique, reinitialiserHabillage } from './habillage';
import { surNavigationAide } from './aide';
import { surNavigationMonteur } from './monteur/navigation-monteur';

interface EtatHistorique {
  arko: true;
  ecran: Ecran;
}

function estEcran(x: unknown): x is Ecran {
  return typeof x === 'string' && (ORDRE_ECRANS as string[]).includes(x);
}

function afficher(e: Ecran) {
  if (e !== 'habiller') reinitialiserHabillage();
  ecran.value = e;
  if (e !== 'importer') derniereEtape.value = e;
  window.scrollTo(0, 0);
}

/** Va à une étape en ajoutant une entrée d'historique. */
export function allerA(e: Ecran) {
  if (e === ecran.peek()) return;
  history.pushState({ arko: true, ecran: e } satisfies EtatHistorique, '');
  afficher(e);
}

/** Étape suivante (saute Vertical / Cadrage si la vidéo est déjà au bon format). */
export function suivant() {
  const actuel = ecran.peek();
  if (actuel === 'couper') {
    if (etapeCadrageSautee.peek()) {
      allerA('habiller');
      afficherToast(gabaritProjet.peek().paysage ? TY.cadrage.dejaAuFormat : T.vertical.dejaVerticale);
    } else allerA('vertical');
  } else if (actuel === 'vertical') allerA('habiller');
  else if (actuel === 'habiller') allerA('exporter');
}

/** Bouton Retour de l'en-tête : même effet que le bouton Retour du téléphone. */
export function retour() {
  history.back();
}

/** Ouvre un projet repris directement à l'étape enregistrée, en recréant les étapes d'avant. */
export function reprendreA(etape: string) {
  const cible: Ecran = estEcran(etape) && etape !== 'importer' ? etape : 'couper';
  const chemin: Ecran[] = ['couper'];
  if (cible !== 'couper' && !etapeCadrageSautee.peek()) chemin.push('vertical');
  if (cible === 'habiller' || cible === 'exporter') chemin.push('habiller');
  if (cible === 'exporter') chemin.push('exporter');
  for (const e of chemin) history.pushState({ arko: true, ecran: e } satisfies EtatHistorique, '');
  afficher(chemin[chemin.length - 1]);
}

/** « Monter un autre clip » : retour à l'import. */
export function recommencer() {
  history.pushState({ arko: true, ecran: 'importer' } satisfies EtatHistorique, '');
  afficher('importer');
}

/** À appeler une fois au démarrage. */
export function initialiserNavigation() {
  history.replaceState({ arko: true, ecran: 'importer' } satisfies EtatHistorique, '');
  window.addEventListener('popstate', (ev) => {
    const etat = ev.state as Partial<EtatHistorique> | null;
    // Aide (phase 5) et monteur IA (phase 6) : leurs écrans vivent sous Importer.
    surNavigationAide(etat);
    if (surNavigationMonteur(etat)) return;
    let cible: Ecran = estEcran(etat?.ecran) ? etat.ecran : 'importer';

    // Pendant un export, on ne quitte pas l'écran sans le vouloir : on y reste.
    if (ecran.peek() === 'exporter' && etatExport.peek().phase === 'encours' && cible !== 'exporter') {
      history.pushState({ arko: true, ecran: 'exporter' } satisfies EtatHistorique, '');
      afficherToast(T.exporter.enCoursRetour);
      return;
    }
    // Sans projet ouvert, seules l'importation est possible.
    if (!historique.peek()) cible = 'importer';
    // Vidéo déjà au format : l'étape Vertical (ou Cadrage) n'existe pas.
    if (cible === 'vertical' && etapeCadrageSautee.peek()) cible = 'couper';
    afficher(cible);
    // Habiller : l'entrée d'historique dit quel outil est ouvert (Retour ferme le panneau).
    if (cible === 'habiller') panneauDepuisHistorique(etat);
  });
}

/** Numéro d'étape (1 à 5) affiché dans « Étape x sur 5 ». */
export function numeroEtape(e: Ecran): number {
  return ORDRE_ECRANS.indexOf(e) + 1;
}
