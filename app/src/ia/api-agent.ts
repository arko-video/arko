// API publique du monteur IA (phase 6), pour l'interface. Tout ce qui parle aux IA passe par ici.

export {
  AVERTISSEMENT_PRIX,
  consignesAgent,
  construireMessage,
  construireRequete,
  decouperLots,
  decrireTokens,
  estimerDemande,
  estimerTokens,
  lireReponse,
  MAX_SORTIE,
  NOMBRE,
  proposerClips,
} from './agent';
export type { DemandeAgent, PropositionAgent, ReglagesAgent, ResultatAgent, ResultatLecture } from './agent';
export { conseilsTikTok, dureeRecette, REGLES_TIKTOK } from './fournisseurs/lecture-reponse';
export { FOURNISSEURS, testerCle, trouverFournisseur } from './fournisseurs';
export type { Fournisseur, IdFournisseur } from './fournisseurs/types';
export { lireCle, masquer, oublierCle, sauverCle } from './cle';
