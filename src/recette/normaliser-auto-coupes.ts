// Normalisation des champs du Montage auto « Coupes » (dev 1) : `blancs` (A) et `rognages` (D).
// Champs FACULTATIFS : absents → rien n'est ajouté (un ancien montage s'ouvre pareil).

import { borner, estObjet, lireNombre, verifierCles, type Journal } from './normaliser-outils';
import { lireTemps } from './temps';
import type { NiveauBlancs, ReglagesBlancsRecette, Rognage, Source } from './types';

export const NIVEAUX_BLANCS: readonly NiveauBlancs[] = ['serre', 'normal', 'large'];
/** Fondus du son à chaque coupe quand les plans viennent de « Couper les blancs » (s). */
export const FONDUS_BLANCS = { entree: 0.02, sortie: 0.04, min: 0.005, max: 0.2 };
/** Un rognage garde au moins la moitié de l'image dans chaque sens. */
export const ROGNAGE = { tailleMin: 0.5 };

/** `blancs` : réglage connu (sinon « normal »), fondus bornés à [0,005 ; 0,2] s. */
export function normaliserBlancs(brut: unknown, journal: Journal): ReglagesBlancsRecette | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  if (!estObjet(brut)) {
    journal.corrige('blancs', 'Le réglage « Couper les blancs » est illisible : ignoré.');
    return undefined;
  }
  verifierCles(brut, ['niveau', 'fonduEntree', 'fonduSortie'], 'blancs', journal);
  let niveau: NiveauBlancs = 'normal';
  if (NIVEAUX_BLANCS.includes(brut.niveau as NiveauBlancs)) niveau = brut.niveau as NiveauBlancs;
  else if (brut.niveau !== undefined) journal.corrige('blancs.niveau', `Le réglage "${String(brut.niveau)}" n'existe pas : « normal » choisi.`);
  const f = (cle: 'fonduEntree' | 'fonduSortie', defaut: number, nom: string) =>
    lireNombre(brut[cle], `blancs.${cle}`, journal, { defaut, min: FONDUS_BLANCS.min, max: FONDUS_BLANCS.max, nom });
  return {
    niveau,
    fonduEntree: f('fonduEntree', FONDUS_BLANCS.entree, 'le fondu d\'entrée du son'),
    fonduSortie: f('fonduSortie', FONDUS_BLANCS.sortie, 'le fondu de sortie du son'),
  };
}

/**
 * `rognages` : un par source vidéo connue, dans l'image (0 à 1), au moins la moitié de l'image gardée.
 * Un rognage qui garde toute l'image ne sert à rien : retiré. `videos` vide = sources inconnues (tout est gardé).
 */
export function normaliserRognages(brut: unknown, videos: readonly Source[], journal: Journal): Rognage[] | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!Array.isArray(brut)) {
    journal.corrige('rognages', '"rognages" doit être une liste : ignoré.');
    return undefined;
  }
  const res: Rognage[] = [];
  brut.forEach((b, i) => {
    const ch = `rognages[${i}]`;
    if (!estObjet(b) || typeof b.src !== 'string' || !b.src) return journal.corrige(ch, 'Rognage sans source : ignoré.');
    verifierCles(b, ['src', 'x', 'y', 'l', 'h'], ch, journal);
    if (videos.length > 0 && !videos.some((s) => s.id === b.src)) return journal.corrige(ch, `La vidéo "${b.src}" n'existe pas : rognage ignoré.`);
    if (res.some((r) => r.src === b.src)) return journal.corrige(ch, `La vidéo "${b.src}" avait deux rognages : seul le premier est gardé.`);
    const lire = (cle: 'x' | 'y' | 'l' | 'h', defaut: number, min: number) => {
      const v = lireTemps(b[cle]);
      if (v === null) {
        if (b[cle] !== undefined) journal.corrige(`${ch}.${cle}`, `La valeur ${cle} du rognage est illisible : ${defaut} choisi.`);
        return defaut;
      }
      return borner(v, min, 1);
    };
    const l = lire('l', 1, ROGNAGE.tailleMin);
    const h = lire('h', 1, ROGNAGE.tailleMin);
    const x = arrondir4(borner(lire('x', 0, 0), 0, 1 - l));
    const y = arrondir4(borner(lire('y', 0, 0), 0, 1 - h));
    if (l >= 0.9999 && h >= 0.9999) return; // toute l'image : rien à rogner
    res.push({ src: b.src, x, y, l: arrondir4(l), h: arrondir4(h) });
  });
  return res.length > 0 ? res : undefined;
}

/** Arrondi au 1/10 000 (un pixel d'une image 4K vaut ~0,0003) ; `arrondir` (1/100) serait trop grossier. */
function arrondir4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
