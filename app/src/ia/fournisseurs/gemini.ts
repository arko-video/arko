// Fournisseur Google Gemini, appelé directement depuis le navigateur.
// Doc : https://ai.google.dev/gemini-api/docs/models (méthode generateContent, API v1beta).

import { envoyer, erreurVide, liste, objet, trierModeles } from './commun';
import type { AppelIA, Fournisseur, OptionsReseau, ReponseIA } from './types';

const ADRESSE = 'https://generativelanguage.googleapis.com/v1beta';
/** Flash-Lite : le plus économique des modèles Gemini stables (vérifié en novembre 2026). */
const MODELE_PAR_DEFAUT = 'gemini-3.5-flash-lite';

/** Modèles qui ne servent pas à écrire du texte (voix, images, vectorisation…) : cachés. */
const PAS_DU_TEXTE = /(tts|image|embedding|live|audio|aqa|imagen|veo)/;

function entetes(cle: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-goog-api-key': cle };
}

/** « models/gemini-x » → « gemini-x » (l'utilisateur peut coller l'un ou l'autre). */
function nomCourt(modele: string): string {
  return modele.trim().replace(/^models\//, '');
}

async function appeler(a: AppelIA): Promise<ReponseIA> {
  const corps = {
    systemInstruction: { parts: [{ text: a.systeme }] },
    contents: [{ role: 'user', parts: [{ text: a.message }] }],
    // Réponse en JSON seulement.
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: a.maxTokens },
  };
  const url = `${ADRESSE}/models/${encodeURIComponent(nomCourt(a.modele))}:generateContent`;
  const json = objet(await envoyer(url, { method: 'POST', headers: entetes(a.cle), body: JSON.stringify(corps) }, a));
  const candidat = objet(liste(json.candidates)[0]);
  // On garde le texte, sans les « pensées » du modèle (parties marquées thought).
  const texte = liste(objet(candidat.content).parts)
    .map(objet)
    .filter((p) => typeof p.text === 'string' && p.thought !== true)
    .map((p) => p.text as string)
    .join('');
  const raison = typeof candidat.finishReason === 'string' ? candidat.finishReason : undefined;
  const blocage = objet(json.promptFeedback).blockReason;
  if (!texte.trim()) throw erreurVide(typeof blocage === 'string' ? blocage : raison);
  return { texte, coupee: raison === 'MAX_TOKENS' };
}

async function listerModeles(cle: string, options: OptionsReseau = {}): Promise<string[]> {
  const json = objet(await envoyer(`${ADRESSE}/models?pageSize=1000`, { method: 'GET', headers: entetes(cle) }, options));
  const ids = liste(json.models)
    .map(objet)
    .filter((m) => liste(m.supportedGenerationMethods).includes('generateContent'))
    .map((m) => (typeof m.name === 'string' ? nomCourt(m.name) : ''))
    .filter((id) => id && !PAS_DU_TEXTE.test(id));
  return trierModeles(ids, MODELE_PAR_DEFAUT);
}

export const gemini: Fournisseur = {
  id: 'gemini',
  nom: 'Google Gemini',
  modeleParDefaut: MODELE_PAR_DEFAUT,
  appeler,
  listerModeles,
};
