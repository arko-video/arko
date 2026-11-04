// Intégration comme module de « Mon Hub » (application modulaire de Romain). Bouchon en phase 1.
// Arko pourra s'y déclarer (nom, icône, point d'entrée) et recevoir une vidéo partagée par le hub.

export interface DeclarationModule {
  id: 'arko';
  nom: string;
  version: string;
  /** Adresse de la page d'Arko à ouvrir dans le hub. */
  entree: string;
}

export function declarationModule(): DeclarationModule {
  return { id: 'arko', nom: 'Arko', version: '0.1.0', entree: './' };
}

/** true si Arko tourne à l'intérieur de Mon Hub (phase ultérieure : détection réelle). */
export function dansMonHub(): boolean {
  return false;
}
