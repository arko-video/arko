// Recherche par mot dans « Mes sons » : sans accents, sans majuscules,
// chaque mot tapé doit être le début d'un mot du nom ou de l'étiquette. Fonctions pures.

/** « Éternuement ! » → « eternuement » (minuscules, sans accents ni ponctuation). */
export function sansAccents(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Un élément cherchable : un nom et des textes en plus (étiquette…). */
export interface Cherchable {
  nom: string;
  autres: readonly string[];
}

/**
 * Score d'un élément pour une requête (0 = ne correspond pas). Le nom compte plus que l'étiquette,
 * et un mot entier plus qu'un début de mot.
 */
export function score(element: Cherchable, requete: string): number {
  const mots = sansAccents(requete).split(' ').filter(Boolean);
  if (mots.length === 0) return 0;
  const nom = sansAccents(element.nom).split(' ');
  const autres = element.autres.flatMap((a) => sansAccents(a).split(' '));
  let total = 0;
  for (const m of mots) {
    let meilleur = 0;
    for (const n of nom) if (n.startsWith(m)) meilleur = Math.max(meilleur, n === m ? 6 : 4);
    for (const a of autres) if (a.startsWith(m)) meilleur = Math.max(meilleur, a === m ? 3 : 2);
    if (meilleur === 0) return 0;
    total += meilleur;
  }
  return total;
}

/** Les éléments qui correspondent, du plus pertinent au moins pertinent (ordre d'origine à égalité). */
export function chercher<T>(elements: readonly T[], requete: string, cherchable: (e: T) => Cherchable, max = 80): T[] {
  return elements
    .map((e, i) => ({ e, i, s: score(cherchable(e), requete) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .map((x) => x.e);
}
