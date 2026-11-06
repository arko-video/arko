// E. Déclencheurs des bruitages automatiques (dev 3) : liste ÉDITABLE (gardée par l'interface dans localStorage
// `arko.declencheurs`), données PURES. Les mots sont comparés sans accents ni majuscules (sons/recherche.ts sansAccents),
// en expression entière (« 300 fois », « spawn kill »). Trois déclencheurs viennent du SON, pas des mots.

export type CategorieBruitage =
  | 'reussite' | 'wow' | 'bruh' | 'triste' | 'rate' | 'destin' | 'explosion' | 'ohnon' | 'wasted' | 'rire' | 'boom' | 'grillons' | 'fin';

export interface Declencheur {
  categorie: CategorieBruitage;
  /** Expressions qui déclenchent (minuscules, sans accents). Vide pour un déclencheur de son. */
  mots: string[];
  /** Déclencheur venu du son : rire fort, juron dit fort (sur un pic), silence gênant (≥ 3 s sans parole ni son). */
  signal?: 'rire' | 'juron-fort' | 'silence';
}

/** Noms affichés (écran de revue, liste éditable). */
export const NOMS_CATEGORIES: Readonly<Record<CategorieBruitage, string>> = {
  reussite: 'Mission réussie',
  wow: 'Wow',
  bruh: 'Bruh',
  triste: 'Trombone triste',
  rate: 'Mission ratée',
  destin: 'Dun dun dun',
  explosion: 'Explosion',
  ohnon: 'Oh nooon',
  wasted: 'Wasted',
  rire: 'Rire',
  boom: 'Boom',
  grillons: 'Grillons',
  fin: 'Extinction',
};

/** Les déclencheurs du brief (réglages qui ont marché sur une vraie vidéo). « non ! » exige le point d'exclamation. */
export const DECLENCHEURS_DEFAUT: readonly Declencheur[] = [
  { categorie: 'reussite', mots: ['on a gagne', 'gagne', 'victoire', '300 fois', 'trois cents fois', 'reussi'] },
  { categorie: 'wow', mots: ['wow', 'waouh', 'whoa', '1000', 'mille'] },
  { categorie: 'bruh', mots: ['zero', 'bruh'] },
  { categorie: 'triste', mots: ['bloque', 'coince'] },
  { categorie: 'rate', mots: ['impossible'] },
  { categorie: 'destin', mots: ['invincible', 'destin'] },
  { categorie: 'explosion', mots: ['explose', 'explosion'] },
  { categorie: 'ohnon', mots: ['oh non', 'non !'] },
  { categorie: 'wasted', mots: ['je suis mort', 'spawn kill', 'spawnkill', 'mort'] },
  { categorie: 'rire', mots: [], signal: 'rire' },
  { categorie: 'boom', mots: ['putain', 'merde', 'bordel', 'ptn'], signal: 'juron-fort' },
  { categorie: 'grillons', mots: [], signal: 'silence' },
  { categorie: 'fin', mots: ['tchao', 'ciao', 'a plus tard', 'a la prochaine', 'salut tout le monde'] },
];

/** Catégories dans l'ordre d'affichage. */
export const CATEGORIES: readonly CategorieBruitage[] = DECLENCHEURS_DEFAUT.map((d) => d.categorie);

/**
 * Relit une liste de déclencheurs gardée (localStorage `arko.declencheurs`) : catégories connues seulement, mots en
 * minuscules sans doublon ; une catégorie absente reprend celle de départ. Texte illisible → liste de départ.
 */
export function lireDeclencheurs(brut: string | null | undefined): Declencheur[] {
  let liste: unknown;
  try {
    liste = brut ? JSON.parse(brut) : null;
  } catch {
    liste = null;
  }
  const lus = new Map<string, string[]>();
  if (Array.isArray(liste)) {
    for (const d of liste as { categorie?: unknown; mots?: unknown }[]) {
      if (typeof d?.categorie !== 'string' || !Array.isArray(d.mots)) continue;
      const mots = d.mots.filter((m): m is string => typeof m === 'string').map((m) => m.trim().toLowerCase()).filter(Boolean);
      lus.set(d.categorie, [...new Set(mots)].slice(0, 40));
    }
  }
  return DECLENCHEURS_DEFAUT.map((d) => ({ ...d, mots: lus.get(d.categorie) ?? [...d.mots] }));
}

/** « gagné, on a gagné , » → ['gagné', 'on a gagné'] (saisie de l'écran des déclencheurs). */
export function motsDepuisTexte(texte: string): string[] {
  return [...new Set(texte.split(/[,\n;]+/).map((m) => m.trim().toLowerCase()).filter(Boolean))];
}
