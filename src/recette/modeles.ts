// Modèles (phase 4) : des montages tout faits, appliqués en UNE opération (donc annulables d'un coup).
// Fonctions pures : elles renvoient une NOUVELLE recette normalisée et ne suppriment jamais de plan.

import { ancrage, compiler, sourceA } from './chronologie';
import { SON } from './defauts';
import { normaliser } from './normaliser';
import { arrondir, dureePlan } from './temps';
import type { Plan, Recette, Sec, Son, Texte } from './types';

/** Durée des textes « #3 », « #2 », « #1 » et de l'accroche « TOP 3 ». */
export const TOP3 = { dureeNumero: 1.2, dureeAccroche: 1.5, yNumero: 0.32, son: 'impact.boom', transition: 'zoom' };
/** « Le meilleur d'abord » : longueur du passage copié (dans la vidéo finale). Montage express : 6 s. */
export const MEILLEUR = { duree: 1.5, dureeExpress: 6, texte: 'ATTENDS…', transition: 'glitch' };

function finir(r: Recette): Recette {
  return normaliser(r, { sources: r.sources }).recette;
}

const aUneAccroche = (r: Recette) => r.textes.some((x) => x.role === 'accroche');

/**
 * Modèle « Top 3 » : null s'il y a moins de 3 plans (l'interface explique pourquoi).
 * Les 3 DERNIERS plans deviennent #3, #2, #1 : texte au début de chacun, transition zoom entre eux,
 * son impact.boom à chaque début, et accroche « TOP 3 » au début si aucune accroche n'existe.
 */
export function modeleTop3(recette: Recette): Recette | null {
  const n = recette.plans.length;
  if (n < 3) return null;
  const sc = compiler(recette);
  const derniers = [n - 3, n - 2, n - 1];
  const plans: Plan[] = recette.plans.map((p, k) => (k === n - 2 || k === n - 1 ? { ...p, trans: TOP3.transition } : p));
  // On retire les numéros posés par un Top 3 précédent (rôle « top3 ») pour ne pas les doubler.
  // Un texte de l'utilisateur qui vaut « #1 » n'a pas ce rôle : il est gardé.
  const textes: Texte[] = recette.textes.filter((x) => x.role !== 'top3');
  const sons: Son[] = [...recette.sons];
  derniers.forEach((k, rang) => {
    const t0 = sc.plans[k]!.t0;
    textes.push({ txt: `#${3 - rang}`, role: 'top3', style: 'alerte', t: arrondir(t0), dur: TOP3.dureeNumero, y: TOP3.yNumero });
    sons.push({ id: TOP3.son, ...ancrage(sc, t0), vol: SON.vol });
  });
  if (!aUneAccroche(recette)) {
    textes.push({ txt: 'TOP 3', role: 'accroche', style: 'accroche', t: 0, dur: TOP3.dureeAccroche });
  }
  return finir({ ...recette, plans, textes, sons });
}

/** Durée de la source d'un plan (Infinity si inconnue). */
function dureeSource(r: Recette, p: Plan): Sec {
  const id = p.src ?? r.sources.find((s) => s.type === 'video')?.id;
  const s = r.sources.find((x) => x.id === id);
  return s && s.duree > 0 ? s.duree : Infinity;
}

/**
 * Modèle « Le meilleur d'abord » : copie `duree` s (1,5 s par défaut, 6 s pour le Montage express) autour de `t`
 * (temps de sortie, même source, même vitesse)
 * au tout début, avec le texte « ATTENDS… » (ou `o.texte` ; null = aucun texte : Best-of sans titres) et une
 * transition glitch vers la suite.
 * Les textes, sons, zooms et le son guide posés en TEMPS DE SORTIE sont décalés de la durée ajoutée ;
 * ceux posés en temps source (ts) et les sous-titres suivent tout seuls.
 */
export function modeleMeilleurDAbord(recette: Recette, t: Sec, duree: Sec = MEILLEUR.duree, o: { texte?: string | null } = {}): Recette {
  if (recette.plans.length === 0 || !Number.isFinite(t)) return recette;
  const sc = compiler(recette);
  const pos = sourceA(sc, Math.min(Math.max(t, 0), sc.duree));
  if (!pos) return recette;
  const original = recette.plans[pos.plan.i]!;
  const vit = original.vit ?? 1;
  const longueur = Math.max(0.5, duree) * vit; // en secondes de source
  const fin = dureeSource(recette, original);
  let de = Math.max(0, pos.ts - longueur / 2);
  if (Number.isFinite(fin)) de = Math.max(0, Math.min(de, fin - longueur));
  const copie: Plan = { de: arrondir(de), a: arrondir(Math.min(de + longueur, fin)) };
  if (original.src) copie.src = original.src;
  if (vit !== 1) copie.vit = vit;
  if (original.mise) copie.mise = { ...original.mise };
  const d = arrondir(dureePlan(copie));

  const [premier, ...reste] = recette.plans;
  const plans: Plan[] = [copie, { ...premier!, trans: MEILLEUR.transition }, ...reste];
  const decaler = <T extends { t?: Sec; ts?: Sec }>(e: T): T =>
    e.ts === undefined && e.t !== undefined ? { ...e, t: arrondir(e.t + d) } : e;
  const textes: Texte[] = recette.textes.map((x) => ({ ...x, t: arrondir(x.t + d) }));
  const texte = o.texte === undefined ? MEILLEUR.texte : o.texte;
  if (texte !== null && texte.trim()) {
    const attends: Texte = { txt: texte, style: 'accroche', t: 0, dur: d };
    if (!aUneAccroche(recette)) attends.role = 'accroche';
    textes.unshift(attends);
  }
  const guide = recette.guide ? { ...recette.guide, t: arrondir((recette.guide.t ?? 0) + d) } : null;
  return finir({
    ...recette,
    plans,
    textes,
    sons: recette.sons.map(decaler),
    zooms: recette.zooms.map(decaler),
    guide,
  });
}
