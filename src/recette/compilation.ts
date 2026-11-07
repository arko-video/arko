// Compilation YouTube (monteur IA) : plusieurs clips gardés mis bout à bout dans UNE recette 16:9. Pure.
// Les textes (en temps de sortie) sont décalés ; sons, zooms et mots (en temps source) suivent leurs images ;
// un fondu au noir sépare deux clips, et chaque clip devient un chapitre. Les persos de qui parle (voix, tours,
// avatars) de tous les clips sont réunis.

import { dureeCorps } from './generiques';
import { normaliser } from './normaliser';
import type { Chapitre, Mot, Personne, Plan, Recette, Son, Texte, TourDeParole, Zoom } from './types';

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
  // Persos de qui parle : les voix de tous les clips (même vidéo, mêmes ids), leurs tours sans doublon.
  const personnes = new Map<string, Personne>();
  const paroles = new Map<string, TourDeParole>();
  for (const r of liste) {
    for (const p of r.personnes ?? []) if (!personnes.has(p.id)) personnes.set(p.id, { ...p });
    for (const t of r.paroles ?? []) paroles.set(`${t.src ?? ''}|${t.p}|${t.ts}|${t.fin}`, { ...t });
  }
  const avatars = liste.find((r) => r.avatars)?.avatars;
  const voix = personnes.size > 0 ? { personnes: [...personnes.values()].sort((a, b) => a.id.localeCompare(b.id, 'fr', { numeric: true })), paroles: [...paroles.values()].sort((a, b) => a.ts - b.ts || a.fin - b.fin), ...(avatars ? { avatars: { ...avatars } } : {}) } : {};
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
    ...voix,
  };
  delete brute.statut;
  return normaliser(brute, { sources }).recette;
}
