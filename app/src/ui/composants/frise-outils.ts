// Calculs purs de la frise (règle, zoom, bornes). Aucune dépendance au DOM.

/** Marge à gauche et à droite du contenu : laisse la place aux zones de toucher des poignées. */
export const MARGE_FRISE = 56;
/** Zoom maximal : 600 px par seconde (une image à 30 i/s = 20 px). */
export const PPS_MAX = 600;

/** Pas de la règle (en secondes) pour que deux graduations soient espacées d'au moins `minPx`. */
export function pasDeRegle(pps: number, minPx = 56): number {
  const pas = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
  for (const p of pas) if (p * pps >= minPx) return p;
  return pas[pas.length - 1];
}

/** Étiquette d'une graduation : « 0:02 » ou « 0:02,5 » sous la seconde. */
export function etiquetteRegle(t: number, pas: number): string {
  const min = Math.floor(t / 60 + 1e-9);
  const s = t - min * 60;
  const entier = Math.floor(s + 1e-9);
  const base = `${min}:${String(entier).padStart(2, '0')}`;
  if (pas >= 1) return base;
  const dix = Math.round((s - entier) * 10);
  return dix ? `${base},${dix}` : base;
}

/** Graduations visibles entre t0 et t1. */
export function graduations(t0: number, t1: number, pas: number): number[] {
  const res: number[] = [];
  const debut = Math.max(0, Math.ceil(t0 / pas - 1e-9) * pas);
  for (let t = debut; t <= t1 + 1e-9 && res.length < 400; t += pas) res.push(Math.round(t * 100) / 100);
  return res;
}

/** Borne le décalage horizontal pour ne pas sortir du contenu. */
export function bornerDecalage(decalage: number, largeurContenu: number, largeurVue: number): number {
  return Math.min(Math.max(0, decalage), Math.max(0, largeurContenu - largeurVue));
}

export function borner(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}
