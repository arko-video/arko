// Planification des dessins de l'aperçu (pur, sans navigateur : testé avec de faux rendus).
// - Un seul dessin à la fois. Une demande faite pendant un dessin n'est JAMAIS perdue : elle est relancée
//   à la fin du dessin en cours, avec le rendu et le temps COURANTS (même si le rendu a changé entre-temps).
// - Compteur d'images sautées : si plus de 30 % des images de la vidéo ne sont pas affichées sur 2 s
//   de lecture, l'aperçu passe en 360 × 640.

export interface Planificateur {
  /** Demande un dessin. false = un dessin était déjà en cours (il sera refait à la fin de celui-ci). */
  demander(): boolean;
  readonly enCours: boolean;
}

/**
 * `dessinerMaintenant` lit l'état courant (rendu, temps) et renvoie la promesse du dessin,
 * ou null s'il n'y a rien à dessiner.
 */
export function creerPlanificateur(
  dessinerMaintenant: () => Promise<void> | null,
  surErreur: (e: unknown) => void = (e) => console.warn('[Arko] aperçu', e),
): Planificateur {
  let enCours = false;
  let aRefaire = false;
  function demander(): boolean {
    if (enCours) {
      aRefaire = true;
      return false;
    }
    let p: Promise<void> | null;
    try {
      p = dessinerMaintenant();
    } catch (e) {
      surErreur(e);
      return true;
    }
    if (!p) return true;
    enCours = true;
    p.catch(surErreur).finally(() => {
      enCours = false;
      // Correction B-1 : on refait le dessin demandé quel que soit le rendu (il lit le rendu courant).
      if (aRefaire) {
        aRefaire = false;
        demander();
      }
    });
    return true;
  }
  return {
    demander,
    get enCours() {
      return enCours;
    },
  };
}

/** Mesure la part d'images de la vidéo (30 i/s) qui n'ont pas été affichées, par fenêtres de `fenetreS` secondes. */
export class CompteurSauts {
  private debutFenetre: number | null = null;
  private premier = -1;
  private dernier = -1;
  private affichees = 0;

  constructor(
    private readonly fenetreS = 2,
    private readonly seuil = 0.3,
    private readonly ips = 30,
  ) {}

  /** Recommence la mesure (après un saut dans la vidéo, une pause…). */
  reinitialiser() {
    this.debutFenetre = null;
    this.premier = -1;
    this.dernier = -1;
    this.affichees = 0;
  }

  /**
   * Note qu'on vient d'afficher l'image du temps de sortie `t`, à l'heure `maintenantS`.
   * Renvoie true si, sur la fenêtre qui vient de se terminer, plus de 30 % des images ont été sautées.
   */
  noter(t: number, maintenantS: number): boolean {
    const indice = Math.floor(t * this.ips + 1e-6);
    if (this.debutFenetre === null) {
      this.debutFenetre = maintenantS;
      this.premier = this.dernier = indice;
      this.affichees = 1;
      return false;
    }
    if (indice > this.dernier) {
      this.dernier = indice;
      this.affichees++;
    }
    if (maintenantS - this.debutFenetre < this.fenetreS) return false;
    const attendues = this.dernier - this.premier + 1;
    const trop = attendues >= this.ips && 1 - this.affichees / attendues > this.seuil;
    this.reinitialiser();
    return trop;
  }
}
