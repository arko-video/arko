// Textes du réglage « Sous-titres précis » (Best-of v4, dev-mots-2). Français simple, phrases courtes, tutoiement.

const NBSP = ' ';

export const TEXTES_PRECIS = {
  titre: 'Sous-titres précis',
  aidePresent: (min: number) => `Un meilleur modèle réécoute cette voix dans les séquences gardées : des phrases plus justes. Environ ${min}${NBSP}min de plus.`,
  aideAbsent: (mo: number, min: number) =>
    `Un meilleur modèle réécoute cette voix dans les séquences gardées : des phrases plus justes. À télécharger une seule fois (${mo}${NBSP}Mo), puis environ ${min}${NBSP}min de plus.`,
  ecoute: 'J\'écoute mieux les phrases gardées…',
  passer: 'Passer',
  passerAide: 'Monter tout de suite, avec les sous-titres simples.',
  passe: 'Sous-titres précis passés : je garde les sous-titres simples.',
  horsLigne: 'Pas de connexion pour les sous-titres précis : je garde les sous-titres simples.',
  garde: 'Je garde les sous-titres simples.',
  echec: 'Les sous-titres précis n\'ont pas marché : je garde les sous-titres simples.',
} as const;
