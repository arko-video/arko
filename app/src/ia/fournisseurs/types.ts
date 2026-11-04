// Ce que tous les fournisseurs d'IA (Anthropic, OpenAI, Gemini) savent faire, vu par le reste d'Arko.
// Chaque fournisseur a son fichier (anthropic.ts, openai.ts, gemini.ts) qui suit ce contrat.

/** Les 3 fournisseurs pris en charge. */
export type IdFournisseur = 'anthropic' | 'openai' | 'gemini';

/** La fonction fetch (remplaçable par un faux fetch dans les tests). */
export type FonctionFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Options communes à tous les appels réseau. */
export interface OptionsReseau {
  /** Pour annuler (bouton « Annuler »). */
  signal?: AbortSignal;
  /** Faux fetch pour les tests (par défaut : le vrai fetch du navigateur). */
  fetch?: FonctionFetch;
  /** Délai maximum en millisecondes (défaut : 120 000, soit 2 min). */
  delai?: number;
}

/** Une demande envoyée au modèle. */
export interface AppelIA extends OptionsReseau {
  /** Clé API de l'utilisateur. Jamais affichée, jamais écrite dans la console. */
  cle: string;
  modele: string;
  /** Consignes (partie « système »). */
  systeme: string;
  /** Les données : moments, nombre de clips, consigne libre. */
  message: string;
  /** Nombre maximum de tokens dans la réponse. */
  maxTokens: number;
}

/** La réponse brute du modèle. */
export interface ReponseIA {
  /** Le texte écrit par le modèle (normalement du JSON). */
  texte: string;
  /** true si le modèle s'est arrêté faute de place (réponse coupée). */
  coupee: boolean;
}

export interface Fournisseur {
  id: IdFournisseur;
  /** Nom affiché (« Anthropic (Claude) »). */
  nom: string;
  /** Le modèle le moins cher et assez bon (vérifié dans la doc officielle en novembre 2026). */
  modeleParDefaut: string;
  /** Envoie la demande et renvoie le texte de la réponse. */
  appeler(appel: AppelIA): Promise<ReponseIA>;
  /** Liste des modèles (sert à « Tester ma clé » : ne coûte aucun token). */
  listerModeles(cle: string, options?: OptionsReseau): Promise<string[]>;
}
