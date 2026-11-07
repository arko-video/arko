// Opérations d'édition : chacune prend une recette et renvoie une NOUVELLE recette (jamais modifiée sur place),
// déjà passée au normaliseur. L'interface n'édite la recette qu'avec ces fonctions.
// CONTRAT : signatures fixées. Les temps `t` sont des temps de la vidéo finale ; `i` est l'indice d'un plan.
// Quand une opération est sans effet, la recette d'origine est renvoyée telle quelle (même objet).

import { compiler, dansArret, planAuTemps, sourceA } from './chronologie';
import { FIGE, ySousTitres } from './defauts';
import { gabaritDe } from './destination';
import { normaliser } from './normaliser';
import { arrondir, DUREE_MIN_PLAN, dureePlan } from './temps';
import type { MiseEnPage, Plan, Recette, Sec } from './types';

export { annuler, nouvelHistorique, pousser, retablir, TAILLE_HISTORIQUE, type Historique } from './historique';
export * from './operations-habillage';
export * from './operations-effets';
export * from './operations-rythme';
export { avertissementsZone } from './zone-sure';
export { dureePlan } from './temps';
export * from './operations-youtube';
// Montage auto (novembre 2026) : un fichier par dev (contrat : conception/contrat-montage-auto.md).
export * from './operations-coupes-auto';
export * from './operations-habillage-auto';
export * from './operations-son-auto';
// v3 « Best-of » (contrat : conception/contrat-wankil.md) : un fichier par dev.
export * from './operations-titres'; // dev 1
export * from './operations-derush'; // dev 1
export * from './operations-voix'; // dev 1
export * from './operations-insertion'; // dev 2
export * from './operations-pistes'; // dev 2
export * from './operations-chibis'; // dev 3
export * from './operations-best-of'; // intégrateur
export * from './operations-sequences'; // intégrateur (Best-of v4 : séquences dans Habiller)
export * from './operations-recoupe'; // intégrateur (Best-of v4 : rythme des coupes dans Habiller)

const EPS = 1e-6;
const FIGE_MIN = FIGE.min;

/** Passe la recette modifiée au normaliseur (les sources de la recette font foi). */
function finir(r: Recette): Recette {
  return normaliser(r, { sources: r.sources }).recette;
}

function avecPlans(r: Recette, plans: Plan[]): Recette {
  return finir({ ...r, plans });
}

/** Durée de la source d'un plan (Infinity si inconnue). */
function dureeSource(r: Recette, p: Plan): Sec {
  const id = p.src ?? r.sources.find((s) => s.type === 'video')?.id;
  const s = r.sources.find((x) => x.id === id);
  return s && s.duree > 0 ? s.duree : Infinity;
}

/**
 * Coupe le plan situé au temps de sortie t en deux plans. Sans effet si t est sur une coupe, hors vidéo
 * ou dans un arrêt sur image (l'arrêt reste à la fin du 2ᵉ morceau).
 */
export function scinder(recette: Recette, t: Sec): Recette {
  const sc = compiler(recette);
  const pos = sourceA(sc, t);
  if (!pos || dansArret(pos.plan, t)) return recette;
  const ts = arrondir(pos.ts);
  const p = recette.plans[pos.plan.i]!;
  if (ts - p.de < DUREE_MIN_PLAN - EPS || p.a - ts < DUREE_MIN_PLAN - EPS) return recette;
  const avant: Plan = { ...p, a: ts };
  const apres: Plan = { ...p, de: ts };
  delete avant.fige; // l'arrêt sur image reste à la fin du 2ᵉ morceau
  delete apres.trans; // la transition reste à l'entrée du premier morceau
  const plans = [...recette.plans];
  plans.splice(pos.plan.i, 1, avant, apres);
  return avecPlans(recette, plans);
}

/** Supprime le plan i (impossible de supprimer le dernier plan restant : renvoie la recette inchangée). */
export function supprimer(recette: Recette, i: number): Recette {
  if (recette.plans.length <= 1 || !Number.isInteger(i) || i < 0 || i >= recette.plans.length) return recette;
  return avecPlans(recette, recette.plans.filter((_, k) => k !== i));
}

/** Déplace le début du plan i au temps SOURCE ts (borné : au moins 0,10 s de plan). */
export function rognerDebut(recette: Recette, i: number, ts: Sec): Recette {
  const p = recette.plans[i];
  if (!p || !Number.isFinite(ts)) return recette;
  const de = arrondir(Math.min(Math.max(0, ts), p.a - DUREE_MIN_PLAN));
  if (de === p.de) return recette;
  const plans = [...recette.plans];
  plans[i] = { ...p, de };
  return avecPlans(recette, plans);
}

/** Déplace la fin du plan i au temps SOURCE ts (borné : au moins 0,10 s de plan). */
export function rognerFin(recette: Recette, i: number, ts: Sec): Recette {
  const p = recette.plans[i];
  if (!p || !Number.isFinite(ts)) return recette;
  const a = arrondir(Math.max(Math.min(ts, dureeSource(recette, p)), p.de + DUREE_MIN_PLAN));
  if (a === p.a) return recette;
  const plans = [...recette.plans];
  plans[i] = { ...p, a };
  return avecPlans(recette, plans);
}

/** « Commencer ici » : supprime tout ce qui est avant le temps de sortie t. */
export function commencerIci(recette: Recette, t: Sec): Recette {
  const sc = compiler(recette);
  if (t <= EPS || t >= sc.duree - EPS) return recette;
  const pos = sourceA(sc, t)!;
  const ts = arrondir(pos.ts);
  const reste = recette.plans.slice(pos.plan.i);
  const premier = { ...reste[0]! };
  delete premier.trans;
  if (premier.a - ts < DUREE_MIN_PLAN - EPS) {
    // Il ne resterait qu'une miette de ce plan : on part du suivant.
    if (reste.length === 1) return recette;
    const suivant = { ...reste[1]! };
    delete suivant.trans;
    return avecPlans(recette, [suivant, ...reste.slice(2)]);
  }
  premier.de = Math.max(premier.de, ts);
  return avecPlans(recette, [premier, ...reste.slice(1)]);
}

