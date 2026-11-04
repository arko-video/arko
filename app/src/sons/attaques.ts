// Détection des attaques (temps forts) d'un son : fonction pure, sans navigateur.
// Méthode « flux spectral » : on découpe le son en fenêtres de 1024 échantillons (pas de 512),
// on regarde de combien chaque fréquence MONTE d'une fenêtre à l'autre, et on garde les pics nets.

import type { Sec } from '../recette/types';

/** Écart minimal entre deux temps forts (en secondes). */
export const ESPACEMENT_MIN_S = 0.12;

/** Transformée de Fourier rapide (en place) : re et im ont une longueur puissance de 2. */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let taille = 2; taille <= n; taille <<= 1) {
    const angle = (-2 * Math.PI) / taille;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let debut = 0; debut < n; debut += taille) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < taille / 2; k++) {
        const a = debut + k;
        const b = a + taille / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * Détecteur qu'on nourrit morceau par morceau (un long son n'est jamais entièrement en mémoire).
 * ajouter(...) autant de fois que nécessaire, puis terminer() donne les temps forts.
 */
export class DetecteurAttaques {
  private readonly taille: number;
  private readonly pas: number;
  private readonly fenetre: Float64Array;
  private readonly tampon: Float32Array;
  private rempli = 0;
  private precedent: Float64Array;
  private readonly flux: number[] = [];
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  constructor(private readonly frequence: number) {
    // 1024 échantillons à 44,1 ou 48 kHz (environ 21 ms) ; moitié moins pour un son à basse fréquence.
    this.taille = frequence >= 32000 ? 1024 : 512;
    this.pas = this.taille / 2;
    this.fenetre = new Float64Array(this.taille);
    for (let i = 0; i < this.taille; i++) this.fenetre[i] = Math.sin((Math.PI * i) / this.taille) ** 2; // Hann
    this.tampon = new Float32Array(this.taille);
    this.precedent = new Float64Array(this.taille / 2);
    this.re = new Float64Array(this.taille);
    this.im = new Float64Array(this.taille);
  }

  ajouter(mono: Float32Array) {
    let i = 0;
    while (i < mono.length) {
      const place = Math.min(this.taille - this.rempli, mono.length - i);
      this.tampon.set(mono.subarray(i, i + place), this.rempli);
      this.rempli += place;
      i += place;
      if (this.rempli === this.taille) {
        this.analyserFenetre();
        this.tampon.copyWithin(0, this.pas); // on avance d'un pas
        this.rempli = this.taille - this.pas;
      }
    }
  }

  /** Flux spectral d'une fenêtre : somme des hausses de chaque fréquence (en échelle « log », comme l'oreille). */
  private analyserFenetre() {
    for (let i = 0; i < this.taille; i++) {
      this.re[i] = this.tampon[i] * this.fenetre[i];
      this.im[i] = 0;
    }
    fft(this.re, this.im);
    let somme = 0;
    for (let k = 0; k < this.taille / 2; k++) {
      const m = Math.log1p(100 * Math.hypot(this.re[k], this.im[k]));
      const hausse = m - this.precedent[k];
      if (hausse > 0) somme += hausse;
      this.precedent[k] = m;
    }
    this.flux.push(somme);
  }

  /** Choisit les pics du flux : maximum local, au-dessus d'un seuil qui suit le niveau du morceau, assez espacés. */
  terminer(): Sec[] {
    return choisirPics(this.flux, this.pas / this.frequence, this.taille / 2 / this.frequence);
  }
}

/** Sélection des pics (pure). `duree` = durée d'un pas, `decalage` = temps du centre de la première fenêtre. */
export function choisirPics(flux: number[], duree: number, decalage: number): Sec[] {
  const n = flux.length;
  if (n === 0) return [];
  const moyenne = flux.reduce((a, v) => a + v, 0) / n;
  const ecart = Math.sqrt(flux.reduce((a, v) => a + (v - moyenne) ** 2, 0) / n) || 1;
  const z = flux.map((v) => (v - moyenne) / ecart); // flux « normalisé »
  const wMax = Math.max(1, Math.round(0.03 / duree)); // pic le plus haut à ±30 ms
  const wAvant = Math.max(1, Math.round(0.1 / duree)); // moyenne locale : 100 ms avant…
  const wApres = Math.max(1, Math.round(0.07 / duree)); // … et 70 ms après
  const res: { t: Sec; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    let estMax = true;
    for (let j = Math.max(0, i - wMax); j <= Math.min(n - 1, i + wMax) && estMax; j++) if (z[j] > z[i]) estMax = false;
    if (!estMax) continue;
    let somme = 0;
    let compte = 0;
    for (let j = Math.max(0, i - wAvant); j <= Math.min(n - 1, i + wApres); j++) {
      somme += z[j];
      compte++;
    }
    const seuil = somme / compte + 0.5; // seuil adaptatif : moyenne locale + une marge
    if (z[i] < seuil || z[i] < 0) continue;
    const t = decalage + i * duree;
    const dernier = res[res.length - 1];
    if (dernier && t - dernier.t < ESPACEMENT_MIN_S) {
      if (z[i] > dernier.v) res[res.length - 1] = { t, v: z[i] }; // trop proche : on garde le plus fort
      continue;
    }
    res.push({ t, v: z[i] });
  }
  return res.map((r) => Math.round(r.t * 1000) / 1000);
}

/** Temps forts d'un son mono complet (fonction pure). */
export function detecterAttaques(mono: Float32Array, frequence: number): Sec[] {
  const d = new DetecteurAttaques(frequence);
  d.ajouter(mono);
  return d.terminer();
}
