// Normalisation des champs de « Ma bibliothèque » (FACULTATIFS : jamais ajoutés s'ils sont absents, un ancien montage
// s'ouvre exactement pareil) : la liste `incrustations` (fonds verts et mèmes posés par-dessus la vidéo).

import { CHROMA_BORNES, CHROMA_DEFAUT } from '../moteur/incrustation/chroma';
import { borner, estObjet, lireNombre, verifierCles, type Journal } from './normaliser-outils';
import { arrondir, lireTemps } from './temps';
import type { CleChroma, Incrustation, Sec, Source } from './types';

/** Clés de premier niveau de la recette ajoutées par Ma bibliothèque. */
export const CLES_RECETTE_BIBLIOTHEQUE = ['incrustations'] as const;

export const INCRUSTATION = {
  max: 30,
  durMin: 0.1,
  taille: { defaut: 1, min: 0.1, max: 1.5 },
  vol: { defaut: 1, min: 0, max: 1.5 },
} as const;

const CLES = ['src', 't', 'de', 'a', 'x', 'y', 'taille', 'plein', 'cle', 'son', 'vol', 'genre'];

function normaliserCle(brut: unknown, ch: string, journal: Journal): CleChroma | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  if (!estObjet(brut) || !Array.isArray(brut.couleur) || brut.couleur.length !== 3 || !brut.couleur.every((c) => typeof c === 'number' && Number.isFinite(c))) {
    journal.corrige(ch, 'Le détourage est illisible (il faut la couleur du fond) : clip posé tel quel.');
    return undefined;
  }
  verifierCles(brut, ['couleur', 'tolerance', 'douceur', 'debordement'], ch, journal);
  const couleur = (brut.couleur as number[]).map((c) => Math.round(borner(c, 0, 255))) as [number, number, number];
  const lire = (cle: keyof typeof CHROMA_BORNES, nom: string) =>
    lireNombre(brut[cle], `${ch}.${cle}`, journal, { defaut: CHROMA_DEFAUT[cle], min: CHROMA_BORNES[cle][0], max: CHROMA_BORNES[cle][1], nom });
  return {
    couleur,
    tolerance: lire('tolerance', 'la tolérance'),
    douceur: lire('douceur', 'la douceur des bords'),
    debordement: lire('debordement', "l'anti-débordement"),
  };
}

/**
 * Incrustations : source vidéo connue, début / fin dans le clip (au moins 0,1 s), dans la vidéo finale, position et
 * taille bornées, détourage complété. Triées par temps. undefined si le champ est absent.
 */
export function normaliserIncrustations(brut: unknown, videos: readonly Source[], duree: Sec, journal: Journal): Incrustation[] | undefined {
  if (brut === undefined || brut === null) return undefined;
  if (!Array.isArray(brut)) {
    journal.corrige('incrustations', '"incrustations" doit être une liste : ignoré.');
    return undefined;
  }
  if (brut.length > INCRUSTATION.max) journal.corrige('incrustations', `Au plus ${INCRUSTATION.max} fonds verts et mèmes : les suivants sont retirés.`);
  const res: Incrustation[] = [];
  brut.slice(0, INCRUSTATION.max).forEach((b, i) => {
    const ch = `incrustations[${i}]`;
    if (!estObjet(b)) return journal.corrige(ch, 'Fond vert ou mème illisible : retiré.');
    verifierCles(b, CLES, ch, journal);
    const source = videos.find((s) => s.id === b.src);
    if (!source) return journal.corrige(`${ch}.src`, `Le clip "${String(b.src)}" n'est pas dans le montage : retiré.`);
    const fin = source.duree > 0 ? source.duree : Infinity;
    let de = arrondir(borner(lireTemps(b.de) ?? 0, 0, Number.isFinite(fin) ? fin : Infinity));
    let a = arrondir(Math.min(lireTemps(b.a) ?? fin, fin));
    if (!Number.isFinite(a)) return journal.corrige(`${ch}.a`, 'Fin du clip inconnue : retiré.');
    if (a < de) [de, a] = [a, de];
    if (a - de < INCRUSTATION.durMin) return journal.corrige(ch, 'Le clip gardé dure moins de 0,1 s : retiré.');
    const dur = a - de;
    let t = arrondir(Math.max(0, lireTemps(b.t) ?? 0));
    if (t >= duree && duree > 0) {
      t = arrondir(Math.max(0, duree - dur));
      journal.corrige(`${ch}.t`, 'Le clip commençait après la fin de la vidéo : replacé avant la fin.');
    }
    const inc: Incrustation = { src: source.id, t, de, a };
    for (const k of ['x', 'y'] as const) if (b[k] !== undefined) inc[k] = lireNombre(b[k], `${ch}.${k}`, journal, { defaut: 0.5, min: 0, max: 1, nom: `la position ${k}` });
    if (b.taille !== undefined) inc.taille = lireNombre(b.taille, `${ch}.taille`, journal, { ...INCRUSTATION.taille, nom: 'la taille' });
    if (b.plein === true) inc.plein = true;
    const cle = normaliserCle(b.cle, `${ch}.cle`, journal);
    if (cle) inc.cle = cle;
    if (b.son === false) inc.son = false;
    if (b.vol !== undefined) inc.vol = lireNombre(b.vol, `${ch}.vol`, journal, { ...INCRUSTATION.vol, nom: 'le volume' });
    if (b.genre === 'meme' || b.genre === 'fondVert') inc.genre = b.genre;
    res.push(inc);
  });
  return res.sort((p, q) => p.t - q.t);
}

/** Sources vidéo utilisées par les incrustations (à garder dans la recette). */
export function sourcesDesIncrustations(r: { incrustations?: Incrustation[] }): string[] {
  return (r.incrustations ?? []).map((i) => i.src);
}
