// Migrations entre versions du format de recette. En phase 1, seule la version 1 existe :
// la liste est vide. Une future version 2 ajoutera ici une fonction « v1 → v2 ».

import type { Objet } from './normaliser-outils';

export const VERSION_ACTUELLE = 1;

/** Une migration transforme une recette de la version `de` vers la version `de + 1`. */
export interface Migration {
  de: number;
  migrer(recette: Objet): Objet;
}

export const MIGRATIONS: Migration[] = [];

/** Lit le numéro de version d'un champ `format` ("arko.recette/1" → 1). null si illisible. */
export function versionDuFormat(format: unknown): number | null {
  if (typeof format !== 'string') return null;
  const m = format.trim().match(/^arko\.recette\/(\d+)(?:\.\d+)*$/i);
  return m ? Number(m[1]) : null;
}

/** Applique les migrations successives jusqu'à la version actuelle (sans effet en phase 1). */
export function migrer(recette: Objet, version: number): Objet {
  let r = recette;
  for (let v = version; v < VERSION_ACTUELLE; v++) {
    const m = MIGRATIONS.find((x) => x.de === v);
    if (m) r = m.migrer(r);
  }
  return r;
}
