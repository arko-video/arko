// Opérations d'habillage (phase 2) : textes et sous-titres. Mêmes règles que operations.ts :
// une NOUVELLE recette normalisée est renvoyée, la recette d'origine si l'opération est sans effet.
// CONTRAT : signatures fixées.

import { compiler } from './chronologie';
import { TEXTE } from './defauts';
import { normaliser } from './normaliser';
import { placerSousTitres } from './sous-titres-places';
import type { Mot, Recette, Sec, SousTitres, Texte } from './types';

/** Normalise ; renvoie la recette d'origine si rien n'a changé. */
function finir(origine: Recette, modifiee: Recette): Recette {
  const r = normaliser(modifiee, { sources: modifiee.sources }).recette;
  return JSON.stringify(r) === JSON.stringify(origine) ? origine : r;
}

function indiceValide(liste: readonly unknown[], i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < liste.length;
}

/** Ajoute un texte ; renvoie la recette et l'indice du nouveau texte dans recette.textes (-1 si texte vide). */
export function ajouterTexte(recette: Recette, texte: Partial<Texte> & { txt: string; t: Sec }): { recette: Recette; i: number } {
  if (typeof texte.txt !== 'string' || !texte.txt.trim()) return { recette, i: -1 };
  const nouveau: Texte = { style: TEXTE.style, dur: TEXTE.dur, x: TEXTE.x, y: TEXTE.y, ...texte };
  const r = finir(recette, { ...recette, textes: [...recette.textes, nouveau] });
  return r === recette ? { recette, i: -1 } : { recette: r, i: r.textes.length - 1 };
}

/**
 * Modifie le texte i (txt, style, t, dur, x, y). Un `txt` vide est ignoré (le texte n'est pas supprimé
 * pendant qu'on retape : pour supprimer, il y a supprimerTexte).
 */
export function modifierTexte(recette: Recette, i: number, partiel: Partial<Texte>): Recette {
  if (!indiceValide(recette.textes, i)) return recette;
  const change: Partial<Texte> = { ...partiel };
  if (change.txt !== undefined && (typeof change.txt !== 'string' || !change.txt.trim())) delete change.txt;
  const textes = recette.textes.map((x, k) => (k === i ? { ...x, ...change } : x));
  return finir(recette, { ...recette, textes });
}

export function supprimerTexte(recette: Recette, i: number): Recette {
  if (!indiceValide(recette.textes, i)) return recette;
  return finir(recette, { ...recette, textes: recette.textes.filter((_, k) => k !== i) });
}

/** Remplace les sous-titres (null = les retirer). Sans `y`, la hauteur par défaut suit la mise en page. */
export function definirSousTitres(recette: Recette, sousTitres: SousTitres | null): Recette {
  if (sousTitres === null) return recette.sousTitres === null ? recette : finir(recette, { ...recette, sousTitres: null });
  const copie: SousTitres = { ...sousTitres, mots: sousTitres.mots === 'auto' ? 'auto' : sousTitres.mots.map((m) => [...m] as Mot) };
  return finir(recette, { ...recette, sousTitres: copie });
}

/** Mots modifiables des sous-titres (null si pas de sous-titres, ou pas encore transcrits). */
function motsDe(recette: Recette): Mot[] | null {
  const mots = recette.sousTitres?.mots;
  return Array.isArray(mots) ? mots : null;
}

/** Modifie le mot k (indice dans sousTitres.mots) : texte corrigé et/ou mis en valeur. Un texte vide est ignoré. */
export function modifierMot(recette: Recette, k: number, partiel: { txt?: string; fort?: 0 | 1 }): Recette {
  const mots = motsDe(recette);
  if (!mots || !indiceValide(mots, k)) return recette;
  const ancien = mots[k]!;
  const txt = typeof partiel.txt === 'string' && partiel.txt.trim() ? partiel.txt.trim() : ancien[0];
  const fort = partiel.fort !== undefined ? partiel.fort : ancien[3] === 1 ? 1 : 0;
  const mot: Mot = fort === 1 ? [txt, ancien[1], ancien[2], 1] : [txt, ancien[1], ancien[2]];
  const nouveaux = mots.map((m, j) => (j === k ? mot : m));
  return finir(recette, { ...recette, sousTitres: { ...recette.sousTitres!, mots: nouveaux } });
}

export function supprimerMot(recette: Recette, k: number): Recette {
  const mots = motsDe(recette);
  if (!mots || !indiceValide(mots, k)) return recette;
  return finir(recette, { ...recette, sousTitres: { ...recette.sousTitres!, mots: mots.filter((_, j) => j !== k) } });
}

/** Une ligne de sous-titres telle qu'affichée (en temps de SORTIE), pour la liste de l'interface. */
export interface LigneSousTitres {
  /** Indices des mots [k0, k1[ dans sousTitres.mots. */
  k0: number;
  k1: number;
  t0: Sec;
  t1: Sec;
  mots: Mot[];
  /** Mode punchlines, liste complète (`toutes`) : la ligne est-elle une punchline gardée ? */
  punchline?: boolean;
}

/**
 * Lignes de sous-titres visibles dans la vidéo finale (mots hors des plans gardés exclus) :
 * exactement les lignes dessinées par le moteur. Un passage réutilisé donne deux lignes (mêmes k0, k1).
 * `toutes` (mode punchlines) : TOUTES les phrases, chacune marquée `punchline` ou non, pour en ajouter d'un toucher.
 */
export function lignesSousTitres(recette: Recette, o: { toutes?: boolean } = {}): LigneSousTitres[] {
  const sc = compiler(recette);
  const st = recette.sousTitres;
  if (o.toutes && st?.mode === 'punchlines') {
    const premiere = recette.sources.find((s) => s.type === 'video')?.id ?? '';
    const toutes = placerSousTitres(st, sc.plans, recette.mise, premiere, { toutes: true });
    const gardes = new Set((sc.sousTitres?.lignes ?? []).flatMap((l) => l.mots.map((m) => m.k)));
    return (toutes?.lignes ?? []).map((l) => ({
      k0: l.k0, k1: l.k1, t0: l.t0, t1: l.t1, mots: l.mots.map((m) => m.mot), punchline: l.mots.some((m) => gardes.has(m.k)),
    }));
  }
  if (!sc.sousTitres) return [];
  return sc.sousTitres.lignes.map((l) => ({ k0: l.k0, k1: l.k1, t0: l.t0, t1: l.t1, mots: l.mots.map((m) => m.mot) }));
}
