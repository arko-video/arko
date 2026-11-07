// D. Choix AUTOMATIQUE de la situation de jeu d'un tour de parole (Best-of, Qui parle ?), d'après les mots dits
// pendant le tour et juste autour (± 1,5 s). LA TABLE DES MOTS CLÉS EST ICI, ET SEULEMENT ICI : pour l'étendre,
// ajouter un mot (sans accent, en minuscules) à la ligne de la situation. Les lignes sont lues dans l'ordre : la
// première situation dont un mot est dit gagne. Une expression de plusieurs mots s'écrit avec des espaces.
// Sans mot clé : aucune situation (le perso montre juste son émotion).

import { motNu } from '../auto/habillage/jurons';
import type { Mot, Sec, TourDeParole } from '../recette/types';
import type { Situation } from './catalogue';

/** Mots clés de chaque situation, de la plus précise à la plus vague. */
export const MOTS_SITUATIONS: readonly (readonly [Situation, readonly string[]])[] = [
  ['mort', ['mort', 'je suis mort', 'chui mort', 'jsuis mort', 'meurs', 'mourir', 'rip', 'creve']],
  ['lag', ['lag', 'lagge', 'laggue', 'lagg', 'freeze', 'ping']],
  ['afk', ['afk']],
  ['bombe', ['tnt', 'explose', 'explosion', 'boum', 'boom', 'bombe', 'dynamite']],
  ['feu', ['brule', 'bruler', 'brulee', 'lave', 'feu', 'flamme', 'flammes', 'crame']],
  ['potion', ['potion', 'potions', 'fiole']],
  ['coffre', ['coffre', 'coffres', 'tresor', 'loot']],
  ['gemme', ['gemme', 'emeraude', 'rubis', 'saphir', 'pierre precieuse']],
  ['pioche', ['pioche', 'mine', 'miner', 'diamant', 'diamants', 'creuse', 'creuser', 'minerai']],
  ['peche', ['peche', 'pecher', 'poisson', 'canne a peche']],
  ['manette', ['manette', 'rage quit', 'ragequit']],
  ['epee', ['epee', 'tape', 'taper', 'tue', 'tuer', 'frappe', 'attaque', 'attaquer']],
  ['arc', ['arc', 'fleche', 'fleches']],
  ['bouclier', ['bouclier', 'protege', 'pare']],
  ['marteau', ['marteau', 'construit', 'construire', 'construis']],
  ['mange', ['mange', 'manger', 'faim', 'bouffe', 'miam']],
  ['soin', ['soigne', 'soigner', 'soin', 'heal', 'regen']],
  ['micro', ['micro']],
  ['peur', ['monstre', 'monstres', 'peur', 'flippe', 'zombie']],
  ['chute', ['tombe', 'tomber', 'chute', 'vide']],
  ['court', ['courir', 'sprint', 'cours vite', 'je cours']],
  ['frime', ['frime', 'swag', 'trop classe', 'beau gosse']],
  ['trophee', ['gagne', 'gagner', 'gg', 'victoire', 'win', 'top 1', 'champion']],
];

/** Expressions qui contiennent un mot clé sans vouloir dire la situation (« mort de rire »). */
export const FAUX_AMIS: readonly string[] = ['mort de rire', 'mdr', 'mort de honte', 'mine de rien', 'pare feu'];

/** Marge autour du tour où les mots comptent aussi (s). */
export const AUTOUR = 1.5;

/** Situation d'après des mots (texte brut ou mots de la transcription), ou undefined. */
export function situationDesMots(mots: readonly string[]): Situation | undefined {
  const nus = mots.map(motNu).filter(Boolean);
  let texte = ` ${nus.join(' ')} `;
  for (const f of FAUX_AMIS) texte = texte.split(` ${f} `).join(' ');
  for (const [sit, cles] of MOTS_SITUATIONS) {
    if (cles.some((c) => texte.includes(` ${c} `))) return sit;
  }
  return undefined;
}

/** Situation d'un tour de parole : mots dits pendant le tour et à ± 1,5 s. */
export function situationDuTour(tour: TourDeParole, mots: readonly Mot[]): Situation | undefined {
  const de: Sec = tour.ts - AUTOUR;
  const a: Sec = tour.fin + AUTOUR;
  return situationDesMots(mots.filter((m) => m[2] > de && m[1] < a).map((m) => m[0]));
}
