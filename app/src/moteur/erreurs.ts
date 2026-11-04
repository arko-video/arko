// Erreur destinée à l'utilisateur : son message est déjà en français, prêt à afficher.
// Réexportée par api.ts (contrat). Définie ici pour être utilisable dans le Worker sans tirer tout le moteur.

export class ErreurArko extends Error {
  constructor(
    message: string,
    /** Code stable pour l'interface (ex. "codec_video", "format", "espace", "annule"). */
    public code: string,
  ) {
    super(message);
    this.name = 'ErreurArko';
  }
}
