// Navigation du Montage express (intégrateur) : chaque écran (Réglages, Analyse, Revue) a son entrée d'historique,
// sous l'écran Importer ({ ecran: 'importer', express: 'reglages' }). Le bouton Retour d'Android ramène à l'écran
// d'avant ; pendant l'analyse, il ne la quitte pas sans le vouloir.

import { signal } from '@preact/signals';
import { TA } from '../../../textes-auto';
import { afficherToast } from '../../etat';

export type EcranExpress = 'reglages' | 'analyse' | 'revue';
const ECRANS: readonly EcranExpress[] = ['reglages', 'analyse', 'revue'];

/** Écran du Montage express affiché (null : aucun). */
export const ecranExpress = signal<EcranExpress | null>(null);

/** Branché par etat-express.ts : l'analyse tourne-t-elle ? cet écran peut-il s'afficher ? */
export const garde = { enCours: () => false, possible: (_e: EcranExpress) => false };

function etat(e: EcranExpress) {
  return { arko: true, ecran: 'importer', express: e };
}

export function allerExpress(e: EcranExpress) {
  if (ecranExpress.peek() === e) return;
  history.pushState(etat(e), '');
  ecranExpress.value = e;
  window.scrollTo(0, 0);
}

/** Remplace l'écran actuel (l'analyse finie laisse place à la revue : Retour ramène aux réglages). */
export function remplacerExpress(e: EcranExpress) {
  history.replaceState(etat(e), '');
  ecranExpress.value = e;
  window.scrollTo(0, 0);
}

/** Quitte le Montage express (sans entrée d'historique : la suite en ajoute). */
export function fermerExpress() {
  ecranExpress.value = null;
}

/** Appelé par navigation.ts à chaque Retour / Avancer. true = réglé ici (on reste sur l'analyse). */
export function surNavigationExpress(etatHistorique: unknown): boolean {
  const demande = (etatHistorique as { express?: unknown } | null)?.express;
  const vers = typeof demande === 'string' && (ECRANS as readonly string[]).includes(demande) ? (demande as EcranExpress) : null;
  if (ecranExpress.peek() === 'analyse' && garde.enCours() && vers !== 'analyse') {
    history.pushState(etat('analyse'), '');
    afficherToast(TA.express.enCoursRetour);
    return true;
  }
  ecranExpress.value = vers && garde.possible(vers) ? vers : null;
  return false;
}
