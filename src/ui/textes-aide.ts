// Textes de l'aide (phase 5) : écran Aide, conseils du premier lancement. Réunis dans T (T.aide.…).

export const TEXTES_AIDE = {
  aide: {
    ouvrir: 'Aide',
    titre: 'Comment ça marche',
    intro: 'Un clip TikTok en 4 étapes, sur ton téléphone. Rien n’est envoyé en ligne.',
    cartes: [
      {
        titre: 'Couper',
        texte:
          'Garde le meilleur passage. Glisse les poignées, ou Scinder pour couper au milieu. Vise 15 à 30 s.',
      },
      { titre: 'Vertical', texte: 'Passe en 9:16 : fond flou, plein écran recadré, ou jeu + webcam.' },
      {
        titre: 'Habiller',
        texte: 'Accroche, sous-titres, sons, transitions et zooms. Un Combo fait tout d’un coup.',
      },
      {
        titre: 'Exporter',
        texte: 'Le MP4 est créé sur ton téléphone. Partage-le sur TikTok, un clip à la fois.',
      },
      {
        titre: 'Monteur IA',
        texte:
          'Pour une vidéo de plus de 5 min : Arko trouve tes meilleurs moments et prépare plusieurs clips. Tu gardes ou tu jettes.',
      },
    ],
    code: 'Code source et licence',
    codeAide: 'Arko est gratuit et open source (licence MIT).',
    nouvelOnglet: '(s’ouvre dans un nouvel onglet)',

    conseils: 'Conseils pour bien démarrer',
    conseil: (i: number, n: number) => `Conseil ${i} sur ${n}`,
    liste: [
      {
        titre: 'L’action d’abord',
        texte: 'Les 3 premières secondes décident de tout : commence direct sur le moment fort.',
      },
      {
        titre: 'Habille en un toucher',
        texte: 'Un Combo ajoute d’un coup l’accroche, le son et le zoom au bon moment.',
      },
      {
        titre: 'Tout reste chez toi',
        texte: 'Ta vidéo ne quitte jamais ton téléphone. Tes montages t’attendent dans Mes montages.',
      },
    ],
    passer: 'Passer',
    suivant: 'Suivant',
    cestParti: 'C’est parti',
  },
};
