// Textes des situations de jeu des persos (7/11/2026) : noms affichés dans l'atelier, « Qui parle ? » et
// « Insérer ici ». Réunis dans TV par src/textes-v3.ts : TV.situations.…

import type { Situation } from '../../../chibis/catalogue';

export const TEXTES_SITUATIONS = {
  titre: 'Situations',
  aide: 'Un objet en main ou un petit décor. Il se combine avec l\'émotion.',
  prets: 'Persos tout prêts',
  pretsAide: 'Touche un perso pour partir de lui.',
  situation: 'Situation',
  choisir: 'Situation de cette phrase',
  noms: {
    aucune: 'Aucune', epee: 'Épée', arc: 'Arc', bouclier: 'Bouclier', pioche: 'Pioche', marteau: 'Marteau',
    bombe: 'Bombe', feu: 'En feu', peche: 'Pêche', mange: 'Mange', potion: 'Potion', mort: 'Mort', trophee: 'Trophée',
    coffre: 'Coffre', gemme: 'Pierre précieuse', manette: 'Rage manette', lag: 'Lag', peur: 'Peur du monstre',
    afk: 'AFK', micro: 'Micro', soin: 'Se soigne', chute: 'Tombe dans le vide', court: 'Court', frime: 'Frime',
  } satisfies Record<Situation, string>,
} as const;
