// E. Choix du son d'un bruitage (dev 3), fonction PURE : d'abord dans « Mes sons », par étiquette et nom de fichier
// (recherche floue, sons/recherche.ts) avec les mots clés de la catégorie ; sinon un son d'Arko (CC0, fabriqué par le code).

import type { MonSon } from '../../stockage/mes-sons';
import { sansAccents, score } from '../../sons/recherche';
import type { CategorieBruitage } from './declencheurs';

export type ChoixSon = { type: 'arko'; id: string } | { type: 'mesSons'; id: string; nom: string };

/** Mots cherchés dans Mes sons pour chaque catégorie (noms habituels des packs de sons). */
export const MOTS_CLES_CATEGORIES: Readonly<Record<CategorieBruitage, readonly string[]>> = {
  reussite: ['mission passed', 'mission complete', 'success', 'victory', 'victoire'],
  wow: ['wow'],
  bruh: ['bruh'],
  triste: ['sad trombone', 'trombone', 'sad'],
  rate: ['mission failed', 'failed', 'fail'],
  destin: ['dun dun', 'dramatic', 'choir', 'choeur'],
  explosion: ['explosion', 'explode'],
  ohnon: ['oh no', 'nooo'],
  wasted: ['wasted'],
  rire: ['laugh', 'laughing', 'rire', 'sitcom'],
  boom: ['vine boom', 'boom'],
  grillons: ['crickets', 'grillons'],
  fin: ['windows shutdown', 'shutdown', 'windows', 'extinction'],
};

/**
 * Son d'Arko le plus proche, quand Mes sons n'a rien (catalogue actuel ; le dev 3 peut fabriquer de nouveaux sons
 * CC0 dans sons/synthese/ et changer cette table).
 */
export const SONS_ARKO_CATEGORIES: Readonly<Record<CategorieBruitage, string>> = {
  reussite: 'jeu.bonus',
  wow: 'interface.ding',
  bruh: 'meme.disque-raye',
  triste: 'comedie.trombone-triste',
  rate: 'interface.erreur',
  destin: 'tension.dun-dun',
  explosion: 'impact.boom',
  ohnon: 'meme.tape-stop',
  wasted: 'jeu.degat',
  rire: 'comedie.ba-dum-tss',
  boom: 'impact.meme',
  grillons: 'comedie.criquets',
  fin: 'interface.extinction',
};

/** Un son plus long que ça est une musique, pas un bruitage. */
export const DUREE_MAX_BRUITAGE = 15;

/** Distance d'édition ≤ 1 (une lettre en trop, en moins ou changée) : « explossion » ≈ « explosion ». */
function presque(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const reste = (x: string, y: string) => x.slice(i + 1) === y.slice(i + 1) || x.slice(i + 1) === y.slice(i) || x.slice(i) === y.slice(i + 1);
  return a === b || reste(a, b);
}

/**
 * Score flou d'un son pour une expression (0 = non) : chaque mot cherché doit être le début d'un mot du nom ou de
 * l'étiquette, ou presque le même mot (une faute, mots de 5 lettres et plus). Le nom compte plus que l'étiquette.
 */
export function scoreFlou(son: Pick<MonSon, 'nom' | 'etiquette'>, expression: string): number {
  const exact = score({ nom: son.nom, autres: [son.etiquette] }, expression);
  if (exact > 0) return exact;
  const cherches = sansAccents(expression).split(' ').filter(Boolean);
  const nom = sansAccents(son.nom).split(' ');
  const etiquette = sansAccents(son.etiquette).split(' ');
  let total = 0;
  for (const m of cherches) {
    const ok = (mots: string[]) => m.length >= 5 && mots.some((n) => n.length >= 4 && presque(n.slice(0, m.length + 1), m) || presque(n, m));
    const points = ok(nom) ? 3 : ok(etiquette) ? 1 : 0;
    if (points === 0) return 0;
    total += points;
  }
  return total;
}

export interface OptionsChoix {
  /** Sons déjà pris par d'autres bruitages : à éviter s'il y en a un autre aussi bon (variété). */
  eviter?: ReadonlySet<string>;
}

/** Les sons de Mes sons qui conviennent à une catégorie, du meilleur au moins bon. */
export function sonsPossibles(categorie: CategorieBruitage, mesSons: readonly MonSon[]): MonSon[] {
  const courts = mesSons.filter((s) => s.duree <= DUREE_MAX_BRUITAGE);
  const res: { s: MonSon; note: number }[] = [];
  MOTS_CLES_CATEGORIES[categorie].forEach((cle, rang) => {
    for (const s of courts) {
      const sc = scoreFlou(s, cle);
      // Le 1er mot clé passe avant les suivants ; à rang égal, le meilleur score.
      if (sc > 0) res.push({ s, note: (MOTS_CLES_CATEGORIES[categorie].length - rang) * 100 + sc });
    }
  });
  const vus = new Set<string>();
  return res
    .sort((a, b) => b.note - a.note)
    .map((x) => x.s)
    .filter((s) => (vus.has(s.id) ? false : (vus.add(s.id), true)));
}

/** Le son d'un bruitage : le meilleur de Mes sons (étiquette + nom, recherche floue), sinon le son d'Arko de secours. */
export function choisirSon(categorie: CategorieBruitage, mesSons: readonly MonSon[], o: OptionsChoix = {}): ChoixSon {
  const possibles = sonsPossibles(categorie, mesSons);
  if (possibles.length > 0) {
    const meilleurs = possibles.filter((s) => scoreDe(s, categorie) === scoreDe(possibles[0]!, categorie));
    const s = meilleurs.find((x) => !o.eviter?.has(x.id)) ?? possibles[0]!;
    return { type: 'mesSons', id: s.id, nom: s.nom };
  }
  return { type: 'arko', id: SONS_ARKO_CATEGORIES[categorie] };
}

/** Note d'un son pour la 1re clé qui lui va (pour regrouper les ex æquo). */
function scoreDe(s: MonSon, categorie: CategorieBruitage): number {
  const cles = MOTS_CLES_CATEGORIES[categorie];
  for (let r = 0; r < cles.length; r++) {
    const sc = scoreFlou(s, cles[r]!);
    if (sc > 0) return (cles.length - r) * 100 + sc;
  }
  return 0;
}
