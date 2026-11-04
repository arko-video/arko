// Clé API de l'utilisateur, gardée SUR L'APPAREIL seulement, dans IndexedDB (une par fournisseur).
// Jamais dans localStorage, jamais dans la console ni dans un message d'erreur.
// Pas de chiffrement : sans mot de passe, ce serait du faux. L'interface dit simplement
// « Ta clé reste sur ton téléphone ».

import { createStore, del, get, set } from 'idb-keyval';
import { ErreurArko } from '../moteur/erreurs';
import type { IdFournisseur } from './fournisseurs/types';

// Une base à part, rien que pour les clés. Clé de rangement : « cle:anthropic », « cle:openai »…
let base: ReturnType<typeof createStore> | null = null;
const magasin = () => (base ??= createStore('arko-cles', 'cles'));
const rangement = (fournisseur: IdFournisseur) => `cle:${fournisseur}`;

/** Garde la clé (espaces et retours à la ligne du copier-coller retirés). Une clé vide = oublier. */
export async function sauverCle(fournisseur: IdFournisseur, cle: string): Promise<void> {
  const propre = cle.replace(/\s+/g, '');
  if (!propre) return oublierCle(fournisseur);
  try {
    await set(rangement(fournisseur), propre, magasin());
  } catch {
    throw new ErreurArko('Impossible de garder la clé sur cet appareil (navigation privée ?).', 'stockage');
  }
}

/** La clé gardée, ou null s'il n'y en a pas. */
export async function lireCle(fournisseur: IdFournisseur): Promise<string | null> {
  try {
    const cle = await get<unknown>(rangement(fournisseur), magasin());
    return typeof cle === 'string' && cle ? cle : null;
  } catch {
    return null;
  }
}

/** Bouton « Oublier ma clé ». */
export async function oublierCle(fournisseur: IdFournisseur): Promise<void> {
  try {
    await del(rangement(fournisseur), magasin());
  } catch {
    // Rien à oublier si la base est inaccessible.
  }
}

/**
 * Clé masquée pour l'affichage : « sk-…a1B2 » (le préfixe et les 4 derniers caractères).
 * Une clé trop courte est entièrement cachée.
 */
export function masquer(cle: string): string {
  const propre = cle.trim();
  if (propre.length < 12) return '••••';
  const prefixe = propre.match(/^[a-zA-Z]{2,4}-/)?.[0] ?? propre.slice(0, 3);
  return `${prefixe}…${propre.slice(-4)}`;
}
