// Textes de l'outil « Couper » de Habiller, en français (tutoiement).
// Réunis dans T par src/textes-fr.ts : on écrit toujours T.coupe.…

export const TEXTES_COUPE = {
  coupe: {
    outil: 'Couper',
    titre: 'Couper',
    scinder: 'Scinder ici',
    supprimer: 'Supprimer',
    debut: 'Début ici',
    fin: 'Fin ici',
    actions: 'Actions de coupe',
    plan: (n: number, total: number, duree: string) => `Plan ${n} sur ${total} · ${duree}`,
    planCourt: (n: number, duree: string) => `Plan ${n}, ${duree}`,
    dureeFinale: (d: string) => `Durée finale : ${d}`,
    aide: 'Touche un plan sur la frise pour le choisir. « Début ici » et « Fin ici » le coupent à la tête de lecture.',
    teteAilleurs: 'Place la tête de lecture dans ce plan pour couper son début ou sa fin.',
    unSeul: 'C\'est le seul plan : impossible de le supprimer.',
    suivent: 'Sons, zooms, sous-titres et transitions suivent les images. Les textes restent au même moment de la vidéo.',
    impossible: 'Trop près d\'une coupe : avance un peu la tête de lecture.',
    supprime: (n: number) => `Plan ${n} supprimé.`,
  },
} as const;
