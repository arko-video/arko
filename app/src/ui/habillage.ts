// État et actions de l'étape Habiller (accroche, textes, sous-titres). La recette passe toujours
// par les opérations de src/recette puis par l'historique (modifier), comme dans le reste de l'interface.

import { signal } from '@preact/signals';
import {
  ajouterTexte,
  dureeFinale,
  lignesSousTitres,
  modifierTexte,
  supprimerTexte,
  type LigneSousTitres,
} from '../recette/operations';
import { ACCROCHE, TEXTE } from '../recette/defauts';
import type { Recette, Texte } from '../recette/types';
import { reinitialiserEffets } from './effets';
import { modifier, recette, recetteTemporaire, teteLecture } from './etat';
import { auCentieme } from './format';
import { ajouterTexteLibre } from './placement';

export type Outil = 'couper' | 'accroche' | 'texte' | 'sousTitres' | 'sons' | 'transitions' | 'zoom' | 'combos' | 'modeles' | 'chapitres' | 'generiques';
export const OUTILS: Outil[] = ['couper', 'accroche', 'texte', 'sousTitres', 'sons', 'transitions', 'zoom', 'combos', 'modeles', 'chapitres', 'generiques'];
/** Outils réservés à YouTube 16:9. */
export const OUTILS_YOUTUBE: readonly Outil[] = ['chapitres', 'generiques'];

/** Outil ouvert dans le panneau du bas (null = barre d'outils). Changé par ouvrirOutil / fermerOutil. */
export const outilOuvert = signal<Outil | null>(null);

/** Indice (dans recette.textes) du texte en cours de modification dans l'outil Texte. */
export const texteChoisi = signal<number | null>(null);

/** true pendant qu'on fait glisser un texte sur l'aperçu (la zone sûre s'affiche toute seule). */
export const glisseTexte = signal(false);

/** Clavier virtuel ouvert (visualViewport réduit) : le panneau se réduit au champ de saisie. */
export const clavierOuvert = signal(false);

/* ------------------------------------------------------------ panneau (avec le bouton Retour d'Android) */

interface EtatPanneau {
  arko: true;
  ecran: 'habiller';
  outil: Outil;
}

/** Ouvre un outil. Le 1er panneau ajoute une entrée d'historique : Retour (Android ou en-tête) le ferme. */
export function ouvrirOutil(o: Outil) {
  const etat: EtatPanneau = { arko: true, ecran: 'habiller', outil: o };
  if (outilOuvert.peek() === null) history.pushState(etat, '');
  else history.replaceState(etat, '');
  if (outilOuvert.peek() !== o) reinitialiserEffets();
  outilOuvert.value = o;
}

export function fermerOutil() {
  validerSaisie();
  if (outilOuvert.peek() === null) return;
  const etat = history.state as Partial<EtatPanneau> | null;
  if (etat?.outil) history.back();
  else outilOuvert.value = null;
}

/** Appelé par la navigation quand l'historique du navigateur change. */
export function panneauDepuisHistorique(etat: unknown) {
  validerSaisie();
  const o = (etat as Partial<EtatPanneau> | null)?.outil;
  const avant = outilOuvert.peek();
  outilOuvert.value = o && OUTILS.includes(o) ? o : null;
  if (outilOuvert.peek() !== 'texte') texteChoisi.value = null;
  if (outilOuvert.peek() !== avant) reinitialiserEffets();
}

/** Remet l'étape à zéro (nouveau projet, reprise). */
export function reinitialiserHabillage() {
  outilOuvert.value = null;
  texteChoisi.value = null;
  glisseTexte.value = false;
  reinitialiserEffets();
}

/* ------------------------------------------------------------ saisie (aperçu en direct, historique au repos) */

let minuteurSaisie: ReturnType<typeof setTimeout> | undefined;

/** Montre tout de suite la recette en cours de saisie, et l'écrit dans l'historique après 700 ms de pause. */
export function saisir(nouvelle: Recette) {
  recetteTemporaire.value = nouvelle;
  clearTimeout(minuteurSaisie);
  minuteurSaisie = setTimeout(validerSaisie, 700);
}

