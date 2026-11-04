// Textes de la phase 4 (vitesse, arrêt sur image, combos, modèles, rythme, mes montages), en français (tutoiement).
// Réunis dans T par src/textes-fr.ts : on écrit toujours T.plan.…, T.combos.…, T.montages.…, etc.

const NBSP = ' ';
const virgule = (x: number) => String(x).replace('.', ',');

export const TEXTES_RYTHME = {
  plan: {
    titre: (n: number) => `Plan ${n}`,
    vitesse: 'Vitesse',
    vitesseValeur: (v: number) => `×${virgule(v)}`,
    grave: `Au ralenti, le son devient plus grave.`,
    arret: 'Arrêt sur image',
    arretAide: 'La dernière image du plan reste figée, sans son.',
    aucun: 'Aucun',
    secondes: (s: number) => `${virgule(s)}${NBSP}s`,
    fige: (s: string) => `Arrêt sur image de ${s}`,
  },

  combos: {
    titre: 'Combos',
    aide: 'Lance la lecture et touche un combo au bon moment.',
    ecoute: 'J’écoute ta vidéo…',
    pret: 'Prêt : je cale le combo sur le son le plus proche.',
    noms: { boom: 'Boom', fige: 'Figé', rate: 'Raté' },
    phrases: {
      boom: 'Zoom + boum au bon moment',
      fige: 'Arrêt sur image + scratch',
      rate: 'Ralenti + trombone',
    },
    ajoute: (nom: string) => `${nom} ajouté${NBSP}!`,
    rien: 'Rien à ajouter ici.',
  },

  modeles: {
    titre: 'Modèles',
    aide: 'Un modèle monte ton clip en un toucher. Tu peux toujours annuler.',
    top3: 'Top 3',
    top3Phrase: 'Tes 3 derniers passages deviennent #3, #2, #1, avec zooms et boums.',
    top3Impossible: 'Il faut au moins 3 passages : coupe ta vidéo dans Couper.',
    meilleur: 'Le meilleur d’abord',
    meilleurPhrase: 'Je copie 1,5 s de ton meilleur moment au tout début, avec « ATTENDS… ».',
    depuisTete: (t: string) => `Depuis la tête de lecture (${t})`,
    trouver: 'Trouver le meilleur moment',
    appliquer: 'Appliquer',
    applique: (nom: string) => `${nom} appliqué${NBSP}!`,
    pasDePic: 'Je n’ai pas trouvé de moment fort : place la tête de lecture.',
  },

  rythme: {
    repere: (message: string) => `Passage qui traîne : ${message}`,
    accroche: 'Conseil pour ton accroche',
  },

  montages: {
    titre: 'Mes montages',
    nouveau: 'Nouveau montage',
    dernier: 'Ton dernier montage',
    enCours: 'En cours',
    continuer: 'Continuer',
    ouvrir: (titre: string) => `Ouvrir « ${titre} »`,
    actions: (titre: string) => `Actions pour « ${titre} »`,
    rechoisirAide: (nom: string) => `Pour l’ouvrir, choisis à nouveau « ${nom} ».`,
    illisible: 'Ce montage est illisible.',
    renommer: 'Renommer',
    dupliquer: 'Dupliquer',
    supprimer: 'Supprimer',
    fermer: 'Fermer',
    nouveauTitre: 'Nouveau titre',
    valider: 'Valider',
    duplique: (titre: string) => `Copie de « ${titre} » créée.`,
    supprimerTitre: (titre: string) => `Supprimer « ${titre} » ?`,
    supprimerTexte: 'Ce montage sera effacé pour de bon. Ta vidéo, elle, reste sur ton téléphone.',
    garder: 'Garder',
    supprime: 'Montage supprimé.',
    instant: 'à l’instant',
    minutes: (n: number) => `il y a ${n}${NBSP}min`,
    heures: (n: number) => `il y a ${n}${NBSP}h`,
    hier: 'hier',
    jours: (n: number) => `il y a ${n}${NBSP}j`,
  },
} as const;
