// Textes de l'interface pour le choix TikTok / YouTube et pour les outils YouTube (en français simple).
// Ce qui dépend de la destination passe par textesPour(d) : les écrans communs parlent de la bonne plateforme.

import type { Destination } from './recette/destination';

export const TY = {
  depart: {
    titre: 'Tu montes pour où ?',
    intro: 'Choisis ta plateforme. Tu pourras changer à tout moment depuis l\'accueil.',
    tiktok: 'TikTok',
    tiktokAide: 'Clip vertical 9:16',
    youtube: 'YouTube',
    youtubeAide: 'Vidéo 16:9 ou Short',
    quelFormat: 'Quel format sur YouTube ?',
    video: 'Vidéo (16:9)',
    videoAide: 'Horizontale, avec chapitres, miniature et intro / outro',
    short: 'Short (vertical)',
    shortAide: '9:16, 3 min au plus',
    retour: 'Retour',
  },
  noms: { tiktok: 'TikTok', youtube: 'YouTube 16:9', short: 'YouTube Short' } as Record<Destination, string>,
  pour: (nom: string) => `Pour : ${nom}`,
  changer: 'Changer',
  changerAide: 'Changer de plateforme (pour les prochains montages)',

  cadrage: {
    nom: 'Cadrage',
    titre: 'Cadre ta vidéo en 16:9',
    plein: 'Plein 16:9',
    ajuste: 'Ajustée + fond flou',
    aidePlein: "Fais glisser l'image pour garder l'action.",
    dejaAuFormat: 'Ta vidéo est déjà en 16:9, on passe direct à la suite.',
  },

  chapitres: {
    outil: 'Chapitres',
    titre: 'Chapitres YouTube',
    aide: 'Pose un chapitre là où une partie commence. Le premier commence toujours à 0:00.',
    ajouter: '+ Chapitre ici',
    nomParDefaut: (n: number) => (n === 1 ? 'Intro' : `Partie ${n}`),
    nom: (t: string) => `Nom du chapitre à ${t}`,
    supprimer: (nom: string) => `Supprimer le chapitre « ${nom} »`,
    copier: 'Copier les chapitres',
    copie: 'Chapitres copiés : colle-les dans la description YouTube.',
    copieManuelle: 'Copie le texte sélectionné (appui long → Copier).',
    regles: 'Règles de YouTube : 1er chapitre à 0:00, au moins 3 chapitres, 10 s chacun au moins.',
    ok: 'Les chapitres respectent les règles de YouTube.',
    vide: 'Aucun chapitre pour l\'instant.',
    texte: 'Texte pour la description',
  },

  generiques: {
    outil: 'Intro / outro',
    titre: 'Intro et outro',
    intro: 'Intro',
    outro: 'Outro (écran de fin)',
    aucune: 'Aucune',
    modeles: { abonne: 'Abonne-toi', neon: 'Néon', ecranFin: 'Écran de fin' } as Record<string, string>,
    maVideo: 'Ma vidéo…',
    chaine: 'Nom de ta chaîne',
    texte: 'Texte',
    duree: (s: number) => `Durée : ${s} s`,
    garder: 'Garder pour mes prochains montages',
    garde: 'Gardé dans Mes génériques.',
    mesGeneriques: 'Mes génériques',
    supprimer: (nom: string) => `Supprimer « ${nom} »`,
    aideOutro: 'YouTube laisse poser des vidéos et un bouton d\'abonnement sur les 5 à 20 dernières secondes.',
    tropCourte: 'Ta vidéo fait moins de 25 s : YouTube n\'y permet pas d\'écran de fin.',
    exporte: 'L\'intro et l\'outro sont au début et à la fin de la frise : touche-les pour les voir dans l\'aperçu, comme dans la vidéo exportée.',
    importe: (nom: string) => `« ${nom} » ajoutée.`,
    retirer: (nom: string) => `Retirer l'${nom.toLowerCase()} (Annuler la remet)`,
    introuvable: 'La vidéo de ton intro ou outro n\'est plus sur l\'appareil : elle est retirée.',
  },

  miniature: {
    bouton: 'Faire la miniature',
    titre: 'Miniature',
    image: 'Image de la vidéo',
    texte: 'Gros texte',
    texteParDefaut: 'INCROYABLE',
    style: 'Style',
    position: 'Place du texte',
    haut: 'En haut',
    bas: 'En bas',
    emoji: 'Émoji',
    fleche: 'Flèche',
    aucun: 'Aucun',
    gauche: 'Vers la gauche',
    droite: 'Vers la droite',
    exporterJpeg: 'Enregistrer en JPEG',
    exporterPng: 'Enregistrer en PNG',
    prete: (taille: string, l: number, h: number) => `Miniature prête : ${l} × ${h}, ${taille}.`,
    regle: 'YouTube (téléphone) : 2 Mo au plus. Format 16:9, 1280 × 720.',
    regleShort: 'Short : image verticale 9:16, 2 Mo au plus.',
    fermer: 'Fermer',
  },

  exporter: {
    qualite169: '1920 × 1080, 30 images/s, MP4 (8 Mb/s, conseillé par YouTube)',
    haute: 'Qualité 1440p (2560 × 1440, 16 Mb/s)',
    hauteAide: 'Ta vidéo d\'origine est assez grande pour le 1440p.',
    qualiteShort: '1080 × 1920, 30 images/s, MP4 (Short)',
    shortTropLong: (d: string) => `Ta vidéo dure ${d} : un Short dure 3 min au plus. Au-delà, YouTube la publie comme une vidéo normale.`,
    avecGeneriques: (d: string) => `Intro et outro comprises (${d}).`,
    astuceYoutube: 'Sur YouTube : ajoute la miniature, colle les chapitres dans la description et pose l\'écran de fin dans YouTube Studio.',
    astuceShort: 'Sur YouTube : publie en Short, avec un titre court et #Shorts dans la description.',
  },

  monteur: {
    compiler: 'Faire une compilation 16:9',
    compilerAide: 'Met tous les clips gardés bout à bout dans UNE vidéo YouTube.',
    compilation: 'Compilation',
    compilationFaite: (n: number) => `Compilation de ${n} clips créée dans Mes montages.`,
    rien: 'Garde au moins un clip pour faire une compilation.',
  },
};

/** Textes qui changent selon la plateforme. */
export function textesPour(d: Destination) {
  const yt = d !== 'tiktok';
  return {
    zoneSureAide: yt ? (d === 'short' ? 'En orange : ce que le lecteur des Shorts va cacher' : 'En orange : ce que le lecteur YouTube va cacher') : 'En orange : ce que TikTok va cacher',
    nomEtape3: d === 'youtube' ? TY.cadrage.nom : 'Vertical',
  };
}
