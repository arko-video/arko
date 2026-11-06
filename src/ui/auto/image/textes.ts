// Textes de « Améliorer l'image » (tutoiement, phrases courtes, espace insécable avant « ? ! : »).

const NB = ' ';

export const TI = {
  bouton: 'Améliorer l’image',
  etat: { non: 'Non', leger: 'Léger', fort: 'Fort' } as Record<'non' | 'leger' | 'fort', string>,
  titre: 'Améliorer l’image',
  aide: 'Pour une capture de jeu pixelisée ou molle (OBS en 720p, gros carrés de compression). Tout se fait sur ton téléphone, rien n’est envoyé.',
  niveau: 'Niveau',
  niveaux: {
    non: { nom: 'Non', texte: 'L’image telle quelle.' },
    leger: { nom: 'Léger', texte: 'Enlève les carrés de compression et agrandit avec l’IA. Conseillé.' },
    fort: { nom: 'Fort', texte: 'Nettoie aussi avec l’IA : image plus lisse, textures un peu « peintes ».' },
  },
  nettoyer: 'Nettoyer la compression',
  nettoyerAide: 'Enlève les carrés et le bruit laissés par l’encodage.',
  agrandirIa: 'Agrandir avec l’IA',
  agrandirSansIa: 'Agrandir net (sans IA)',
  agrandirAide: 'Double la taille de l’image en gardant les pixels du jeu nets. Seulement si elle est agrandie dans la vidéo.',
  moteur: {
    ia: 'Moteur : IA Anime4K, sur la carte graphique de ton appareil.',
    classique: `Ta carte graphique ne permet pas l’IA ici${NB}: Arko fait un nettoyage et un agrandissement net SANS IA.`,
    aucun: `Ton appareil ne peut pas améliorer l’image (WebGL2 manquant)${NB}: la vidéo sera exportée telle quelle.`,
  },
  mesure: 'Je mesure la vitesse de ton appareil…',
  vitesse: (ms: string, plus: string) => `Environ ${ms}${NB}ms par image sur cet appareil · export${NB}: ${plus} de plus.`,
  vitesseLente: 'L’aperçu risque de ramer sur cet appareil.',
  dansApercu: 'Aussi dans l’aperçu',
  dansApercuAide: 'Décoche pour garder un aperçu fluide : l’amélioration sera faite seulement à l’export.',
  apercuCoupe: `Aperçu trop lent${NB}: il montre l’image d’origine. L’export, lui, sera bien amélioré.`,
  avantApres: 'Avant / après',
  avantApresAide: 'Glisse pour comparer (image au milieu de la vidéo, à la taille de l’export).',
  avant: 'Avant',
  apres: 'Après',
  prepare: 'Je prépare l’avant / après…',
  rien: 'Rien à comparer : l’amélioration est sur « Non ».',
  erreur: 'Impossible de préparer l’avant / après sur cet appareil.',
  curseur: 'Position du curseur avant / après',
  fermer: 'Fermer',
  // Conseil d'export
  conseil1440: `Conseil${NB}: exporte en 1440p. YouTube compresse beaucoup moins une vidéo envoyée en 1440p, même si ta capture est en 720p.`,
  passer1440: 'Passer en 1440p',
  en1440: 'Export en 2560 × 1440 (16 Mb/s) : YouTube garde plus de détails.',
  revenir1080: 'Revenir en 1080p',
  vertical: 'En vertical, l’export reste en 1080 × 1920 : c’est le maximum de TikTok et des Shorts.',
  // Aide OBS
  obs: {
    titre: 'Bien enregistrer avec OBS',
    lignes: [
      'Enregistre en 1080p (Réglages → Vidéo → Résolution de sortie 1920 × 1080).',
      'Qualité : CQP ou CRF 18 à 20, ou au moins 12 Mb/s (OBS en 4,5 Mb/s, c’est trop peu pour un jeu).',
      '60 images par seconde.',
      'Une bonne capture vaut mieux que toute amélioration : Arko aura moins à corriger.',
    ],
  },
};
