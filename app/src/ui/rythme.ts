// Phase 4 « rythme » : pics sonores (calculés en arrière-plan, une fois par recette, gardés en cache), alerte de rythme,
// conseil d'accroche, vitesse et arrêt sur image du plan choisi, combos et modèles.
// Comme ailleurs, tout passe par modifier() : Annuler / Rétablir marche sur chaque action.

import { computed, effect, signal } from '@preact/signals';
import { picsSonores, picsSonoresForts } from '../moteur/api';
import {
  aimanter,
  alerteRythme,
  appliquerCombo,
  changerVitesse,
  conseilAccroche,
  figerFin,
  modeleMeilleurDAbord,
  modeleTop3,
  picLePlusFort,
  type Combo,
} from '../recette/operations-rythme';
import type { Recette } from '../recette/types';
import { T } from '../textes-fr';
import {
  afficherToast,
  annulerAction,
  ecran,
  historique,
  modifier,
  projetActuel,
  quandProjetQuitte,
  recette,
  sources,
  teteLecture,
} from './etat';
import { auCentieme } from './format';
import { vibrer } from './guide';
import { chercher, mettreEnPause } from './lecture';

/** Recul appliqué au toucher d'un combo (temps de réaction). */
export const RECUL_COMBO = 0.15;

/** Pics sonores (temps de sortie) calculés pour la recette `pour`. */
export const pics = signal<{ pour: Recette; t: number[] } | null>(null);

let enVol: { pour: Recette; p: Promise<number[]> } | null = null;

quandProjetQuitte(() => {
  pics.value = null;
  enVol = null;
});

/** Pics de la recette validée : tout de suite s'ils sont en cache, sinon calculés (un seul calcul à la fois par recette). */
export function calculerPics(): Promise<number[]> {
  const r = recette.peek();
  if (!r) return Promise.resolve([]);
  const deja = pics.peek();
  if (deja?.pour === r) return Promise.resolve(deja.t);
  if (enVol?.pour === r) return enVol.p;
  const projet = projetActuel();
  const p = picsSonores(r, sources.peek())
    .catch((e: unknown) => {
      console.error(e);
      return [] as number[];
    })
    .then((t) => {
      if (projet === projetActuel()) pics.value = { pour: r, t: [...t] };
      if (enVol?.pour === r) enVol = null;
      return [...t];
    });
  enVol = { pour: r, p };
  return p;
}

/** Pics de la recette ACTUELLE ; pendant leur recalcul, aucun (pas d'aimant sur des temps décalés, M-3). */
export function picsActuels(): number[] {
  const p = pics.peek();
  return p && p.pour === recette.peek() ? p.t : [];
}

/** Recalcule les pics en arrière-plan, 0,8 s après chaque modification, sur Couper et Habiller. */
export function suivrePics(): () => void {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const arreter = effect(() => {
    const r = recette.value;
    const e = ecran.value;
    clearTimeout(minuteur);
    if (r && (e === 'couper' || e === 'habiller')) minuteur = setTimeout(() => void calculerPics(), 800);
  });
  return () => {
    clearTimeout(minuteur);
    arreter();
  };
}

/** Le passage le plus mou (un seul repère), avec les derniers pics connus. */
export const alerte = computed(() => {
  const r = recette.value;
  if (!r) return null;
  try {
    return alerteRythme(r, pics.value?.t ?? []);
  } catch (e) {
    console.error(e);
    return null;
  }
});

/** Conseil si l'accroche (3 premières secondes) est calme. */
export const conseil = computed(() => {
  const r = recette.value;
  if (!r) return null;
  try {
    return conseilAccroche(r);
  } catch (e) {
    console.error(e);
    return null;
  }
});

/** Toucher du repère orange : la tête va au passage et le message s'affiche. */
export function allerAuPassage() {
  const a = alerte.peek();
  if (!a) return;
  mettreEnPause();
  chercher(a.t0);
  afficherToast(a.message, 6000);
}

/** Message avec « Annuler », qui n'annule que si rien n'a changé depuis. */
function annulable(message: string) {
  const apres = historique.peek()?.present;
  afficherToast(message, 5000, {
    label: T.annuler,
    agir: () => {
      if (historique.peek()?.present === apres) annulerAction();
    },
  });
}

/* ------------------------------------------------------------ Couper : plan choisi */

function agir(op: (r: Recette) => Recette) {
  mettreEnPause();
  const t = teteLecture.peek();
  if (modifier(op)) chercher(t);
}

export const reglerVitesse = (i: number, vit: number) => agir((r) => changerVitesse(r, i, vit));
export const reglerArret = (i: number, dur: number | null) => agir((r) => figerFin(r, i, dur));

/* ------------------------------------------------------------ Habiller : combos et modèles */

/** Pose un combo au toucher, même pendant la lecture : on recule de 0,15 s puis on s'aimante au pic le plus proche. */
export function poserCombo(c: Combo) {
  const t = auCentieme(aimanter(Math.max(0, teteLecture.peek() - RECUL_COMBO), picsActuels()));
  if (modifier((r) => appliquerCombo(r, c, t))) {
    vibrer();
    annulable(T.combos.ajoute(T.combos.noms[c]));
  } else afficherToast(T.combos.rien);
}

/** Top 3 (le bouton est grisé quand modeleTop3 renvoie null). */
export function appliquerTop3() {
  mettreEnPause();
  if (modifier((r) => modeleTop3(r) ?? r)) {
    chercher(0);
    annulable(T.modeles.applique(T.modeles.top3));
  }
}

export function appliquerMeilleur(t: number) {
  mettreEnPause();
  if (modifier((r) => modeleMeilleurDAbord(r, auCentieme(t)))) {
    chercher(0);
    annulable(T.modeles.applique(T.modeles.meilleur));
  }
}

/** « Trouver le moment fort » : le pic le PLUS FORT de la recette, d'après la force donnée par le moteur (I-2). */
export async function trouverMeilleurMoment() {
  const r = recette.peek();
  if (!r) return;
  const projet = projetActuel();
  let t: number | null = null;
  try {
    t = picLePlusFort(await picsSonoresForts(r, sources.peek()));
  } catch (e) {
    console.error(e);
  }
  // Projet quitté ou recette modifiée pendant le calcul : le temps trouvé ne vaut plus.
  if (projet !== projetActuel() || recette.peek() !== r) return;
  if (t === null) afficherToast(T.modeles.pasDePic, 5000);
  else appliquerMeilleur(t);
}
