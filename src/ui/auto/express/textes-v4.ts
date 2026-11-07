// Textes du Best-of v4 (dev-ui, vague 2) : réglages déjà bons, accord pour le module sous-titres, analyse par étapes,
// revue « tout modifiable », montage, et retouches dans Habiller. Français simple, phrases courtes, tutoiement.
// Fichier de dev-ui (src/ui/auto/express/) : l'intégrateur peut le réunir dans TV (src/textes-v3.ts) s'il le veut.

const NBSP = ' ';

export const TEXTES_V4 = {
  // ---------------------------------------------------------------- Réglages
  pretTitre: 'Tout est prêt',
  pretAide: 'Les réglages sont déjà bons. Touche « Analyser ma vidéo ». Tu pourras tout changer sur la revue.',
  /** Ce qu'Arko va faire (petites pastilles sous « Tout est prêt »). */
  fait: {
    duree: (d: string) => `${d} de vidéo`,
    coupes: (niveau: string) => `Coupes${NBSP}: ${niveau}`,
    musique: 'Musique de fond',
    sansMusique: 'Sans musique',
    persos: 'Un perso par voix',
    sousTitres: 'Punchlines et sous-titres',
    sansTextes: 'Sans punchlines',
    accroche: 'Accroche de 6 s',
  },
  changerReglages: 'Changer les réglages',
  coupeAide: {
    serre: 'Très rythmé : on garde juste les mots.',
    normal: 'Conseillé : comme un montage fait à la main.',
    large: 'Plus de respiration entre les phrases.',
  },
  transcrireManque: (taille: string) => `Arko te proposera le module sous-titres (${taille}, une seule fois).`,

  // ---------------------------------------------------------------- Carte d'accord (module sous-titres)
  carte: {
    titre: 'Un module à télécharger',
    texte: (taille: string) =>
      `Pour les punchlines et les sous-titres, Arko utilise son module sous-titres (${taille}). Tu le télécharges une seule fois. Ensuite, il marche sans internet.`,
    rienEnvoye: 'Tout reste sur ton appareil. Rien n\'est envoyé.',
    telecharger: (taille: string) => `Télécharger (${taille})`,
    pasMaintenant: 'Pas maintenant',
    pasMaintenantAide: 'Sans lui : pas de punchlines ni de sous-titres. Le reste marche.',
    telechargement: 'Je télécharge le module sous-titres…',
    garderOuvert: 'Garde Arko ouvert pendant le téléchargement.',
    arreter: 'Arrêter',
    horsLigneTitre: 'Pas de connexion',
    horsLigne: 'Le module sous-titres n\'est pas encore sur ton appareil. Sans internet, je fais le Best-of sans lui : pas de punchlines ni de sous-titres.',
    continuerSans: 'Continuer sans',
    erreurTitre: 'Téléchargement raté',
    erreur: 'Le téléchargement n\'a pas marché. Vérifie ta connexion et réessaie.',
    reessayer: 'Réessayer',
  },

  // ---------------------------------------------------------------- Analyse
  analyse: {
    etapes: ['J\'écoute le son', 'Je repère qui parle', 'J\'écris les mots', 'Je choisis les moments'] as const,
    sansMots: 'sans sous-titres',
    fait: 'fait',
    enCours: 'en cours',
    /**
     * Relecture point 4 : rien ne reprend TOUT SEUL. Ce qui est vrai : les sous-titres sont gardés par tranche de
     * 5 min (et les mesures du son une fois finies) ; relancer l'analyse de la même vidéo repart de là.
     */
    fermer: 'Garde Arko ouvert, écran allumé. Si tu le fermes, relance l\'analyse de cette vidéo : les sous-titres déjà écrits sont gardés.',
    erreur: 'Oups, l\'analyse a planté. Ce qui est fini est gardé. Réessaie.',
    annulee: 'Analyse arrêtée. Ce qui est fini est gardé.',
  },

  // ---------------------------------------------------------------- Revue
  revue: {
    aide: 'Arko a choisi les meilleurs moments. Touche « Monter la vidéo », ou change ce que tu veux.',
    total: (d: string) => `Durée du montage${NBSP}: ${d}`,
    accrocheComprise: 'accroche comprise',
    dureeVisee: 'Durée visée',
    rechoisies: (d: string) => `Séquences choisies à nouveau pour ${d}.`,
    note: (centile: number) => `Note${NBSP}: ${Math.round(centile)} sur 100`,
    ecouter: 'Écouter',
    arreter: 'Arrêter',
    regler: 'Régler',
    fermerReglage: 'Fini',
    debut: 'Début',
    fin: 'Fin',
    debutAvant: 'Une phrase de plus avant',
    debutApres: 'Une phrase de moins avant',
    finApres: 'Une phrase de plus après',
    finAvant: 'Une phrase de moins après',
    plus: '+ 1 phrase',
    moins: '− 1 phrase',
    reglageImpossible: 'Je ne peux pas aller plus loin de ce côté.',
    sequence: (de: string, a: string, d: string) => `${de} → ${a} · ${d} gardées`,
    // Voix
    combien: `Combien de personnes parlent${NBSP}?`,
    combienAide: 'Si Arko s\'est trompé, change ici. Je refais le tri tout de suite.',
    une: 'Une seule',
    deux: 'Deux',
    trois: 'Trois ou plus',
    voixRefaites: (n: number) => (n === 1 ? 'Une seule voix : un seul perso. Les séquences sont choisies à nouveau.' : 'Deux voix séparées. Les séquences sont choisies à nouveau.'),
    pasDeMesures: 'Relance l\'analyse pour changer les voix.',
    phraseApres: `Une phrase donnée à la mauvaise personne${NBSP}? Après le montage : Habiller → Avatars → « Qui parle${NBSP}? », touche la phrase.`,
    // Empreinte de voix (28 Mo, facultative)
    empreinte: {
      memeNiveau: 'Je n\'entends qu\'une voix. Si vous êtes plusieurs au même volume, je peux vous séparer avec l\'empreinte de voix (28 Mo, une fois).',
      ambigus: 'J\'hésite sur qui parle dans beaucoup de phrases. L\'empreinte de voix peut m\'aider (28 Mo, une fois).',
      oui: 'Séparer les voix (28 Mo)',
      non: 'Non merci',
      telechargement: 'Je télécharge l\'empreinte de voix…',
      calcul: 'J\'écoute les voix de plus près…',
      faite: 'Voix séparées avec l\'empreinte.',
      /** L'empreinte n'a trouvé qu'une voix (QA : avant, « Voix séparées » s'affichait quand même). */
      uneSeule: 'Même avec l\'empreinte, je n\'entends qu\'une voix. Si vous êtes deux, touche « Deux » plus haut.',
      erreur: 'L\'empreinte de voix n\'a pas marché. Les voix restent comme avant.',
      horsLigne: 'Pas de connexion : l\'empreinte de voix ne peut pas se télécharger.',
    },
    // Modules qui manquent
    sansTextes: 'Sans le module sous-titres : pas de punchlines ni de sous-titres.',
    sansTextesBouton: 'Le télécharger et refaire l\'analyse',
    sansPrecision: 'Coupes et voix moins précises (sans le détecteur de voix).',
    refaire: 'Refaire l\'analyse',
  },

  // ---------------------------------------------------------------- Montage
  montage: {
    enCours: 'Je monte ta vidéo…',
    musique: 'Je prépare la musique…',
    rien: 'Rien à monter : coche au moins une séquence.',
    erreur: 'Oups, le montage n\'a pas marché. Ta revue est gardée : réessaie.',
  },

  // ---------------------------------------------------------------- Habiller
  habiller: {
    recoupe: 'Rythme des coupes',
    recoupeAide: 'Change le rythme de tout le montage, d\'un toucher. Arko recoupe sans réécouter la vidéo.',
    recoupeFaite: (niveau: string) => `Coupes « ${niveau} » appliquées. Tu peux annuler.`,
    recoupeImpossible: 'Je n\'ai plus les mesures de cette vidéo. Utilise « Couper les blancs ».',
    emotion: 'Émotion',
    emotionAuto: 'Auto',
  },
  /** Habiller → Couper : les séquences du montage (une par chapitre). */
  sequences: {
    titre: 'Séquences',
    aide: 'Change l\'ordre, retire une séquence ou ajoute un peu de contexte. Chaque geste s\'annule.',
    monter: (nom: string) => `Monter « ${nom} »`,
    descendre: (nom: string) => `Descendre « ${nom} »`,
    retirer: 'Retirer',
    retiree: (nom: string) => `« ${nom} » retirée. Elle est dans « Passages pas retenus ».`,
    debut: 'Début',
    fin: 'Fin',
    plus: '+ contexte',
    moins: '− un bout',
    plusAide: (cote: string, nom: string) => `Ajouter un bout avant ou après (${cote}) de « ${nom} »`,
    moinsAide: (cote: string, nom: string) => `Retirer un bout (${cote}) de « ${nom} »`,
    rienAAjouter: 'Rien de plus à ajouter ici.',
    sansMesures: 'Je n\'ai plus les mesures de cette vidéo : je ne peux pas couper ce bout proprement.',
  },
} as const;
