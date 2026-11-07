// Textes de la v3 « Insertion » (dev 2) : insérer un élément entre deux parties (B), pistes audio et gros mots (E).
// Réunis dans TV par src/textes-v3.ts : TV.insertion.…

const NBSP = ' ';

export const TEXTES_INSERTION = {
  bouton: 'Insérer ici',
  titre: `Insérer quoi${NBSP}?`,
  aide: "Le plan est coupé à la tête de lecture et l'élément se place entre les deux. La suite se décale.",
  types: {
    clip: 'Une vidéo',
    meme: 'Un mème',
    image: 'Une image',
    carton: 'Un carton texte',
    chibi: 'Un perso',
  },
  aidesTypes: {
    clip: 'Un autre clip, avec son son',
    meme: 'Un mème de Ma bibliothèque',
    image: 'Une image fixe (PNG, JPEG, WebP)',
    carton: 'Fond uni et texte (« Plus tard… »)',
    chibi: 'Perso plein écran',
  },
  /** Étiquettes courtes sur les frises. */
  etiquettes: { clip: 'Vidéo', image: 'Image', carton: 'Carton', chibi: 'Perso' },
  depuisFichier: 'Depuis mes fichiers',
  depuisBibliotheque: 'Depuis Ma bibliothèque',
  aucunClip:
    "Ma bibliothèque n'a pas encore de vidéo. Choisis un fichier, ou importe tes clips dans Ma bibliothèque.",
  aucunMeme: "Ma bibliothèque n'a pas encore de mème. Importe-les dans Ma bibliothèque → Mèmes.",
  gardeDansMemes: 'La vidéo est gardée dans Ma bibliothèque → Mèmes pour rouvrir ton montage plus tard.',
  ouverture: "J'ouvre la vidéo…",
  debut: 'Début (s)',
  fin: 'Fin (s)',
  choisirImage: 'Choisir une image',
  duree: 'Durée (s)',
  texte: 'Texte',
  textePlaceholder: 'Plus tard…',
  texteChibi: 'Texte (facultatif)',
  fond: 'Fond',
  couleur: 'Couleur du texte',
  emotion: 'Émotion',
  personne: 'Le perso de',
  autreChibi: 'Un autre perso',
  sansChibi: "Personne n'a encore de perso : en voici un au hasard. « Un autre perso » en tire un nouveau.",
  inserer: 'Insérer',
  retour: 'Retour',
  deplacer: 'Déplacer ici',
  deplacerAide: 'Mets la tête de lecture où tu veux, puis touche « Déplacer ici ».',
  retirer: 'Retirer',
  /** Titre du panneau et message, accordés (une vidéo insérée, un carton inséré). */
  inseres: { clip: 'Vidéo insérée', image: 'Image insérée', carton: 'Carton inséré', chibi: 'Perso inséré' },
  retire: 'Élément retiré, la suite est recollée.',
  deplace: 'Élément déplacé.',
  impossible: "Impossible d'insérer ici.",
  imageIllisible: "Cette image ne s'ouvre pas. Choisis un PNG, un JPEG ou un WebP.",
  imageAbsente: (nom: string) =>
    `L'image « ${nom} » n'est plus sur l'appareil${NBSP}: elle est retirée du montage.`,
  pistes: {
    titre: (n: number) => `Cette vidéo a ${n} pistes de son`,
    aide: 'OBS peut enregistrer ton micro et Discord à part. Choisis ce que tu gardes.',
    piste: (n: number, nom: string | null) => (nom ? `Piste ${n} (${nom})` : `Piste ${n}`),
    illisible: 'Ton navigateur ne sait pas lire cette piste.',
    volume: 'Volume',
    garder: 'Garder',
    toutes: 'Garder toutes les pistes',
    principale: 'Seulement la piste principale',
    valider: 'Valider',
    aucune: 'Garde au moins une piste.',
    choisies: (n: number) => (n > 1 ? `${n} pistes mélangées.` : 'Une seule piste gardée.'),
    lecture: 'Je lis les pistes…',
    reglage: 'Pistes de son',
  },
  bips: {
    titre: 'Gros mots',
    aucun: 'Laisser',
    bip: 'Bip',
    muet: 'Silence',
    aide: 'Sur les jurons des sous-titres.',
    sansMots: "Lance d'abord les sous-titres : les gros mots sont trouvés dans leurs mots.",
    combien: (n: number) =>
      n > 1 ? `${n} gros mots trouvés.` : n === 1 ? '1 gros mot trouvé.' : 'Aucun gros mot trouvé.',
  },
} as const;
