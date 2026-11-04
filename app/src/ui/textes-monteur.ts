// Textes de la phase 6 (monteur IA : choix, Demande, Analyse, Revue), en français (tutoiement).
// Réunis dans T par src/textes-fr.ts : on écrit toujours T.monteur.…

const NBSP = ' ';

export const TEXTES_MONTEUR = {
  monteur: {
    nom: 'Monteur IA',
    etape: (n: number, nom: string) => `Étape ${n} sur 3 · ${nom}`,
    etapes: ['Réglages', 'Analyse', 'Revue'] as const,

    // Entrée (Importer)
    choixTitre: (duree: string) => `Ta vidéo dure ${duree}. On fait comment${NBSP}?`,
    moiMeme: 'Je monte moi-même',
    moiMemeAide: 'Tu choisis le passage à garder.',
    ia: 'Monteur IA',
    iaAide: 'Trouve tes meilleurs moments et prépare plusieurs TikToks.',
    autreVideo: 'Choisir une autre vidéo',

    // Demande
    demandeTitre: 'Ce que tu veux',
    demandeIntro: 'Règle tout, lance, puis reviens trier tes clips.',
    nombre: 'Nombre de clips',
    clips: (n: number) => `${n} clip${n > 1 ? 's' : ''}`,
    moins: 'Un clip de moins',
    plus: 'Un clip de plus',
    duree: 'Durée visée',
    durees: { court: `15 à 25${NBSP}s`, long: `25 à 45${NBSP}s` },
    consigne: 'Ta consigne (facultatif)',
    consigneExemple: 'Ex. : que des clutchs',
    transcrire: 'Transcrire les voix',
    transcrireAide: 'Sous-titres et meilleures accroches. Plus long.',
    moduleManque: 'Pourquoi je ne peux pas cocher ?',
    moduleExplication: (taille: string) =>
      `Il faut d'abord télécharger le module sous-titres (environ ${taille}). Ouvre un montage, outil Sous-titres, puis « Créer les sous-titres ». Ensuite, reviens ici.`,
    mode: 'Mode',
    sansIA: 'Sans IA',
    sansIAAide: 'Gratuit. Rien n’est envoyé.',
    avecIA: 'Avec l’IA',
    avecIAAide: 'Avec ta clé API. Des clips plus variés.',
    lancer: 'Lancer',
    repriseDispo: (p: number) => `Ta dernière analyse s’est arrêtée à ${p}${NBSP}%.`,
    reprendreAnalyse: 'Reprendre l’analyse',
    revueEnCours: (n: number) => `Tu as encore ${n} clip${n > 1 ? 's' : ''} à trier.`,

    // Réglages de l'IA
    fournisseur: 'Fournisseur',
    modele: 'Modèle',
    conseille: (m: string) => `${m} (conseillé)`,
    cle: 'Ta clé API',
    clePlaceholder: 'Colle ta clé ici',
    cleGardee: (masque: string) => `Clé gardée : ${masque}`,
    cleRassure: 'Ta clé reste sur ton téléphone. Elle n’est envoyée qu’à ce fournisseur.',
    tester: 'Tester ma clé',
    test: 'Je teste ta clé…',
    cleOk: (n: number) => `Clé acceptée. ${n} modèle${n > 1 ? 's' : ''} disponible${n > 1 ? 's' : ''}.`,
    oublier: 'Oublier ma clé',
    cleOubliee: 'Clé oubliée sur ce téléphone.',
    cleMemoire: 'Ta clé ne peut pas être gardée ici : elle sera oubliée en fermant Arko.',
    cleManque: 'Colle d’abord ta clé API, ou passe en mode Sans IA.',
    cout: (phrase: string) => `Coût estimé : ${phrase}.`,
    voirEnvoi: 'Voir ce qui est envoyé',
    envoiTitre: 'Ce qui est envoyé',
    envoiAide: 'Aucune image ni vidéo n’est envoyée : seulement ce texte, avec le résumé des moments.',
    envoiAvant: 'Après l’analyse, les moments trouvés remplaceront les lignes d’exemple ci-dessous.',
    envoiDeux: 'Au-delà de 15 clips, une 2e demande semblable part ensuite.',
    fermer: 'Fermer',

    // Analyse
    analyseTitre: 'Je cherche tes meilleurs moments',
    analyseFinie: 'Tes clips sont prêts',
    momentsTitre: 'Tes meilleurs moments',
    arreteeA: (p: number) => `Arrêtée à ${p}${NBSP}%`,
    ecoule: (t: string) => `Temps écoulé : ${t}`,
    demarrage: 'Je démarre l’analyse…',
    garderOuvert: 'Garde Arko ouvert : l’écran reste allumé.',
    annuler: 'Annuler',
    interrompue: 'Analyse arrêtée',
    interrompueAide: 'Rien n’est perdu : elle repartira du dernier point gardé.',
    retourReglages: 'Changer les réglages',
    erreurAnalyse: 'L’analyse n’a pas pu aller au bout',
    envoiIA: (f: string) => `J’envoie le résumé à ${f}…`,
    envoiIAAide: 'Seulement le texte des moments. Ça prend souvent moins d’une minute.',
    erreurIA: 'L’IA n’a pas pu proposer de clips',
    passerSansIA: 'Continuer sans IA',
    reessayer: 'Réessayer',
    enCoursRetour: 'L’analyse continue. Touche Annuler pour l’arrêter.',
    moments: (n: number) => `${n} moment${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''}`,
    aucunMoment: 'Je n’ai trouvé aucun moment fort. Essaie une vidéo avec plus d’action.',
    reprisA: (t: string) => `Analyse reprise à ${t} de ta vidéo.`,
    clipsPrets: (n: number) => `Voir mes ${n} clip${n > 1 ? 's' : ''}`,
    coupee: (n: number, total: number) =>
      `La réponse de l’IA était coupée : ${n} clip${n > 1 ? 's' : ''} sur ${total} récupéré${n > 1 ? 's' : ''}.`,
    coupeeAide: 'Relance avec moins de clips pour avoir les autres.',
    corrections: (n: number) =>
      `${n} correction${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''} sur les propositions de l’IA.`,
    a: (t: string) => `à ${t}`,

    // Revue
    revueTitre: 'Garde ou jette',
    compteur: (i: number, n: number) => `${i} / ${n}`,
    garder: 'Garder',
    jeter: 'Jeter',
    aide: 'Balaie à droite pour garder, à gauche pour jeter.',
    raisonParDefaut: 'Un moment fort de ta vidéo.',
    plage: (de: string, a: string) => `De ${de} à ${a} de ta vidéo`,
    garde: 'Gardé',
    jete: 'Jeté',
    finTitre: (n: number) =>
      n === 0
        ? 'Aucun clip gardé'
        : `${n} clip${n > 1 ? 's' : ''} gardé${n > 1 ? 's' : ''} dans Mes montages`,
    finAide: 'Retouche-les et exporte-les un par un, quand tu veux.',
    finAucun: 'Relance avec une autre consigne, ou monte toi-même.',
    voirMontages: 'Voir Mes montages',
    retoucher: 'Retoucher le 1er',
    accueil: 'Retour à l’accueil',
    reprendreRevue: (n: number) =>
      `Reprendre ma revue (${n} clip${n > 1 ? 's' : ''} restant${n > 1 ? 's' : ''})`,
    reprendreAide: (nom: string) => `Choisis à nouveau « ${nom} » pour revoir tes clips.`,
    oublierRevue: 'Oublier ces clips',
    revueOubliee: 'Clips oubliés.',
  },
};
