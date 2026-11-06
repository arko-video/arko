// Opérations de « Ma bibliothèque » : poser un fond vert ou un mème (incrustation par-dessus la vidéo), insérer un
// mème « Coupure » (un plan du mème au milieu de la vidéo), régler, retirer, et nettoyer à la reprise un clip qui
// n'est plus sur l'appareil. Mêmes règles que operations.ts : NOUVELLE recette normalisée ; la recette d'origine si
// rien ne change ; une opération = un seul Annuler.

import { compiler, sourceA } from './chronologie';
import { normaliser } from './normaliser';
import { scinder } from './operations';
import { arrondir, dureePlan } from './temps';
import type { Incrustation, Plan, Recette, Sec, Source } from './types';

function finir(origine: Recette, r: Recette): Recette {
  const res = normaliser(r, { sources: r.sources }).recette;
  return JSON.stringify(res) === JSON.stringify(origine) ? origine : res;
}

/** Premier id « bN » libre pour un clip de la bibliothèque (`autres` : ids déjà pris ailleurs, sources ouvertes). */
export function idClip(r: Recette, autres: readonly string[] = []): string {
  const pris = new Set([...r.sources.map((s) => s.id), ...autres]);
  let n = 1;
  while (pris.has(`b${n}`)) n++;
  return `b${n}`;
}

/** Les sources de clips (`bib`) que plus rien n'utilise (ni un plan ni une incrustation) sont retirées. */
export function sansClipsOrphelins(r: Recette): Recette {
  const utilisees = new Set([...r.plans.map((p) => p.src), ...(r.incrustations ?? []).map((i) => i.src)]);
  const sources = r.sources.filter((s) => !s.bib || utilisees.has(s.id));
  return sources.length === r.sources.length ? r : { ...r, sources };
}

function avecSource(r: Recette, source?: Source): Recette {
  return source && !r.sources.some((s) => s.id === source.id) ? { ...r, sources: [...r.sources, { ...source }] } : r;
}

/** Pose un fond vert ou un mème en incrustation. Renvoie la recette et l'indice de l'incrustation (−1 si refusée). */
export function ajouterIncrustation(r: Recette, inc: Incrustation, source?: Source): { recette: Recette; i: number } {
  const res = finir(r, { ...avecSource(r, source), incrustations: [...(r.incrustations ?? []), { ...inc }] });
  const liste = res.incrustations ?? [];
  if (res === r || liste.length !== (r.incrustations?.length ?? 0) + 1) return { recette: r, i: -1 };
  // La liste est triée par temps : on retrouve la nouvelle (même source, même temps, la dernière de ce genre).
  let i = -1;
  liste.forEach((x, k) => {
    if (x.src === inc.src && Math.abs(x.t - arrondir(inc.t)) < 0.011) i = k;
  });
  return { recette: res, i };
}

/** Règle une incrustation (position, taille, son, début / fin, détourage…). */
export function modifierIncrustation(r: Recette, i: number, partiel: Partial<Incrustation>): Recette {
  const liste = r.incrustations ?? [];
  if (!Number.isInteger(i) || !liste[i]) return r;
  const nouvelle: Incrustation = { ...liste[i]!, ...partiel };
  for (const [k, v] of Object.entries(partiel)) if (v === undefined) delete (nouvelle as unknown as Record<string, unknown>)[k];
  return finir(r, { ...r, incrustations: liste.map((x, k) => (k === i ? nouvelle : x)) });
}

/** Retire une incrustation (et sa source si plus rien ne l'utilise). Le champ disparaît avec la dernière. */
export function supprimerIncrustation(r: Recette, i: number): Recette {
  const liste = r.incrustations ?? [];
  if (!Number.isInteger(i) || !liste[i]) return r;
  const reste = liste.filter((_, k) => k !== i);
  const res: Recette = { ...r, incrustations: reste };
  if (reste.length === 0) delete res.incrustations;
  return finir(r, sansClipsOrphelins(res));
}

/**
 * Mème « Coupure » : le passage [de, a] du mème est INSÉRÉ au temps de sortie t (le plan sous la tête est coupé en
 * deux ; tout près d'une coupe, on se cale sur elle). Plein écran en fond flou (bandes floues si le format diffère),
 * avec le son du mème ; la partie de jeu reprend juste après. Renvoie aussi l'indice du plan du mème.
 */
export function insererMeme(r: Recette, t: Sec, source: Source, de: Sec, a: Sec): { recette: Recette; i: number } {
  const base = avecSource(r, source);
  const coupee = scinder(base, t);
  let ou: number;
  if (coupee !== base) {
    ou = sourceA(compiler(base), t)!.plan.i + 1;
  } else {
    // Sur une coupe, dans un arrêt sur image ou trop près d'un bord : la coupe la plus proche.
    const bornes: Sec[] = [0];
    for (const p of base.plans) bornes.push(bornes[bornes.length - 1]! + dureePlan(p));
    ou = bornes.reduce((best, b, k) => (Math.abs(b - t) < Math.abs(bornes[best]! - t) ? k : best), 0);
  }
  const plan: Plan = { src: source.id, de: arrondir(de), a: arrondir(a), mise: { type: 'flou', y: 0.5 } };
  const plans = [...coupee.plans];
  plans.splice(ou, 0, plan);
  const res = finir(r, { ...coupee, plans });
  if (res === r || res.plans.length !== coupee.plans.length + 1) return { recette: r, i: -1 };
  return { recette: res, i: ou };
}

/** Change le début / la fin gardés d'un mème « Coupure » (plan i). */
export function couperMeme(r: Recette, i: number, de: Sec, a: Sec): Recette {
  const p = r.plans[i];
  if (!p) return r;
  return finir(r, { ...r, plans: r.plans.map((x, k) => (k === i ? { ...x, de: arrondir(de), a: arrondir(a) } : x)) });
}

/** true si le plan i est un mème « Coupure » (sa source est un clip de la bibliothèque). */
export function estPlanMeme(r: Recette, i: number): boolean {
  const src = r.plans[i]?.src;
  return !!src && !!r.sources.find((s) => s.id === src)?.bib;
}

/**
 * À la reprise : retire les fonds verts, mèmes en incrustation et mèmes « Coupure » dont le clip n'est plus dans
 * Ma bibliothèque (`ids` = ids de sources). Pure. Un montage qui n'aurait plus aucun plan garde les siens.
 */
export function retirerClipsManquants(r: Recette, ids: readonly string[]): Recette {
  if (ids.length === 0) return r;
  const plans = r.plans.filter((p) => !p.src || !ids.includes(p.src));
  const incrustations = (r.incrustations ?? []).filter((x) => !ids.includes(x.src));
  const res: Recette = { ...r, plans: plans.length > 0 ? plans : r.plans, sources: r.sources.filter((s) => !ids.includes(s.id) || !plans.length) };
  if (r.incrustations) {
    if (incrustations.length > 0) res.incrustations = incrustations;
    else delete res.incrustations;
  }
  return finir(r, res);
}
