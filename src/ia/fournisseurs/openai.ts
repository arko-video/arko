// Fournisseur OpenAI (modèles GPT), appelé directement depuis le navigateur.
// Doc : https://developers.openai.com/docs/models et l'API « Chat Completions ».

import { envoyer, erreurVide, liste, objet, trierModeles } from './commun';
import type { AppelIA, Fournisseur, OptionsReseau, ReponseIA } from './types';

const ADRESSE = 'https://api.openai.com/v1';
/** GPT-6 Luna : conseillé par OpenAI pour les tâches nombreuses à petit prix (vérifié en novembre 2026). */
const MODELE_PAR_DEFAUT = 'gpt-6-luna';

/** Modèles de la liste qui ne savent pas écrire du texte (son, images, vectorisation…) : cachés. */
const PAS_DU_TEXTE = /(audio|realtime|transcribe|tts|image|embedding|search|whisper|dall-e|moderation|instruct|live)/;

function entetes(cle: string): Record<string, string> {
  return { 'content-type': 'application/json', authorization: `Bearer ${cle}` };
}

async function appeler(a: AppelIA): Promise<ReponseIA> {
  const corps = {
    model: a.modele,
    messages: [
      { role: 'system', content: a.systeme },
      { role: 'user', content: a.message },
    ],
    // Mode JSON : le modèle ne peut répondre que par un objet JSON.
    response_format: { type: 'json_object' },
    // « max_completion_tokens » remplace l'ancien « max_tokens » sur les modèles récents.
    max_completion_tokens: a.maxTokens,
  };
  const json = objet(await envoyer(`${ADRESSE}/chat/completions`, { method: 'POST', headers: entetes(a.cle), body: JSON.stringify(corps) }, a));
  const choix = objet(liste(json.choices)[0]);
  const message = objet(choix.message);
  const texte = typeof message.content === 'string' ? message.content : '';
  const raison = typeof choix.finish_reason === 'string' ? choix.finish_reason : undefined;
  if (!texte.trim()) throw erreurVide(typeof message.refusal === 'string' ? 'refus du modèle' : raison);
  return { texte, coupee: raison === 'length' };
}

async function listerModeles(cle: string, options: OptionsReseau = {}): Promise<string[]> {
  const json = objet(await envoyer(`${ADRESSE}/models`, { method: 'GET', headers: entetes(cle) }, options));
  const ids = liste(json.data)
    .map((m) => objet(m).id)
    .filter((id): id is string => typeof id === 'string')
    .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !PAS_DU_TEXTE.test(id));
  return trierModeles(ids, MODELE_PAR_DEFAUT);
}

export const openai: Fournisseur = {
  id: 'openai',
  nom: 'OpenAI (GPT)',
  modeleParDefaut: MODELE_PAR_DEFAUT,
  appeler,
  listerModeles,
};
