// Entrée du monteur IA depuis Importer : une vidéo de plus de 5 min ouvre le choix
// « Je monte moi-même » / « Monteur IA ». Le monteur garde la vidéo ouverte pour l'analyse et la revue.

import { fermerSource, type SourceOuverte } from '../../moteur/api';
import { sources } from '../etat';
import { demarrerMontage } from '../montages';
import { choixVisible, etatAnalyse, resultat, requeteEnvoyee, revue, sourceMonteur } from './etat-monteur';
import { allerMonteur } from './navigation-monteur';
import { entrerMonteur } from './revue-monteur';

/** Ferme l'ancienne vidéo du monteur si plus rien ne s'en sert. */
function remplacerSource(s: SourceOuverte | null) {
  const ancienne = sourceMonteur.peek();
  if (ancienne && ancienne !== s && !sources.peek().includes(ancienne)) fermerSource(ancienne);
  sourceMonteur.value = s;
}

/** Une longue vidéo vient d'être ouverte : on propose le monteur IA. */
export function proposerMonteur(source: SourceOuverte) {
  remplacerSource(source);
  choixVisible.value = true;
}

/** « Je monte moi-même » : le parcours normal (Couper). */
export async function monterSoiMeme() {
  const s = sourceMonteur.peek();
  if (!s) return;
  choixVisible.value = false;
  sourceMonteur.value = null;
  await demarrerMontage(s);
}

/** « Monteur IA » : écran Demande (une nouvelle vidéo repart d'une analyse vierge). */
export async function ouvrirMonteur() {
  const s = sourceMonteur.peek();
  if (!s) return;
  await entrerMonteur();
  sourceMonteur.value = s;
  if (resultat.peek() && revue.peek()?.source.emp !== s.infos.emp) resultat.value = null;
  const ph = etatAnalyse.peek().phase;
  if (ph !== 'encours' && ph !== 'ia') {
    etatAnalyse.value = { phase: 'avant' };
    requeteEnvoyee.value = null;
  }
  allerMonteur('demande');
}

/** Oublie le choix (une autre vidéo va être choisie). */
export function fermerChoix() {
  choixVisible.value = false;
  remplacerSource(null);
}
