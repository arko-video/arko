// Ce que l'appareil garde de la passe du son d'une vidéo (dev-vad) : IndexedDB (idb-keyval), clé
// `arko.mesures.<emp>`. Deux usages :
//  - une 2ᵉ analyse de la même vidéo (autre jour, autre durée visée…) ne relit PAS le son : empreintes de voix
//    (niveau + timbre), probabilités de la VAD et hauteur sont reprises telles quelles (relirePasseSon) ;
//  - Habiller → Couper (Serré / Normal / Large, « Passages pas retenus → Ajouter ») recoupe sans réécouter :
//    relireMesures donne les MesuresGardees (VAD + énergie de la bande voix + hauteur).
// Toutes les erreurs de stockage sont avalées : sans mesures gardées, on réécoute simplement la vidéo.
// Taille : ≈ 1,8 Mo par heure de son et par piste pour l'énergie, ×9 avec le timbre (3 h 20 ≈ 22 Mo). Donc
// (intégrateur, relecture point 9) : seules les MESURES_MAX dernières vidéos sont gardées (liste `arko.mesures.liste`,
// la plus récente à la fin) ; les plus anciennes sont effacées. Relire une vidéo la remet en tête.

import { del, get, set } from 'idb-keyval';
import type { Sec } from '../../recette/types';
import type { HauteurVoix, MesuresGardees, ProbasVad } from '../types-v4';
import type { EmpreintesNommees } from '../voix/mesures-voix';

export const VERSION_MESURES = 1;

export const cleMesures = (emp: string) => `arko.mesures.${emp}`;
/** Les vidéos dont les mesures sont gardées, de la plus ancienne à la plus récente. */
export const CLE_LISTE_MESURES = 'arko.mesures.liste';
/** Vidéos gardées au plus (≈ 22 Mo chacune pour 3 h 20 de son). */
export const MESURES_MAX = 5;

/** Met `emp` en tête de la liste et efface les mesures des vidéos en trop (les plus anciennes). Ne lève jamais. */
async function retenir(emp: string): Promise<void> {
  try {
    const avant: unknown = await get(CLE_LISTE_MESURES);
    const liste = (Array.isArray(avant) ? avant.filter((x): x is string => typeof x === 'string') : []).filter((x) => x !== emp);
    liste.push(emp);
    while (liste.length > MESURES_MAX) await del(cleMesures(liste.shift()!));
    await set(CLE_LISTE_MESURES, liste);
  } catch {
    /* stockage bloqué : rien */
  }
}

/** Ce qui est rangé (une MesuresGardees, plus de quoi refaire une analyse sans relire le son). */
export interface PasseGardee extends MesuresGardees {
  duree: Sec;
  /** Pistes mesurées (« principale » ou « 0,1 »). */
  pistes: string;
  /** Outils qui ont fait la passe (« silero-vad-v5 », hauteur…) : une passe faite avec d'autres outils est refaite. */
  outils: string;
  /** Empreintes complètes (niveau + timbre) de chaque piste. */
  empreintes: EmpreintesNommees[];
}

/** Ce que la passe du son a mesuré (sans les avertissements, propres à une analyse). */
export interface PasseMesuree {
  empreintes: EmpreintesNommees[];
  vad: Omit<ProbasVad, 'src'> | null;
  hauteur: HauteurVoix | null;
}

export const clePistes = (pistes: readonly (number | null)[]) => (pistes.length === 0 || (pistes.length === 1 && pistes[0] === null) ? 'principale' : pistes.join(','));

/** Les mesures gardées pour recouper (pur). */
export function mesuresGardeesDe(p: PasseMesuree): MesuresGardees {
  const e = p.empreintes[0];
  return { v: VERSION_MESURES, vad: p.vad, energie: e ? { pas: e.pas, db: e.db } : null, hauteur: p.hauteur };
}

export async function garderPasseSon(emp: string, duree: Sec, pistes: readonly (number | null)[], outils: string, p: PasseMesuree): Promise<void> {
  const g: PasseGardee = {
    ...mesuresGardeesDe(p),
    duree,
    pistes: clePistes(pistes),
    outils,
    empreintes: p.empreintes.map((e) => ({ pas: e.pas, duree: e.duree, db: e.db, bandes: e.bandes, ...(e.piste !== undefined ? { piste: e.piste } : {}), ...(e.nom ? { nom: e.nom } : {}) })),
  };
  try {
    await set(cleMesures(emp), g);
    await retenir(emp);
  } catch {
    // Stockage plein ou bloqué : on réécoutera la prochaine fois.
  }
}

function lisible(g: unknown): g is PasseGardee {
  if (!g || typeof g !== 'object') return false;
  const o = g as Partial<PasseGardee>;
  return o.v === VERSION_MESURES && typeof o.duree === 'number' && typeof o.pistes === 'string' && typeof o.outils === 'string' && Array.isArray(o.empreintes);
}

/**
 * La passe gardée, si elle vaut pour CETTE analyse : même durée, mêmes pistes, mêmes outils, et la VAD dedans si on
 * la veut (une passe faite sans la VAD — modèle qui n'avait pas chargé — est refaite pour l'avoir).
 */
export async function relirePasseSon(emp: string, duree: Sec, pistes: readonly (number | null)[], outils: string, veutVad: boolean): Promise<PasseMesuree | null> {
  try {
    const g: unknown = await get(cleMesures(emp));
    if (!lisible(g)) return null;
    if (Math.abs(g.duree - duree) > 0.5 || g.pistes !== clePistes(pistes) || g.outils !== outils) return null;
    if (veutVad && !g.vad) return null;
    if (g.empreintes.length === 0 || g.empreintes.some((e) => !(e.db instanceof Float32Array) || !(e.bandes instanceof Float32Array))) return null;
    await retenir(emp);
    return { empreintes: g.empreintes, vad: veutVad ? g.vad : null, hauteur: g.hauteur ?? null };
  } catch {
    return null;
  }
}

/** Les mesures gardées pour recouper après coup (Habiller → Couper), ou null. */
export async function relireMesures(emp: string): Promise<MesuresGardees | null> {
  try {
    const g: unknown = await get(cleMesures(emp));
    if (!lisible(g)) return null;
    return { v: VERSION_MESURES, vad: g.vad ?? null, energie: g.energie ?? null, hauteur: g.hauteur ?? null };
  } catch {
    return null;
  }
}

export async function oublierMesures(emp: string): Promise<void> {
  try {
    await del(cleMesures(emp));
    const avant: unknown = await get(CLE_LISTE_MESURES);
    if (Array.isArray(avant)) await set(CLE_LISTE_MESURES, avant.filter((x) => x !== emp));
  } catch {
    /* rien */
  }
}

/** Même fonction, au nom attendu par l'interface (dev-ui : `brancherMesuresGardees(lireMesuresGardees)`). */
export const lireMesuresGardees = relireMesures;
