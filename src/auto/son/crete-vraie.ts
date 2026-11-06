// F. Crête vraie (dBTP) : la valeur la plus haute de l'onde ENTRE les échantillons, que le convertisseur du téléphone
// ou le réencodage de YouTube peut produire. Suréchantillonnage × 4 (ITU-R BS.1770-4, annexe 2) par un filtre
// polyphase de 64 coefficients (sinus cardinal fenêtré, Kaiser β = 5 ; −0,3 dB à 20 kHz) : 3 points calculés entre
// deux échantillons.
// Fonctions PURES, utilisées par le mesureur et le limiteur de moteur/audio/sonie.ts.

/** Demi-largeur du filtre : 8 échantillons de chaque côté (16 par phase). */
const M = 8;
const BETA = 5;

function besselI0(x: number): number {
  let somme = 1;
  let terme = 1;
  for (let k = 1; k < 30; k++) {
    terme *= (x / (2 * k)) * (x / (2 * k));
    somme += terme;
  }
  return somme;
}

/** Coefficients des phases 1/4, 2/4, 3/4 : PHASES[p][j] multiplie l'échantillon n − (M − 1) + j (valeur en n + p/4). */
const PHASES: Float64Array[] = [0.25, 0.5, 0.75].map((frac) => {
  const h = new Float64Array(2 * M);
  let somme = 0;
  for (let j = 0; j < 2 * M; j++) {
    const d = j - (M - 1) - frac; // distance (en échantillons) entre l'échantillon n − (M − 1) + j et le point n + frac
    const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
    const r = d / M;
    const fenetre = Math.abs(r) >= 1 ? 0 : besselI0(BETA * Math.sqrt(1 - r * r)) / besselI0(BETA);
    h[j] = sinc * fenetre;
    somme += h[j]!;
  }
  for (let j = 0; j < 2 * M; j++) h[j] = h[j]! / somme; // gain 1 en continu
  return h;
});

export const CRETE = {
  /** Échantillons nécessaires de chaque côté d'un point. */
  demi: M,
  /**
   * On ne calcule entre deux échantillons que si l'un d'eux dépasse la moitié du plafond (−6 dB) : entre deux
   * échantillons, l'onde d'un vrai son ne monte pas 6 dB au-dessus de ses deux voisins.
   */
  seuilCalcul: 0.5,
  /** Plus grande valeur absolue des 3 points entre x[c] et x[c+1] (il faut x[c − M + 1] à x[c + M]). */
  entre(x: ArrayLike<number>, c: number): number {
    let max = 0;
    for (const h of PHASES) {
      let v = 0;
      for (let j = 0; j < 2 * M; j++) v += h[j]! * x[c - (M - 1) + j]!;
      max = Math.max(max, Math.abs(v));
    }
    return max;
  },
};

/** Crête vraie d'un canal, bloc par bloc (garde les 2M − 1 derniers échantillons pour le bloc suivant). */
export class InterpolateurCrete {
  crete = 0;
  private passe = new Float64Array(2 * M - 1);

  ajouter(x: Float32Array): void {
    const ext = new Float64Array(this.passe.length + x.length);
    ext.set(this.passe);
    ext.set(x, this.passe.length);
    for (let k = 0; k < x.length; k++) this.crete = Math.max(this.crete, Math.abs(x[k]!));
    // Points entre ext[c] et ext[c+1], pour c de M − 1 à longueur − M − 1 (la suite au bloc suivant).
    const seuil = this.crete * 0.5;
    for (let c = M - 1; c <= ext.length - M - 1; c++) {
      if (Math.abs(ext[c]!) < seuil && Math.abs(ext[c + 1]!) < seuil) continue;
      this.crete = Math.max(this.crete, CRETE.entre(ext, c));
    }
    this.passe = ext.slice(ext.length - (2 * M - 1));
  }
}
