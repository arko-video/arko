// Les 3 fournisseurs d'IA d'Arko, et le bouton « Tester ma clé ».

import { ErreurArko } from '../../moteur/erreurs';
import { anthropic } from './anthropic';
import { gemini } from './gemini';
import { openai } from './openai';
import type { Fournisseur, IdFournisseur, OptionsReseau } from './types';

/** Dans l'ordre d'affichage. */
export const FOURNISSEURS: readonly Fournisseur[] = [anthropic, openai, gemini];

export function trouverFournisseur(id: IdFournisseur): Fournisseur {
  const f = FOURNISSEURS.find((x) => x.id === id);
  if (!f) throw new ErreurArko(`Fournisseur d'IA inconnu : « ${String(id)} ».`, 'fournisseur');
  return f;
}

/**
 * « Tester ma clé » : demande la liste des modèles. Ça ne coûte aucun token.
 * Renvoie les modèles (le modèle par défaut en premier) ; une clé refusée lève une ErreurArko « cle_refusee ».
 */
export async function testerCle(id: IdFournisseur, cle: string, options: OptionsReseau = {}): Promise<string[]> {
  const propre = cle.trim();
  if (!propre) throw new ErreurArko('Colle d\'abord ta clé API.', 'cle_vide');
  return trouverFournisseur(id).listerModeles(propre, options);
}
