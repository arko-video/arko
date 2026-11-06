// Compilation YouTube (monteur IA) : plusieurs clips gardés mis bout à bout dans UNE recette 16:9. Pure.
// Les textes (en temps de sortie) sont décalés ; sons, zooms et mots (en temps source) suivent leurs images ;
// un fondu au noir sépare deux clips, et chaque clip devient un chapitre.

import { dureeCorps } from './generiques';
import { normaliser } from './normaliser';
import type { Chapitre, Mot, Plan, Recette, Son, Texte, Zoom } from './types';

export function fusionnerRecettes(liste: readonly Recette[], titre = 'Compilation'): Recette | null {
  const base = liste[0];
  if (!base) return null;
  const plans: Plan[] = [];
  const textes: Texte[] = [];
  const sons: Son[] = [];
  const zooms: Zoom[] = [];
  const mots = new Map<string, Mot>();
  const chapitres: Chapitre[] = [];
  let decalage = 0;
  liste.forEach((r, k) => {
    r.plans.forEach((p, i) => plans.push(i === 0 && k > 0 ? { ...p, trans: { type: 'noir', dur: 0.4 } } : { ...p }));
    for (const x of r.textes) textes.push({ ...x, t: x.t + decalage });
    for (const s of r.sons) sons.push(s.ts !== undefined ? { ...s } : { ...s, t: (s.t ?? 0) + decalage });
    for (const z of r.zooms) zooms.push(z.ts !== undefined ? { ...z } : { ...z, t: (z.t ?? 0) + decalage });
    if (r.sousTitres && Array.isArray(r.sousTitres.mots)) for (const m of r.sousTitres.mots) mots.set(`${m[1]}|${m[0]}`, m);
    chapitres.push({ t: k === 0 ? 0 : decalage, nom: (r.titre ?? '').trim() || `Moment ${k + 1}` });
    decalage += dureeCorps(r);
  });
  const st = liste.find((r) => r.sousTitres)?.sousTitres ?? null;
  const sources = liste.flatMap((r) => r.sources).filter((s, i, tout) => tout.findIndex((x) => x.id === s.id) === i);
  const brute: Recette = {
    ...base,
    titre,
    destination: 'youtube',
    sources,
    plans,
    textes,
    sons,
    zooms,
    sousTitres: st ? { ...st, y: undefined, mots: [...mots.values()].sort((a, b) => a[1] - b[1]) } : null,
    chapitres,
  };
  delete brute.statut;
  return normaliser(brute, { sources }).recette;
}
