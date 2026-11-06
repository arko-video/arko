// Textes de « Mes sons » (sons gardés pour tous les projets, import de plusieurs sons, Partager → Arko),
// en français (tutoiement). Réunis dans T (src/textes-fr.ts) sous T.messons.

const NBSP = ' ';

/** Le rappel court sur les sons importés (Mes sons, et réception d'un partage). */
export const RAPPEL_RESPONSABILITE =
  'Les sons que tu importes sont sous ta responsabilité : un son protégé peut faire couper le son de ta vidéo sur TikTok.';

export const TEXTES_MES_SONS = {
  messons: {
    titre: 'Mes sons',
    intro: 'Tes sons, gardés sur ce téléphone pour tous tes montages.',
    vide: 'Aucun son gardé pour l\'instant.',
    importer: 'Importer des sons',
    etiquette: 'Étiquette',
    etiquetteDefaut: 'Memes',
    chercher: 'Chercher dans Mes sons',
    chercherIndice: 'Chercher un son…',
    resultats: (n: number) => (n === 0 ? 'Aucun son trouvé.' : n === 1 ? '1 son' : `${n} sons`),
    import: (fait: number, total: number) => `J'importe tes sons… ${fait}${NBSP}/${NBSP}${total}`,
    bilan: (n: number, deja: number, refuses: number) =>
      [
        n === 0 ? 'Aucun nouveau son gardé.' : n === 1 ? '1 son gardé dans Mes sons.' : `${n} sons gardés dans Mes sons.`,
        deja > 0 ? `${deja} déjà là.` : '',
        refuses > 0 ? `${refuses} ignoré${refuses > 1 ? 's' : ''} (pas un son lisible).` : '',
      ]
        .filter(Boolean)
        .join(' '),
    modifier: (nom: string) => `Modifier « ${nom} »`,
    nom: 'Nom',
    enregistrer: 'Enregistrer',
    supprimer: 'Supprimer',
    supprimerTitre: (nom: string) => `Supprimer « ${nom} » de Mes sons ?`,
    supprimerTexte: 'Les montages qui l\'utilisent déjà le gardent.',
    supprime: (nom: string) => `« ${nom} » est supprimé de Mes sons.`,
    garder: 'Garder dans Mes sons',
    garderNom: (nom: string) => `Garder « ${nom} » dans Mes sons`,
    garde: (nom: string) => `« ${nom} » est gardé dans Mes sons pour tous tes montages.`,
    dejaGarde: (nom: string) => `« ${nom} » est déjà dans Mes sons.`,
    introuvable: 'Ce son n\'est plus sur l\'appareil.',
    rappel: RAPPEL_RESPONSABILITE,
    trouver: 'Trouver des sons sur MyInstants',
    nouvelOnglet: '(s\'ouvre dans un nouvel onglet)',
    aide: [
      'Touche le bouton de téléchargement sous un son.',
      'Reviens ici et touche « Importer des sons » (tu peux en choisir plusieurs d\'un coup).',
      'Ils restent dans Mes sons pour tous tes projets.',
    ],
  },
  partage: {
    titre: (n: number) => (n === 1 ? '1 son reçu' : `${n} sons reçus`),
    question: 'Les garder dans Mes sons ?',
    garder: 'Les garder',
    non: 'Non merci',
    aucun: 'Aucun son n\'est arrivé. Réessaie de partager le fichier vers Arko.',
  },
};
