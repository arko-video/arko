// Améliorer l'image — normaliseur du champ facultatif `recette.amelioration` (branché dans recette/normaliser.ts).
// Règle des champs facultatifs : absent → jamais ajouté (un ancien montage s'ouvre exactement pareil).

import { estObjet, verifierCles, type Journal } from '../../recette/normaliser-outils';
import { AMELIORATION_DEFAUT, type NiveauImage, type ReglagesAmelioration } from './reglages';

const NIVEAUX: readonly NiveauImage[] = ['leger', 'fort'];
const CLES = ['niveau', 'nettoyer', 'agrandir'] as const;

/** Lit un niveau écrit à la main ou par une IA (« Léger », « fort », « strong »…). null = « Non ». undefined = inconnu. */
function lireNiveau(v: unknown): NiveauImage | null | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (s === 'leger' || s === 'light' || s === 'doux') return 'leger';
  if (s === 'fort' || s === 'strong' || s === 'max') return 'fort';
  if (s === 'non' || s === 'aucun' || s === 'off' || s === 'none' || s === '') return null;
  return undefined;
}

/**
 * Normalise `recette.amelioration`. Accepte aussi `true` (= Léger), « leger » / « fort » (texte seul), et retire le
 * champ pour « non », `false` ou `null`. Renvoie undefined quand il n'y a pas d'amélioration.
 */
export function normaliserAmelioration(v: unknown, journal: Journal): ReglagesAmelioration | undefined {
  if (v === undefined || v === null || v === false) return undefined;
  if (v === true) return { ...AMELIORATION_DEFAUT };
  if (typeof v === 'string') {
    const n = lireNiveau(v);
    if (n === null) return undefined;
    if (n === undefined) {
      journal.corrige('amelioration', `Le niveau "${v}" est inconnu : je mets Léger.`);
      return { ...AMELIORATION_DEFAUT };
    }
    return { ...AMELIORATION_DEFAUT, niveau: n };
  }
  if (!estObjet(v)) {
    journal.ignore('amelioration', 'Le réglage « Améliorer l’image » n’est pas lisible : ignoré.');
    return undefined;
  }
  verifierCles(v, CLES, 'amelioration', journal);
  let niveau: NiveauImage = AMELIORATION_DEFAUT.niveau;
  if (v.niveau !== undefined) {
    const n = lireNiveau(v.niveau);
    if (n === null) return undefined;
    if (n === undefined || !NIVEAUX.includes(n)) {
      journal.corrige('amelioration.niveau', `Le niveau "${String(v.niveau)}" est inconnu : je mets Léger.`);
    } else niveau = n;
  }
  const booleen = (cle: 'nettoyer' | 'agrandir'): boolean => {
    const b = v[cle];
    if (b === undefined) return true;
    if (typeof b === 'boolean') return b;
    journal.corrige(`amelioration.${cle}`, `« ${cle} » doit valoir true ou false : je mets true.`);
    return true;
  };
  return { niveau, nettoyer: booleen('nettoyer'), agrandir: booleen('agrandir') };
}
