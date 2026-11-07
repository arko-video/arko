// F. Rappels de licence de la musique (dev 3), fonction PURE.
//  - « Kevin MacLeod » / « incompetech » dans le nom → ligne de crédit CC BY 4.0 à copier dans la description YouTube ;
//  - musiques de jeux (Nintendo, Mario, Zelda, Pokémon, Sonic…) → prévenir qu'elles déclenchent des réclamations.

import { sansAccents } from '../../sons/recherche';
import { TEXTES_SON_AUTO } from '../../ui/auto/son/textes';

export interface AvisMusique {
  /** Lignes de crédit à copier (une par morceau concerné, sans doublon). */
  credits: string[];
  /** Avertissements en français simple. */
  alertes: string[];
}

const KEVIN = /kevin\s*_?\s*mac\s*_?\s*leod|incompetech/i;
/** Mots qui trahissent une musique de jeu sous droits (comparés sans accents ni majuscules, en mot entier). */
export const JEUX_RECLAMATIONS = [
  'nintendo', 'mario', 'zelda', 'pokemon', 'sonic', 'kirby', 'smash', 'splatoon', 'animal crossing', 'metroid',
  'donkey kong', 'sega', 'final fantasy', 'minecraft', 'c418', 'fortnite', 'halo', 'tetris',
];

/** Titre lisible tiré d'un nom de fichier (« Kevin_MacLeod_-_Sneaky_Snitch.mp3 » → « Sneaky Snitch »). */
export function titreMorceau(nom: string): string {
  const sans = nom
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(KEVIN, ' ')
    .replace(/\(\s*(incompetech(\.com)?)?\s*\)/gi, ' ')
    .replace(/\s*[-–—|·]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^(\s*-\s*)+|(\s*-\s*)+$/g, '')
    .trim();
  return sans || 'Sans titre';
}

/**
 * Crédit officiel d'incompetech (CC BY 4.0), à copier tel quel : les 3 lignes EXACTES de la page du morceau
 * (« Attribution Code » ; intégrateur, relecture point 10 : avant, une seule ligne avec des « · »).
 */
export function ligneCredit(nom: string): string {
  return `"${titreMorceau(nom)}" Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 4.0 License\nhttp://creativecommons.org/licenses/by/4.0/`;
}

/** Le nom contient-il une musique de jeu connue ? */
export function estMusiqueDeJeu(nom: string): boolean {
  const texte = ` ${sansAccents(nom)} `;
  return JEUX_RECLAMATIONS.some((j) => texte.includes(` ${j} `));
}

export function avisMusique(noms: readonly string[]): AvisMusique {
  const credits = [...new Set(noms.filter((n) => KEVIN.test(n)).map(ligneCredit))];
  const jeux = [...new Set(noms.filter(estMusiqueDeJeu).map(titreMorceau))];
  const alertes = jeux.length > 0 ? [TEXTES_SON_AUTO.musique.alerteNoms(jeux.join(', ')), TEXTES_SON_AUTO.musique.alerteJeux] : [];
  return { credits, alertes };
}
