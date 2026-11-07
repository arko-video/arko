// C/D. Opérations « avatars » (dev 3) : activer les avatars, donner un chibi à une personne, régler sa place.
// Mêmes règles que operations.ts (nouvelle recette normalisée, la recette d'origine si rien ne change, un seul
// Annuler par geste). Contrat : contrat-wankil.md §5.

import { normaliser } from './normaliser';
import type { DefinitionChibi, Personne, PlaceAvatar, Recette, ReglagesAvatars, Sec, Situation, TourDeParole } from './types';

function finir(origine: Recette, r: Recette): Recette {
  const res = normaliser(r, { sources: r.sources }).recette;
  return JSON.stringify(res) === JSON.stringify(origine) ? origine : res;
}

/** Change la personne `p` (sans effet si elle n'existe pas). */
function changerPersonne(r: Recette, p: string, f: (x: Personne) => Personne): Recette {
  const liste = r.personnes ?? [];
  const i = liste.findIndex((x) => x.id === p);
  if (i < 0) return r;
  const personnes = liste.map((x, j) => (j === i ? f({ ...x }) : x));
  return finir(r, { ...r, personnes });
}

/** Active (réglages) ou retire (null) les avatars. Sans personnes, sans effet. */
export function activerAvatars(r: Recette, reglages: ReglagesAvatars | null): Recette {
  if (!r.personnes?.length) return r;
  const res: Recette = { ...r };
  if (reglages) res.avatars = { ...reglages };
  else delete res.avatars;
  return finir(r, res);
}

/** Donne (copie) un chibi à la personne `p` ; `bib` = son id dans Ma bibliothèque ; null = retire son chibi. */
export function donnerChibi(r: Recette, p: string, chibi: DefinitionChibi | null, bib?: string): Recette {
  return changerPersonne(r, p, (x) => {
    if (chibi) x.chibi = { ...chibi };
    else delete x.chibi;
    if (chibi && bib) x.bib = bib;
    else delete x.bib;
    return x;
  });
}

/** Place et taille de l'avatar de `p` (null = place par défaut). */
export function placerAvatar(r: Recette, p: string, place: PlaceAvatar | null): Recette {
  return changerPersonne(r, p, (x) => {
    if (place) x.place = { x: place.x, y: place.y, taille: place.taille };
    else delete x.place;
    return x;
  });
}

/** Montre ou cache l'avatar d'une personne. */
export function montrerAvatar(r: Recette, p: string, oui: boolean): Recette {
  return changerPersonne(r, p, (x) => {
    if (oui) delete x.avatar;
    else x.avatar = false;
    return x;
  });
}

/**
 * Situation de jeu d'un passage (7/11/2026) : donnée aux tours de parole qui chevauchent [ts, fin] (temps source,
 * vidéo `src` ou la 1re). 'aucune' la retire. Sans tour concerné : la recette d'origine.
 */
export function situationDuPassage(r: Recette, ts: Sec, fin: Sec, sit: Situation, src?: string): Recette {
  const premiere = r.sources.find((s) => s.type === 'video')?.id;
  const cible = src ?? premiere;
  let touche = false;
  const paroles = (r.paroles ?? []).map((t) => {
    if ((t.src ?? premiere) !== cible || t.fin <= ts || t.ts >= fin) return t;
    touche = true;
    const n: TourDeParole = { ...t };
    if (sit === 'aucune') delete n.sit;
    else n.sit = sit;
    return n;
  });
  return touche ? finir(r, { ...r, paroles }) : r;
}

/** Situation du tour qui couvre le plus [ts, fin] ('aucune' sans tour ou sans situation). */
export function situationDe(r: Recette, ts: Sec, fin: Sec, src?: string): Situation {
  const premiere = r.sources.find((s) => s.type === 'video')?.id;
  let mieux: TourDeParole | null = null;
  let recouvre = 0;
  for (const t of r.paroles ?? []) {
    if ((t.src ?? premiere) !== (src ?? premiere)) continue;
    const c = Math.min(fin, t.fin) - Math.max(ts, t.ts);
    if (c > recouvre) {
      recouvre = c;
      mieux = t;
    }
  }
  return mieux?.sit ?? 'aucune';
}