/** « Finir ici » : supprime tout ce qui est après le temps de sortie t. */
export function finirIci(recette: Recette, t: Sec): Recette {
  const sc = compiler(recette);
  if (t <= EPS || t >= sc.duree - EPS) return recette;
  const pos = sourceA(sc, t)!;
  const ts = arrondir(pos.ts);
  const garde = recette.plans.slice(0, pos.plan.i + 1);
  const dernier = { ...garde[garde.length - 1]! };
  if (dansArret(pos.plan, t)) {
    // t tombe dans l'arrêt sur image : on raccourcit l'arrêt (retiré s'il ferait moins de 0,3 s).
    const reste = arrondir(t - pos.plan.tFige);
    if (reste >= FIGE_MIN) dernier.fige = reste;
    else delete dernier.fige;
    return avecPlans(recette, [...garde.slice(0, -1), dernier]);
  }
  delete dernier.fige; // on coupe avant la fin du plan : plus d'arrêt sur image
  if (ts - dernier.de < DUREE_MIN_PLAN - EPS) {
    // t tombe sur (ou juste après) une coupe : on s'arrête à la fin du plan précédent.
    if (garde.length === 1) return recette;
    return avecPlans(recette, garde.slice(0, -1));
  }
  dernier.a = Math.min(dernier.a, ts);
  return avecPlans(recette, [...garde.slice(0, -1), dernier]);
}

/**
 * Déplace le plan i pour qu'il soit centré sur le temps SOURCE ts, en gardant sa durée
 * (borné au début et à la fin de la source). Sert à naviguer dans les longues vidéos.
 */
export function deplacerPlan(recette: Recette, i: number, ts: Sec): Recette {
  const p = recette.plans[i];
  if (!p || !Number.isFinite(ts)) return recette;
  const longueur = p.a - p.de;
  const fin = dureeSource(recette, p);
  let de = Math.max(0, ts - longueur / 2);
  if (Number.isFinite(fin)) de = Math.max(0, Math.min(de, fin - longueur));
  de = arrondir(de);
  const a = arrondir(Number.isFinite(fin) ? Math.min(de + longueur, fin) : de + longueur);
  if (de === p.de && a === p.a) return recette;
  const plans = [...recette.plans];
  plans[i] = { ...p, de, a };
  return avecPlans(recette, plans);
}

/**
 * Ajoute un nouveau plan de `dur` secondes centré sur le temps SOURCE ts, juste après le plan `apres`
 * (à la fin si absent). Il prend la source du plan `apres` (ou la première source vidéo).
 */
export function ajouterPlan(recette: Recette, ts: Sec, dur: Sec = 30, apres?: number): Recette {
  if (!Number.isFinite(ts) || !Number.isFinite(dur) || dur < DUREE_MIN_PLAN) return recette;
  const ou = apres !== undefined && apres >= 0 && apres < recette.plans.length ? apres + 1 : recette.plans.length;
  const modele = recette.plans[ou - 1] ?? recette.plans[0];
  const nouveau: Plan = modele?.src ? { src: modele.src, de: 0, a: dur } : { de: 0, a: dur };
  const fin = dureeSource(recette, nouveau);
  const longueur = Number.isFinite(fin) ? Math.min(dur, fin) : dur;
  let de = Math.max(0, ts - longueur / 2);
  if (Number.isFinite(fin)) de = Math.max(0, Math.min(de, fin - longueur));
  nouveau.de = arrondir(de);
  nouveau.a = arrondir(de + longueur);
  const plans = [...recette.plans];
  plans.splice(ou, 0, nouveau);
  return avecPlans(recette, plans);
}

/**
 * Change la mise en page globale (ex. { type: 'recadre', x: 0.4 }). Des sous-titres restés à la hauteur
 * par défaut suivent la nouvelle mise en page (ex. sur la jointure du jeu + webcam).
 */
export function choisirMise(recette: Recette, mise: MiseEnPage): Recette {
  if (JSON.stringify(mise) === JSON.stringify(recette.mise)) return recette;
  const r = finir({ ...recette, mise: { ...mise } as MiseEnPage });
  const st = recette.sousTitres;
  if (st && st.y === arrondir(ySousTitres(recette.mise, gabaritDe(recette))) && r.sousTitres) {
    return finir({ ...r, sousTitres: { ...r.sousTitres, y: arrondir(ySousTitres(r.mise, gabaritDe(r))) } });
  }
  return r;
}

/** Durée finale en secondes = Σ dureePlan (avec les arrêts sur image). */
export function dureeFinale(recette: Recette): Sec {
  return arrondir(recette.plans.reduce((s, p) => s + dureePlan(p), 0));
}

/** Pour un temps de sortie t : indice du plan et temps source correspondant (null si hors vidéo). */
export function planA(recette: Recette, t: Sec): { i: number; ts: Sec } | null {
  const sc = compiler(recette);
  if (!planAuTemps(sc, t)) return null;
  const pos = sourceA(sc, t)!;
  return { i: pos.plan.i, ts: arrondir(pos.ts) };
}

/** Temps de sortie du début de chaque plan, plus la fin (longueur = plans.length + 1). */
export function bornesDesPlans(recette: Recette): Sec[] {
  const res: Sec[] = [0];
  let t = 0;
  for (const p of recette.plans) {
    t += dureePlan(p);
    res.push(arrondir(t));
  }
  return res;
}
