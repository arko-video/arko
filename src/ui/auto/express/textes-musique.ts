// Textes de la musique automatique du Montage express (réglages). Français simple, phrases courtes.

const NBSP = ' ';

export const TEXTES_MUSIQUE_EXPRESS = {
  auto: 'Musique automatique',
  autoAide: `Arko met un morceau par groupe de séquences. Il change avec l'ambiance. Pas de musique pendant l'accroche. Elle baisse quand tu parles.`,
  bibliotheque: (n: number) => (n === 1 ? `Il prend d'abord ta musique de Ma bibliothèque.` : `Il prend d'abord tes ${n} musiques de Ma bibliothèque.`),
  bibliothequeVide: `Ta bibliothèque n'a pas de musique : Arko prend des morceaux gratuits de Kevin MacLeod. Sans internet, il fabrique sa propre musique.`,
  credit: `Morceaux de Kevin MacLeod${NBSP}: le crédit est obligatoire. Tu le copies dans Habiller → Sons → Musique.`,
  aChoisir: 'Ou choisis tes morceaux (1 à 6) :',
  aucune: `Pas de musique. Coche « Musique automatique » ou choisis des morceaux.`,
  apres: 'Tu peux tout changer après, dans Habiller → Sons → Musique.',
  /** Pendant « Monter la vidéo » (téléchargement des morceaux de Kevin MacLeod, la 1re fois). */
  prepare: 'Je prépare la musique…',
} as const;
