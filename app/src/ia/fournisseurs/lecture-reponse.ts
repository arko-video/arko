// Lecture de la réponse d'une IA : on retrouve les recettes (extraire-json.ts), chacune passe
// par le normaliseur avec les VRAIES sources, puis on vérifie les règles TikTok. Fonctions pures.

import { normaliser } from '../../recette/normaliser';
import { FORMAT_RECETTE, type Probleme, type Recette, type Source } from '../../recette/types';
import { extraireRecettes } from './extraire-json';

/** Règles TikTok demandées à l'IA (et vérifiées ici). */
export const REGLES_TIKTOK = { dureeMin: 15, dureeMax: 45, accrocheAvant: 3, motsMax: 6 };

/** Un clip proposé par l'IA, prêt pour la Revue. */
export interface PropositionAgent {
  /** Recette normalisée, avec statut « brouillon ». */
  recette: Recette;
  /** Pourquoi ce clip marche, en une phrase (écrite par l'IA ; vide si elle l'a oubliée). */
  raison: string;
  /** Ce que le normaliseur a corrigé, et les conseils TikTok. */
  problemes: Probleme[];
}

export interface ResultatLecture {
  propositions: PropositionAgent[];
  /** Problèmes de la réponse entière (JSON coupé, recette inutilisable…). */
  problemes: Probleme[];
  /** true si la réponse était coupée (seules les recettes complètes sont gardées). */
  coupee: boolean;
}

/** Noms que les IA écrivent parfois à la place des nôtres, au niveau de la recette. */
const ALIAS: Record<string, string> = {
  title: 'titre', reason: 'raison', pourquoi: 'raison', texts: 'textes', texte: 'textes',
  sounds: 'sons', son: 'sons', zoom: 'zooms', subtitles: 'sousTitres', soustitres: 'sousTitres',
  sous_titres: 'sousTitres', captions: 'sousTitres', clips: 'plans', cuts: 'plans',
};

/**
 * Lit la réponse de l'IA. `sources` = sources réellement ouvertes (durées exactes).
 * Ne lève jamais d'erreur : ce qui ne va pas est listé dans `problemes`.
 */
export function lireReponse(texte: string, sources: readonly Source[]): ResultatLecture {
  const extrait = extraireRecettes(texte);
  const problemes: Probleme[] = extrait.remarques.map((message) => ({
    chemin: 'reponse',
    niveau: extrait.recettes.length === 0 ? 'bloquant' : 'corrige',
    message,
  }));
  const propositions: PropositionAgent[] = [];
  extrait.recettes.forEach((brut, i) => {
    const lu = lireUneRecette(brut, i, sources);
    if ('recette' in lu) propositions.push(lu);
    else problemes.push(lu);
  });
  if (extrait.recettes.length > 0 && propositions.length === 0) {
    problemes.push({ chemin: 'reponse', niveau: 'bloquant', message: 'Aucune recette de la réponse n\'est utilisable.' });
  }
  return { propositions, problemes, coupee: extrait.coupe };
}

function lireUneRecette(brut: unknown, i: number, sources: readonly Source[]): PropositionAgent | Probleme {
  const chemin = `recettes[${i}]`;
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return { chemin, niveau: 'ignore', message: `La recette n° ${i + 1} n'est pas un objet JSON : ignorée.` };
  }
  const obj: Record<string, unknown> = { ...(brut as Record<string, unknown>) };
  const problemes: Probleme[] = [];
  for (const [ancien, nouveau] of Object.entries(ALIAS)) {
    if (ancien in obj && !(nouveau in obj)) {
      obj[nouveau] = obj[ancien];
      problemes.push({ chemin: ancien, niveau: 'corrige', message: `La clé "${ancien}" a été lue comme "${nouveau}".` });
    }
    delete obj[ancien];
  }
  const raison = typeof obj.raison === 'string' ? obj.raison.trim().slice(0, 200) : '';
  delete obj.raison;
  // L'IA ne connaît pas les vraies sources : le normaliseur ajoute celles qui sont ouvertes.
  delete obj.sources;
  obj.format ??= FORMAT_RECETTE;
  // Sous-titres « auto » par défaut : l'interface les remplira avec les mots de l'analyse.
  if (obj.sousTitres === undefined) obj.sousTitres = { mots: 'auto' };
  obj.statut = 'brouillon';

  const r = normaliser(obj, { sources: [...sources] });
  if (r.bloquant) {
    const cause = r.problemes.find((p) => p.niveau === 'bloquant')?.message ?? '';
    return { chemin, niveau: 'ignore', message: `La recette n° ${i + 1} est inutilisable : ${cause.charAt(0).toLowerCase()}${cause.slice(1)}` };
  }
  return { recette: r.recette, raison, problemes: [...problemes, ...r.problemes, ...conseilsTikTok(r.recette)] };
}

/** Durée finale d'une recette normalisée (en secondes). */
export function dureeRecette(recette: Recette): number {
  return recette.plans.reduce((s, p) => s + (p.a - p.de) / (p.vit ?? 1) + (p.fige ?? 0), 0);
}

/** Vérifie les règles TikTok (durée, accroche, textes courts) : de simples conseils. */
export function conseilsTikTok(recette: Recette): Probleme[] {
  const res: Probleme[] = [];
  const { dureeMin, dureeMax, accrocheAvant, motsMax } = REGLES_TIKTOK;
  const duree = dureeRecette(recette);
  if (duree < dureeMin || duree > dureeMax) {
    res.push({ chemin: 'plans', niveau: 'conseil', message: `Le clip dure ${Math.round(duree)} s : sur TikTok, vise ${dureeMin} à ${dureeMax} s.` });
  }
  if (!recette.textes.some((t) => t.t < accrocheAvant)) {
    res.push({ chemin: 'textes', niveau: 'conseil', message: `Aucun texte avant ${accrocheAvant} s : ajoute une accroche.` });
  }
  recette.textes.forEach((t, i) => {
    const mots = t.txt.split(/\s+/).filter(Boolean).length;
    if (mots > motsMax) {
      res.push({ chemin: `textes[${i}].txt`, niveau: 'conseil', message: `Le texte « ${t.txt} » a ${mots} mots : ${motsMax} au plus se lisent mieux.` });
    }
  });
  return res;
}
