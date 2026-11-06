// E. Import d'un pack de sons (dev 3), fonctions PURES : un .zip ou plusieurs fichiers gardent le NOM DU DOSSIER comme
// étiquette (« Laughs », « MLG Sound Effects »). Le chemin d'archive n'est jamais utilisé comme chemin de fichier.

/** Longueur maximale d'une étiquette (comme NOM_MAX de stockage/mes-sons.ts). */
const ETIQUETTE_MAX = 60;

/** Dossiers ajoutés par les systèmes, jamais des étiquettes. */
const DOSSIERS_IGNORES = new Set(['__macosx', '.', '..', '']);

/**
 * Étiquette tirée d'un chemin (« Pack/MLG Sound Effects/airhorn.mp3 » → « MLG Sound Effects ») : le dossier le plus
 * proche du fichier, nettoyé (60 caractères). "" s'il n'y a pas de dossier. Sert aussi à File.webkitRelativePath.
 */
export function etiquetteDuChemin(chemin: string): string {
  const morceaux = chemin.split(/[\\/]+/);
  morceaux.pop(); // le fichier lui-même
  for (let i = morceaux.length - 1; i >= 0; i--) {
    const brut = morceaux[i] ?? '';
    if (DOSSIERS_IGNORES.has(brut.trim().toLowerCase()) || /^[a-z]:$/i.test(brut)) continue;
    const propre = brut
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, ETIQUETTE_MAX);
    if (propre) return propre;
  }
  return '';
}

/** Étiquette d'un fichier importé : celle de son dossier, sinon celle choisie par l'utilisateur. */
export function etiquettePour(chemin: string | undefined, choisie: string): string {
  return (chemin && etiquetteDuChemin(chemin)) || choisie;
}
