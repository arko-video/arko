// Fournisseur Anthropic (modèles Claude), appelé directement depuis le navigateur.
// Doc : https://platform.claude.com/docs/en/api/messages et https://platform.claude.com/docs/en/models/overview

import { envoyer, erreurVide, liste, objet, trierModeles } from './commun';
import type { AppelIA, Fournisseur, OptionsReseau, ReponseIA } from './types';

const ADRESSE = 'https://api.anthropic.com/v1';
/** Haiku : le moins cher des modèles Claude actuels (vérifié en novembre 2026). */
const MODELE_PAR_DEFAUT = 'claude-haiku-5-5';

/** En-têtes communs. Le dernier est OBLIGATOIRE pour un appel depuis une page web. */
function entetes(cle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': cle,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

async function appeler(a: AppelIA): Promise<ReponseIA> {
  const corps = {
    model: a.modele,
    max_tokens: a.maxTokens,
    system: a.systeme,
    messages: [{ role: 'user', content: a.message }],
  };
  const json = objet(await envoyer(`${ADRESSE}/messages`, { method: 'POST', headers: entetes(a.cle), body: JSON.stringify(corps) }, a));
  // La réponse est une liste de blocs ; on colle les blocs de texte.
  const texte = liste(json.content)
    .map(objet)
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  const raison = typeof json.stop_reason === 'string' ? json.stop_reason : undefined;
  if (!texte.trim()) throw erreurVide(raison);
  return { texte, coupee: raison === 'max_tokens' };
}

async function listerModeles(cle: string, options: OptionsReseau = {}): Promise<string[]> {
  const json = objet(await envoyer(`${ADRESSE}/models?limit=1000`, { method: 'GET', headers: entetes(cle) }, options));
  const ids = liste(json.data)
    .map((m) => objet(m).id)
    .filter((id): id is string => typeof id === 'string');
  return trierModeles(ids, MODELE_PAR_DEFAUT);
}

export const anthropic: Fournisseur = {
  id: 'anthropic',
  nom: 'Anthropic (Claude)',
  modeleParDefaut: MODELE_PAR_DEFAUT,
  appeler,
  listerModeles,
};
