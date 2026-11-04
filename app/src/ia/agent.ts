// Monteur IA (phase 6) : envoie le résumé ARKO-MOMENTS/1 et les consignes à un modèle, reçoit des recettes,
// les passe au normaliseur et les propose comme brouillons.
// Étapes : consignesAgent → construireRequete → fournisseur (fournisseurs/) → lireReponse.

import { ErreurArko } from '../moteur/erreurs';
import { STYLES_TEXTE, TRANSITIONS } from '../recette/defauts';
import type { Probleme, Source } from '../recette/types';
import { catalogueIds } from '../sons/catalogue';
import { trouverFournisseur } from './fournisseurs';
import { lireReponse, REGLES_TIKTOK, type PropositionAgent } from './fournisseurs/lecture-reponse';
import type { IdFournisseur, OptionsReseau, ReponseIA } from './fournisseurs/types';

export { lireReponse, type PropositionAgent, type ResultatLecture } from './fournisseurs/lecture-reponse';

/** Nombre de clips : 10 par défaut, 30 au plus, 15 au plus par requête (sinon la réponse risque d'être coupée). */
export const NOMBRE = { defaut: 10, max: 30, parRequete: 15 };
/** Place laissée à la réponse du modèle (en tokens). */
export const MAX_SORTIE = 16_000;
/** Taille moyenne d'une recette écrite par l'IA (en tokens), pour l'estimation. */
export const TOKENS_PAR_RECETTE = 250;

export interface DemandeAgent {
  /** Résumé des moments (formaterMoments). */
  moments: string;
  /** Nombre de clips voulus (10 par défaut, 30 au plus). */
  nombre: number;
  /** Consigne libre de l'utilisateur (« que des clutchs »). */
  consigne?: string;
  /** Sources réellement ouvertes (durées exactes) : le normaliseur s'en sert. */
  sources: Source[];
  signal?: AbortSignal;
}

/** Réglages de l'IA choisis par l'utilisateur. */
export interface ReglagesAgent extends Omit<OptionsReseau, 'signal'> {
  fournisseur: IdFournisseur;
  /** Clé API (lue avec lireCle, jamais affichée en entier). */
  cle: string;
  /** Vide = modèle par défaut du fournisseur. */
  modele?: string;
  /** Appelé avant chaque requête, puis à la fin : (requêtes faites, total). */
  surProgression?: (faites: number, total: number) => void;
}

export interface ResultatAgent {
  propositions: PropositionAgent[];
  /** Problèmes de la réponse entière (réponse coupée, 2e demande échouée…). */
  problemes: Probleme[];
}

/** Consignes envoyées au modèle (partie « système ») : format compact de la recette et règles TikTok. */
export function consignesAgent(): string {
  const { dureeMin, dureeMax, accrocheAvant, motsMax } = REGLES_TIKTOK;
  const transitions = TRANSITIONS.map((t) => t.id).filter((id) => id !== 'coupe');
  return `Tu es le monteur d'Arko. À partir des moments forts d'une vidéo de jeu, propose des clips TikTok.
Moments (format ARKO-MOMENTS/1) : id debut fin score etiquettes | extrait. Temps en secondes de la vidéo source.

Réponds UNIQUEMENT par un objet JSON, sans texte autour ni markdown : {"recettes":[…]}, une recette par clip, la meilleure d'abord. Exemple de recette :
{"titre":"Il m'a one-shot","raison":"Cri puis fou rire, chute nette","plans":[{"de":842.3,"a":851,"m":"m01"},{"de":855.2,"a":862,"m":"m01","trans":"flash"}],"textes":[{"txt":"IL M'A ONE-SHOT ??","role":"accroche","t":0,"dur":2.5}],"sons":[{"id":"impact.boom","ts":857.1}],"zooms":[{"ts":857.1,"force":1.4}],"sousTitres":{"mots":"auto"}}

Champs (n'en ajoute aucun autre) :
- titre : ${motsMax} mots au plus.
- raison : une phrase courte en français : pourquoi ce clip marche.
- plans : morceaux gardés, dans l'ordre du clip. de et a = temps SOURCE, dans ou autour des moments. m = id du moment. trans = transition pour entrer dans le plan (jamais sur le premier).
- textes : t = temps dans le clip (0 = début), dur en secondes. role "accroche" pour le texte du début. style facultatif : ${STYLES_TEXTE.join(', ')}.
- sons et zooms : ts = temps SOURCE du pic, à l'intérieur d'un plan. force du zoom : 1.2 à 2.
- sousTitres : toujours {"mots":"auto"} (Arko transcrit lui-même).

Sons valides : ${catalogueIds().join(', ')}.
Transitions valides : ${transitions.join(', ')} (sans trans = coupe franche).

Règles TikTok :
- Durée du clip (somme des a − de) : ${dureeMin} à ${dureeMax} s.
- Le meilleur moment d'abord : accroche visible avant ${accrocheAvant} s.
- ${motsMax} mots au plus par texte, dans la langue de la vidéo, sans hashtag ni emoji.
- Finis sur la chute (la réaction, le résultat), rien après.
- 1 à 3 sons et 0 à 2 zooms par clip, sur les vrais pics. Aucun temps mort.
- Chaque moment sert à un seul clip. Suis la consigne de l'utilisateur si elle est donnée.`;
}

/** Nombre de clips demandé à chaque requête : [n] jusqu'à 15, sinon 2 requêtes de 15 au plus. */
export function decouperLots(nombre: number): number[] {
  const n = Math.min(NOMBRE.max, Math.max(1, Math.round(Number.isFinite(nombre) ? nombre : NOMBRE.defaut)));
  return n <= NOMBRE.parRequete ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
}

