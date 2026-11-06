// Améliorer l'image — temps par image et décisions de repli (pur, testé).

/** Au-delà, l'aperçu ne suit plus (moins de ~12 images par seconde) : on le coupe dans l'aperçu (l'export le garde). */
export const SEUIL_APERCU_LENT_MS = 80;
/** Au-delà, on PROPOSE de ne l'appliquer qu'à l'export (l'aperçu à 30 i/s a 33 ms par image en tout). */
export const SEUIL_PROPOSER_EXPORT_MS = 33;
/** Nombre de mesures gardées pour la moyenne. */
const FENETRE = 10;

/** Moyenne glissante du temps par image (ms). */
export class MesuresTemps {
  private valeurs: number[] = [];
  /** Nombre d'images améliorées (mesurées ou non). */
  images = 0;

  ajouter(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.valeurs.push(ms);
    if (this.valeurs.length > FENETRE) this.valeurs.shift();
  }

  get n(): number {
    return this.valeurs.length;
  }

  get moyenne(): number {
    return this.n === 0 ? 0 : this.valeurs.reduce((s, v) => s + v, 0) / this.n;
  }

  vider() {
    this.valeurs = [];
    this.images = 0;
  }
}

/** Mesurer cette image ? (attendre la carte graphique coûte un peu : les 3 premières, puis une sur 15). */
export function doitMesurer(images: number): boolean {
  return images < 3 || images % 15 === 0;
}

/** L'aperçu est-il trop lent avec l'amélioration ? (au moins 4 mesures, la 1ʳᵉ compile les shaders et ne compte pas.) */
export function apercuTropLent(m: Pick<MesuresTemps, 'n' | 'moyenne'>): boolean {
  return m.n >= 4 && m.moyenne > SEUIL_APERCU_LENT_MS;
}

export type Vitesse = 'fluide' | 'lent' | 'tres-lent';

/** Classe un temps par image mesuré. */
export function vitesse(ms: number): Vitesse {
  if (ms <= SEUIL_PROPOSER_EXPORT_MS) return 'fluide';
  if (ms <= SEUIL_APERCU_LENT_MS) return 'lent';
  return 'tres-lent';
}

/** Temps ajouté à l'export (s) : une amélioration par image, `ips` images par seconde de vidéo. */
export function surcoutExport(msParImage: number, duree: number, ips = 30): number {
  return (Math.max(0, msParImage) * Math.ceil(duree * ips)) / 1000;
}

/** Médiane (pour le banc de vitesse : une image lente ne fausse pas tout). */
export function mediane(v: readonly number[]): number {
  if (v.length === 0) return 0;
  const t = [...v].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2;
}
