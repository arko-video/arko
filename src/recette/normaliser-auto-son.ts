// Normalisation des champs du Montage auto « Son » (dev 3) : champs en plus d'un son (E), piste musique
// et volume final (F). Champs FACULTATIFS : absents → rien n'est ajouté (un ancien montage s'ouvre pareil).

import { borner, estObjet, lireNombre, type Journal, type Objet } from './normaliser-outils';
import { arrondir, lireTemps } from './temps';
import type { MorceauMusique, PisteMusique, Sec, Son, VolumeFinal } from './types';

/** Bruitage coupé : durée jouée 0,1 à 10 s, fondu de sortie 0,3 s par défaut. */
export const SON_AUTO = { durMin: 0.1, durMax: 10, fondu: 0.3, fonduMax: 2 };
/** Clés d'un son ajoutées par le Montage auto (à accepter dans normaliserSons). */
export const CLES_SON_AUTO = ['role', 'dur', 'fondu', 'pour'] as const;
/** Musique : −17 dB ≈ 0,14 ; fondus 1,2 s / 1,5 s ; 20 morceaux au plus. */
export const MUSIQUE = { vol: 0.14, volMin: 0, volMax: 1, fonduEntree: 1.2, fonduSortie: 1.5, fonduMax: 10, morceauxMax: 20 };
/** Volume final (YouTube et TikTok). */
/**
 * Volume visé des montages automatiques (10/11/2026) : −13 LUFS, comme le best-of modèle de Romain (mesuré −12,9) ;
 * l'export d'Arko sortait à −15 avec −14 visé, la vidéo semblait faible à côté des autres.
 */
export const LUFS_MONTAGE = -13;

export const VOLUME_FINAL = { lufs: -14, crete: -1.5, lufsMin: -30, lufsMax: -6, creteMin: -6, creteMax: -0.1 };

/** Champs auto d'un son (seulement ceux présents et valides). */
export function normaliserSonAuto(b: Objet, ch: string, journal: Journal): Partial<Son> {
  const res: Partial<Son> = {};
  if (b.role === 'bruitage' || b.role === 'section' || b.role === 'accent') res.role = b.role;
  else if (b.role !== undefined) journal.ignore(`${ch}.role`, `Le rôle "${String(b.role)}" est inconnu : ignoré.`);
  if (b.dur !== undefined && b.dur !== null) res.dur = lireNombre(b.dur, `${ch}.dur`, journal, { defaut: SON_AUTO.durMax, min: SON_AUTO.durMin, max: SON_AUTO.durMax, nom: 'la durée du son' });
  if (typeof b.pour === 'string' && /^[a-z]{2,20}$/.test(b.pour)) res.pour = b.pour;
  if (b.fondu !== undefined && b.fondu !== null) res.fondu = lireNombre(b.fondu, `${ch}.fondu`, journal, { defaut: SON_AUTO.fondu, min: 0, max: SON_AUTO.fonduMax, nom: 'le fondu du son' });
  return res;
}

/** Ids des sources audio utilisées par la musique (pour ne pas les retirer comme « inutiles »). */
export function sourcesDeLaMusique(m: PisteMusique | undefined): string[] {
  return m ? m.morceaux.map((x) => x.src) : [];
}

/**
 * Piste musique : morceaux sur une source audio de la recette, dans la vidéo, triés par début.
 * Aucun morceau valide → pas de musique.
 */
export function normaliserMusique(brut: unknown, sourcesAudio: readonly string[], duree: Sec, journal: Journal): PisteMusique | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  if (!estObjet(brut)) {
    journal.corrige('musique', 'La musique est illisible : retirée.');
    return undefined;
  }
  const liste = Array.isArray(brut.morceaux) ? brut.morceaux.slice(0, MUSIQUE.morceauxMax) : [];
  if (Array.isArray(brut.morceaux) && brut.morceaux.length > MUSIQUE.morceauxMax) journal.corrige('musique.morceaux', `Plus de ${MUSIQUE.morceauxMax} morceaux : les suivants sont ignorés.`);
  const morceaux: MorceauMusique[] = [];
  liste.forEach((b: unknown, i: number) => {
    const ch = `musique.morceaux[${i}]`;
    if (!estObjet(b) || typeof b.src !== 'string') return journal.corrige(ch, 'Morceau sans source : ignoré.');
    if (!sourcesAudio.includes(b.src)) return journal.corrige(ch, `Le son "${b.src}" de la musique n'est plus là : morceau ignoré.`);
    const t = arrondir(borner(lireTemps(b.t) ?? 0, 0, Math.max(0, duree)));
    const m: MorceauMusique = { src: b.src, t };
    const fin = lireTemps(b.fin);
    if (fin !== null && fin > t) m.fin = arrondir(duree > 0 ? Math.min(fin, duree) : fin);
    const debut = lireTemps(b.debut);
    if (debut !== null && debut > 0) m.debut = arrondir(debut);
    if (b.boucle === false) m.boucle = false;
    morceaux.push(m);
  });
  if (morceaux.length === 0) {
    journal.corrige('musique', 'La musique n\'a aucun morceau utilisable : retirée.');
    return undefined;
  }
  const res: PisteMusique = { morceaux: morceaux.sort((a, b) => a.t - b.t) };
  if (brut.vol !== undefined) res.vol = lireNombre(brut.vol, 'musique.vol', journal, { defaut: MUSIQUE.vol, min: MUSIQUE.volMin, max: MUSIQUE.volMax, nom: 'le volume de la musique' });
  if (brut.baisse !== undefined) res.baisse = brut.baisse !== false;
  // v4 : seule valeur connue 'parole' ; toute autre valeur est retirée (le comportement d'avant reste).
  if (brut.baisseSur === 'parole') res.baisseSur = 'parole';
  else if (brut.baisseSur !== undefined && brut.baisseSur !== null) journal.ignore('musique.baisseSur', `La baisse « ${String(brut.baisseSur)} » est inconnue : ignorée.`);
  const fondu = (cle: 'fonduEntree' | 'fonduSortie', defaut: number) =>
    lireNombre(brut[cle], `musique.${cle}`, journal, { defaut, min: 0, max: MUSIQUE.fonduMax, nom: 'le fondu de la musique' });
  if (brut.fonduEntree !== undefined) res.fonduEntree = fondu('fonduEntree', MUSIQUE.fonduEntree);
  if (brut.fonduSortie !== undefined) res.fonduSortie = fondu('fonduSortie', MUSIQUE.fonduSortie);
  return res;
}

/** Volume final. `true` = valeurs conseillées (−14 LUFS, −1,5 dBTP). */
export function normaliserVolumeFinal(brut: unknown, journal: Journal): VolumeFinal | undefined {
  if (brut === undefined || brut === null || brut === false) return undefined;
  const o: Objet = brut === true ? {} : estObjet(brut) ? brut : {};
  if (brut !== true && !estObjet(brut)) journal.corrige('volumeFinal', 'Volume final illisible : valeurs conseillées choisies.');
  return {
    lufs: lireNombre(o.lufs, 'volumeFinal.lufs', journal, { defaut: VOLUME_FINAL.lufs, min: VOLUME_FINAL.lufsMin, max: VOLUME_FINAL.lufsMax, nom: 'le volume visé (LUFS)' }),
    crete: lireNombre(o.crete, 'volumeFinal.crete', journal, { defaut: VOLUME_FINAL.crete, min: VOLUME_FINAL.creteMin, max: VOLUME_FINAL.creteMax, nom: 'la crête maximale (dBTP)' }),
  };
}