/**
 * Partie « données » de la requête : moments, nombre de clips, moments déjà pris, consigne libre.
 * `deja` = ids des moments utilisés par la 1re requête (pour que la 2e propose d'autres clips).
 */
export function construireMessage(demande: DemandeAgent, nombre = decouperLots(demande.nombre)[0]!, deja: readonly string[] = []): string {
  const lignes = ['Moments :', demande.moments.trim(), '', nombre > 1 ? `Propose ${nombre} clips différents.` : 'Propose 1 clip.'];
  if (deja.length) lignes.push(`Moments déjà utilisés, à ne pas reprendre : ${deja.join(', ')}.`);
  const consigne = demande.consigne?.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (consigne) lignes.push(`Consigne de l'utilisateur : « ${consigne} »`);
  return lignes.join('\n');
}

/**
 * Texte EXACT envoyé au modèle (consignes, puis données) : sert aussi au bouton « Voir ce qui est envoyé ».
 * Les consignes partent dans la partie « système », les données dans le message. Fonction pure.
 * Au-delà de 15 clips, une 2e requête semblable part ensuite, avec la liste des moments déjà pris.
 */
export function construireRequete(demande: DemandeAgent, nombre?: number, deja: readonly string[] = []): string {
  return `${consignesAgent()}\n\n${construireMessage(demande, nombre, deja)}`;
}

/** Nombre de tokens d'un texte, à peu près (environ 3,5 caractères par token en français). */
export function estimerTokens(texte: string): number {
  return Math.ceil(texte.length / 3.5);
}

/** Les prix changent : on reste prudent et on renvoie vers le fournisseur. */
export const AVERTISSEMENT_PRIX = 'Les prix changent souvent : vérifie-les chez ton fournisseur. Un gros modèle coûte bien plus cher.';

/** En mots simples : « environ 15 000 tokens, soit quelques centimes avec un petit modèle ». */
export function decrireTokens(tokens: number): string {
  const pas = 10 ** Math.max(2, Math.floor(Math.log10(Math.max(tokens, 1))) - 1);
  const arrondi = Math.max(pas, Math.round(tokens / pas) * pas);
  const nombre = String(arrondi).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cout = tokens <= 50_000 ? 'quelques centimes' : 'quelques dizaines de centimes au plus';
  return `environ ${nombre} tokens, soit ${cout} avec un petit modèle`;
}

/** Estimation avant l'envoi : tokens envoyés (toutes les requêtes) + tokens de la réponse. */
export function estimerDemande(demande: DemandeAgent): { tokens: number; requetes: number; phrase: string } {
  const lots = decouperLots(demande.nombre);
  const entree = lots.reduce((s, n) => s + estimerTokens(construireRequete(demande, n)), 0);
  const sortie = lots.reduce((s, n) => s + n * TOKENS_PAR_RECETTE, 0);
  const tokens = entree + sortie;
  return { tokens, requetes: lots.length, phrase: decrireTokens(tokens) };
}

/** Demande des propositions de clips au monteur IA. Erreurs : ErreurArko (message en français). */
export async function proposerClips(demande: DemandeAgent, reglages: ReglagesAgent): Promise<ResultatAgent> {
  const fournisseur = trouverFournisseur(reglages.fournisseur);
  const cle = reglages.cle.trim();
  if (!cle) throw new ErreurArko('Colle d\'abord ta clé API.', 'cle_vide');
  if (!demande.moments.trim()) throw new ErreurArko('Aucun moment à envoyer : lance d\'abord l\'analyse.', 'moments_vides');
  const modele = reglages.modele?.trim() || fournisseur.modeleParDefaut;
  const lots = decouperLots(demande.nombre);
  const propositions: PropositionAgent[] = [];
  const problemes: Probleme[] = [];
  const deja: string[] = [];

  for (const [i, nombre] of lots.entries()) {
    reglages.surProgression?.(i, lots.length);
    let reponse: ReponseIA;
    try {
      reponse = await fournisseur.appeler({
        cle,
        modele,
        systeme: consignesAgent(),
        message: construireMessage(demande, nombre, deja),
        maxTokens: MAX_SORTIE,
        signal: demande.signal,
        fetch: reglages.fetch,
        delai: reglages.delai,
      });
    } catch (e) {
      // La 1re requête a marché : on garde ses clips et on signale l'échec de la 2e.
      if (i > 0 && e instanceof ErreurArko && e.code !== 'annule') {
        problemes.push({ chemin: 'reponse', niveau: 'conseil', message: `La 2e demande a échoué : ${e.message}` });
        break;
      }
      throw e;
    }
    const lu = lireReponse(reponse.texte, demande.sources);
    if (lu.propositions.length === 0 && i === 0) {
      if (reponse.coupee || lu.coupee) {
        throw new ErreurArko('La réponse de l\'IA est coupée avant la fin du premier clip. Demande moins de clips.', 'reponse_coupee');
      }
      const cause = lu.problemes[0]?.message ?? '';
      throw new ErreurArko(`L'IA n'a proposé aucun clip utilisable. ${cause}`.trim(), 'reponse_inutilisable');
    }
    problemes.push(...lu.problemes);
    propositions.push(...lu.propositions);
    for (const p of lu.propositions) for (const plan of p.recette.plans) if (plan.m && !deja.includes(plan.m)) deja.push(plan.m);
  }
  reglages.surProgression?.(lots.length, lots.length);
  return { propositions: propositions.slice(0, lots.reduce((s, n) => s + n, 0)), problemes };
}
