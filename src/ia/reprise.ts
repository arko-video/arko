// Points de reprise de l'analyse dans IndexedDB (idb-keyval), clé `arko.analyse.<empreinte>`.
// Utilisable dans le Worker comme dans la page. Toutes les erreurs de stockage sont avalées :
// sans reprise, l'analyse marche quand même (elle repartira simplement de zéro).

import { del, get, set } from 'idb-keyval';
import type { Sec } from '../recette/types';
import { cleReprise, VERSION_REPRISE, type PointReprise } from './messages-analyse';

/** Le point est-il utilisable pour cette source ? (même version, même durée, même pas). Pure. */
export function pointUtilisable(p: unknown, duree: Sec, pas: Sec): p is PointReprise {
  if (!p || typeof p !== 'object') return false;
  const o = p as Partial<PointReprise>;
  return (
    o.version === VERSION_REPRISE &&
    typeof o.duree === 'number' &&
    Math.abs(o.duree - duree) < 0.5 &&
    o.pas === pas &&
    o.enveloppe instanceof Float32Array &&
    Array.isArray(o.diffs) &&
    typeof o.tSon === 'number' &&
    typeof o.tImage === 'number'
  );
}

export async function lirePoint(empreinte: string, duree: Sec, pas: Sec): Promise<PointReprise | null> {
  try {
    const p: unknown = await get(cleReprise(empreinte));
    return pointUtilisable(p, duree, pas) ? p : null;
  } catch {
    return null;
  }
}

export async function ecrirePoint(empreinte: string, point: PointReprise): Promise<void> {
  try {
    await set(cleReprise(empreinte), point);
  } catch {
    // Plus de place ou stockage bloqué : tant pis pour la reprise.
  }
}

/** Oublie l'analyse d'une source (point de reprise compris). */
export async function oublierAnalyse(empreinte: string): Promise<void> {
  try {
    await del(cleReprise(empreinte));
  } catch {
    // Rien à faire.
  }
}
