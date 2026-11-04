// Corrections mémorisées des sous-titres (pseudos, noms de jeux), gardées dans localStorage (arko.corrections).
// La comparaison se fait sans casse ni ponctuation : « jlb » corrige aussi « JLB, » et « Jlb ! ».
// Une correction peut couvrir plusieurs mots : « fort nite » → « Fortnite » (les mots sont fusionnés).
// On range tout dans une Map : un mot comme « constructor » ou « __proto__ » est un mot comme un autre.

import type { Mot } from '../recette/types';
import { cle } from './nettoyage';

const CLE_STOCKAGE = 'arko.corrections';
/** Une correction couvre au plus 4 mots entendus. */
const MOTS_MAX = 4;

/** Table des corrections : texte de comparaison → texte corrigé. */
export type TableCorrections = Map<string, string>;

/** Clé d'une suite de mots : clé de chaque mot, séparées par une espace. */
function cleSuite(txt: string): string {
  return txt.split(/\s+/).map(cle).filter(Boolean).join(' ');
}

/** Ponctuation de fin d'un mot, avec l'espace insécable française qui la précède (« monde !» → « !»). */
const PONCTUATION_FINALE = /[  ]?[\p{P}]+$/u;

function sansPonctuationFinale(txt: string): string {
  return txt.trim().replace(PONCTUATION_FINALE, '').trim();
}

export function lireCorrections(): TableCorrections {
  const table: TableCorrections = new Map();
  try {
    const brut = globalThis.localStorage?.getItem(CLE_STOCKAGE);
    const donnees: unknown = brut ? JSON.parse(brut) : null;
    if (donnees && typeof donnees === 'object') {
      for (const [k, v] of Object.entries(donnees)) if (typeof v === 'string') table.set(k, v);
    }
  } catch {
    // Données abîmées ou stockage interdit : aucune correction.
  }
  return table;
}

function ecrire(table: TableCorrections) {
  try {
    globalThis.localStorage?.setItem(CLE_STOCKAGE, JSON.stringify(Object.fromEntries(table)));
  } catch {
    // Stockage plein ou interdit (navigation privée) : la correction vaut pour cette fois seulement.
  }
}

/** Mémorise « avant » → « après » (comparaison sans casse ni ponctuation). */
export function memoriserCorrection(avant: string, apres: string): void {
  const k = cleSuite(avant);
  // La ponctuation de fin n'est pas mémorisée : elle est reprise du mot entendu.
  const nouveau = sansPonctuationFinale(apres);
  if (!k || !nouveau || nouveau === sansPonctuationFinale(avant)) return;
  const table = lireCorrections();
  table.set(k, nouveau);
  ecrire(table);
}

/** Les corrections mémorisées, pour les afficher (avant = forme de comparaison, en minuscules). */
export function listerCorrections(): { avant: string; apres: string }[] {
  return [...lireCorrections()].map(([avant, apres]) => ({ avant, apres }));
}

/** Oublie une correction mémorisée (« avant » comme dans listerCorrections, ou le mot entendu). */
export function oublierCorrection(avant: string): void {
  const table = lireCorrections();
  if (table.delete(cleSuite(avant))) ecrire(table);
}

/** Applique une table de corrections à des mots (pur). La plus longue suite de mots gagne. */
export function corriger(mots: Mot[], table: TableCorrections): Mot[] {
  if (table.size === 0) return mots;
  const res: Mot[] = [];
  let i = 0;
  while (i < mots.length) {
    let fait = false;
    for (let n = Math.min(MOTS_MAX, mots.length - i); n >= 1 && !fait; n--) {
      const groupe = mots.slice(i, i + n);
      const remplacement = table.get(groupe.map((m) => cle(m[0])).join(' '));
      if (remplacement === undefined) continue;
      const dernier = groupe[n - 1]!;
      const ponctuation = PONCTUATION_FINALE.exec(dernier[0])?.[0] ?? '';
      const txt = remplacement.endsWith(ponctuation) ? remplacement : remplacement + ponctuation;
      const fort = groupe.some((m) => m[3] === 1);
      res.push(fort ? [txt, groupe[0]![1], dernier[2], 1] : [txt, groupe[0]![1], dernier[2]]);
      i += n;
      fait = true;
    }
    if (!fait) res.push(mots[i++]!);
  }
  return res;
}

/** Applique les corrections mémorisées à des mots (pur, sauf la lecture de localStorage). */
export function appliquerCorrections(mots: Mot[]): Mot[] {
  return corriger(mots, lireCorrections());
}
