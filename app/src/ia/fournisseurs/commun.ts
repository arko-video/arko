// Outils partagés par les 3 fournisseurs : envoi avec délai maximum et annulation,
// et traduction des erreurs en français clair. La clé n'apparaît JAMAIS dans un message.

import { ErreurArko } from '../../moteur/erreurs';
import type { OptionsReseau } from './types';

/** Délai maximum d'une demande : 2 minutes. */
export const DELAI_MAX = 120_000;

/**
 * Envoie une requête et renvoie le JSON de la réponse.
 * Erreurs possibles (ErreurArko) : annule, delai, reseau, et celles de erreurHttp.
 */
export async function envoyer(url: string, init: RequestInit, options: OptionsReseau = {}): Promise<unknown> {
  const { signal } = options;
  if (signal?.aborted) throw erreurAnnulee();
  const envoi = options.fetch ?? ((u: string, i: RequestInit) => fetch(u, i));
  // Un seul « interrupteur » pour le délai maximum ET le bouton Annuler.
  const controleur = new AbortController();
  let tempsEcoule = false;
  const minuteur = setTimeout(() => {
    tempsEcoule = true;
    controleur.abort();
  }, options.delai ?? DELAI_MAX);
  const relayer = () => controleur.abort();
  signal?.addEventListener('abort', relayer, { once: true });
  try {
    const reponse = await envoi(url, { ...init, signal: controleur.signal });
    const corps = await reponse.text();
    if (!reponse.ok) throw erreurHttp(reponse.status, corps);
    try {
      return JSON.parse(corps) as unknown;
    } catch {
      throw new ErreurArko('Le fournisseur a renvoyé une réponse illisible (coupée par le réseau ?). Réessaie.', 'reponse_illisible');
    }
  } catch (e) {
    if (e instanceof ErreurArko) throw e;
    if (signal?.aborted) throw erreurAnnulee();
    if (tempsEcoule) throw new ErreurArko('Pas de réponse après 2 minutes. Réessaie, ou demande moins de clips.', 'delai');
    throw new ErreurArko('Connexion impossible : vérifie ton internet, puis réessaie.', 'reseau');
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relayer);
  }
}

export function erreurAnnulee(): ErreurArko {
  return new ErreurArko('Demande annulée.', 'annule');
}

/** Traduit un code HTTP d'erreur (et le message du fournisseur) en message français. */
export function erreurHttp(statut: number, corps: string): ErreurArko {
  const detail = messageFournisseur(corps);
  const bas = detail.toLowerCase();
  // Gemini répond 400 (et non 401) quand la clé est fausse.
  if (statut === 401 || statut === 403 || bas.includes('api key not valid') || bas.includes('api_key_invalid')) {
    return new ErreurArko('Clé refusée : vérifie-la.', 'cle_refusee');
  }
  // Anthropic répond 400 quand le crédit est épuisé.
  if (statut === 429 || bas.includes('credit balance') || bas.includes('insufficient_quota')) {
    return new ErreurArko('Trop de demandes ou crédit épuisé. Attends un peu, ou vérifie ton crédit chez le fournisseur.', 'limite');
  }
  if (statut === 404) {
    return new ErreurArko('Modèle introuvable : vérifie son nom, ou choisis-en un dans la liste.', 'modele');
  }
  if (statut >= 500) {
    return new ErreurArko('Le service de l\'IA est surchargé ou en panne. Réessaie dans quelques minutes.', 'service');
  }
  const suite = detail ? ` (${detail})` : '';
  return new ErreurArko(`Demande refusée par le fournisseur, erreur ${statut}${suite}.`, 'refuse');
}

/** Message d'erreur du fournisseur (en anglais), court et sans rien qui ressemble à une clé. */
function messageFournisseur(corps: string): string {
  let texte = corps;
  try {
    const json = JSON.parse(corps) as { error?: { message?: unknown } | string; message?: unknown };
    const err = json.error;
    const msg = typeof err === 'string' ? err : err?.message ?? json.message;
    if (typeof msg === 'string') texte = msg;
  } catch {
    // Pas du JSON : on garde le texte brut.
  }
  return cacherCles(texte.replace(/\s+/g, ' ').trim()).slice(0, 160);
}

/** Remplace tout ce qui ressemble à une clé API par « [clé cachée] ». */
export function cacherCles(texte: string): string {
  return texte.replace(/\b(sk-[\w-]{6,}|AIza[\w-]{10,}|[\w-]*\*{3,}[\w-]*)/g, '[clé cachée]');
}

/** Lit un objet JSON en sécurité (renvoie {} si ce n'en est pas un). */
export function objet(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Lit une liste JSON en sécurité (renvoie [] si ce n'en est pas une). */
export function liste(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Erreur quand le modèle n'a rien écrit (refus, filtre de sécurité…). */
export function erreurVide(raison?: string): ErreurArko {
  const suite = raison ? ` (raison donnée : ${raison})` : '';
  return new ErreurArko(`L'IA n'a rien renvoyé${suite}. Réessaie, ou change la consigne.`, 'reponse_vide');
}

/** Trie les modèles par ordre alphabétique, le modèle par défaut en premier. */
export function trierModeles(ids: string[], parDefaut: string): string[] {
  const uniques = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  return uniques.includes(parDefaut) ? [parDefaut, ...uniques.filter((m) => m !== parDefaut)] : uniques;
}