/** Écrit la saisie en cours dans l'historique (fin de frappe, Entrée, fermeture du panneau). */
export function validerSaisie() {
  clearTimeout(minuteurSaisie);
  const t = recetteTemporaire.peek();
  if (!t || glisseTexte.peek()) return;
  recetteTemporaire.value = null;
  modifier(() => t);
}

/** Recette de départ d'une modification : la saisie en cours si elle existe, sinon la recette validée. */
export function base(): Recette | null {
  return recetteTemporaire.peek() ?? recette.peek();
}

/* ------------------------------------------------------------ accroche */

/** Indice du texte d'accroche (reconnu par son rôle, jamais par sa place ou sa durée), ou -1. */
export function indiceAccroche(r: Recette): number {
  return r.textes.findIndex((x) => x.role === 'accroche');
}

/** Écrit (ou crée) l'accroche. Un texte vide la retire. `direct` = sans attendre (suggestion touchée). */
export function ecrireAccroche(txt: string, direct = false) {
  const r = base();
  if (!r) return;
  const i = indiceAccroche(r);
  let nouvelle: Recette;
  if (!txt.trim()) nouvelle = i >= 0 ? supprimerTexte(r, i) : r;
  else if (i >= 0) nouvelle = modifierTexte(r, i, { txt });
  else nouvelle = ajouterTexte(r, { ...ACCROCHE, role: 'accroche', x: TEXTE.x, txt }).recette;
  if (direct) {
    recetteTemporaire.value = null;
    clearTimeout(minuteurSaisie);
    modifier(() => nouvelle);
  } else saisir(nouvelle);
}

/* ------------------------------------------------------------ textes */

/** Écrit le texte choisi, ou crée un nouveau texte à la tête de lecture. */
export function ecrireTexte(txt: string) {
  const r = base();
  if (!r) return;
  const i = texteChoisi.peek();
  if (i !== null && r.textes[i]) {
    saisir(txt.trim() ? modifierTexte(r, i, { txt }) : r);
    return;
  }
  if (!txt.trim()) return;
  const t = auCentieme(Math.min(teteLecture.peek(), Math.max(0, dureeFinale(r) - TEXTE.durMin)));
  // Jamais sur l'accroche ni sur un autre texte visible en même temps.
  const res = ajouterTexteLibre(r, { txt, t, style: STYLE_NOUVEAU, dur: Math.min(TEXTE.dur, dureeFinale(r) - t) });
  if (res.i < 0) return;
  texteChoisi.value = res.i;
  saisir(res.recette);
}

/** Style d'un nouveau texte (« bulle » : on le distingue de l'accroche). */
const STYLE_NOUVEAU = 'bulle';

/** Modifie le texte choisi tout de suite (style, durée…). */
export function reglerTexte(partiel: Partial<Texte>) {
  const i = texteChoisi.peek();
  const r = base();
  if (i === null || !r?.textes[i]) return;
  recetteTemporaire.value = null;
  clearTimeout(minuteurSaisie);
  modifier(() => modifierTexte(r, i, partiel));
}

export function supprimerTexteChoisi() {
  const i = texteChoisi.peek();
  const r = base();
  if (i === null || !r?.textes[i]) return;
  recetteTemporaire.value = null;
  clearTimeout(minuteurSaisie);
  modifier(() => supprimerTexte(r, i));
  texteChoisi.value = null;
}

/** true si le texte dure jusqu'à la fin de la vidéo. */
export function jusquALaFin(r: Recette, x: Texte): boolean {
  return x.t + (x.dur ?? TEXTE.dur) >= dureeFinale(r) - 0.05;
}

/* ------------------------------------------------------------ lignes de sous-titres (mémorisées par recette) */

const cacheLignes = new WeakMap<Recette, LigneSousTitres[]>();

/** Lignes de sous-titres de r, calculées une seule fois par recette (pas à chaque image de la lecture). */
export function lignesDe(r: Recette): LigneSousTitres[] {
  let l = cacheLignes.get(r);
  if (!l) {
    try {
      l = r.sousTitres && Array.isArray(r.sousTitres.mots) && r.sousTitres.mots.length > 0 ? lignesSousTitres(r) : [];
    } catch (e) {
      console.error(e);
      l = [];
    }
    cacheLignes.set(r, l);
  }
  return l;
}
