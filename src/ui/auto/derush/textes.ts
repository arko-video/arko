// Textes de la v3 « Monteur et derush » (dev 1) : titres retirables (A) et passages pas retenus (C).
// Réunis dans TV par src/textes-v3.ts : TV.derush.… Tutoiement, phrases courtes, espace insécable avant « ? ! : ».

const NBSP = ' ';

export const TEXTES_DERUSH = {
  titres: {
    reglage: 'Mettre un titre sur les clips',
    reglageAide: 'Le texte du début (« ATTENDS… », accroche). Tu pourras le changer ou le retirer.',
    modifier: 'Changer le titre',
    retirer: 'Retirer le titre',
    retire: 'Titre retiré.',
    placeholder: 'Ton titre',
    aucun: 'Sans titre',
    valider: 'Valider',
  },
  passages: {
    bouton: 'Passages pas retenus',
    titre: 'Passages pas retenus',
    aide: 'Les moments notés par Arko mais pas gardés, du plus prometteur au moins prometteur.',
    vide: 'Aucun passage de côté.',
    ecouter: 'Écouter',
    arreter: 'Arrêter',
    ajouter: 'Ajouter',
    ajoute: (titre: string) => `« ${titre} » est ajouté au montage.`,
    note: (n: number) => `Note${NBSP}: ${n}/100`,
    plage: (de: string, a: string) => `de ${de} à ${a}`,
    pasDeVideo: 'La vidéo de ce passage n\'est pas ouverte.',
    dejaLa: 'Ce passage est déjà dans le montage.',
  },
} as const;
