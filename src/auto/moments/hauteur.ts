// Hauteur de la voix (f0) pour les moments v4 (dev-moments), PUR : autocorrélation par FFT sur des trames de 40 ms,
// une toutes les 20 ms, entre 70 et 500 Hz, SEULEMENT là où la VAD entend de la voix (p ≥ 0,5). Sert aux règles des
// rires et des cris (« la voix monte » : hauteur > 1,25 × la médiane de SA voix). Facultative : sans elle, les règles
// marchent (moins fort). Branchée par dev-vad dans la passe du son (Worker « Qui parle », son déjà à 16 kHz) :
//   const h = new AccumulateurHauteur(duree);  h.ajouter(pcm16k, t0, probasVad);  …  h.resultat()
// Les morceaux de son arrivent dans l'ordre ; un trou (silence numérique sauté, reprise) remet la trame à zéro.

import type { Sec } from '../../recette/types';
import type { HauteurVoix, ProbasVad } from '../types-v4';

export const REGLAGES_HAUTEUR = {
  /** Fréquence du son reçu (Hz). */
  frequence: 16000,
  /** Une valeur de f0 toutes les `pas` s (case k = [k × pas, (k + 1) × pas[, trame centrée sur la case). */
  pas: 0.02,
  /** Longueur d'une trame (s). */
  fenetre: 0.04,
  fMin: 70,
  fMax: 500,
  /** Trame calculée seulement si la VAD dit p ≥ pMin à son centre (quand les probabilités sont données). */
  pMin: 0.5,
  /** Trame voisée si le pic d'autocorrélation (normalisée, corrigée de la fenêtre) atteint ce seuil. */
  voisement: 0.45,
  /** Sans probabilités : trames plus faibles que ça (dBFS) sautées (silence numérique). */
  plancherDb: -60,
} as const;

/** Les probabilités de la VAD connues au moment de l'appel (temps absolus). */
export type ProbasPourHauteur = Pick<ProbasVad, 'pas' | 'p'>;

const TAILLE_FFT = 1024;

/** FFT complexe en place (radix 2), n puissance de 2. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const moitie = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < moitie; k++) {
        const a = i + k;
        const b = a + moitie;
        const xr = re[b]! * cr - im[b]! * ci;
        const xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Outils d'une taille de trame (fenêtre de Hann et son autocorrélation), calculés une fois. */
interface Outils {
  n: number;
  hann: Float64Array;
  /** Autocorrélation normalisée de la fenêtre (correction de Boersma). */
  rw: Float64Array;
  re: Float64Array;
  im: Float64Array;
}

function outils(n: number): Outils {
  const hann = new Float64Array(n);
  for (let k = 0; k < n; k++) hann[k] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (k + 0.5)) / n);
  const rw = new Float64Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let k = 0; k + lag < n; k++) s += hann[k]! * hann[k + lag]!;
    rw[lag] = s;
  }
  const r0 = rw[0]!;
  for (let lag = 0; lag < n; lag++) rw[lag] = rw[lag]! / r0;
  return { n, hann, rw, re: new Float64Array(TAILLE_FFT), im: new Float64Array(TAILLE_FFT) };
}

/**
 * f0 (Hz) d'une trame `x[a .. a + o.n[`, 0 si elle n'est pas voisée. Autocorrélation par FFT (bourrage à 1024, sans
 * repliement pour les décalages utiles), corrigée de la fenêtre ; on garde le PLUS PETIT décalage dont le pic vaut au
 * moins 90 % du meilleur (évite de tomber une octave trop bas), affiné par une parabole.
 */
function f0Trame(x: Float32Array, a: number, o: Outils, frequence: number, fMin: number, fMax: number, voisement: number): number {
  const { n, hann, rw, re, im } = o;
  let m = 0;
  for (let k = 0; k < n; k++) m += x[a + k]!;
  m /= n;
  re.fill(0);
  im.fill(0);
  for (let k = 0; k < n; k++) re[k] = (x[a + k]! - m) * hann[k]!;
  fft(re, im);
  for (let k = 0; k < TAILLE_FFT; k++) {
    re[k] = re[k]! * re[k]! + im[k]! * im[k]!;
    im[k] = 0;
  }
  fft(re, im); // spectre de puissance réel et pair : la FFT directe donne l'autocorrélation (à N près)
  const r0 = re[0]!;
  if (!(r0 > 1e-12)) return 0;
  const lagMin = Math.max(2, Math.floor(frequence / fMax));
  const lagMax = Math.min(n - 2, Math.ceil(frequence / fMin));
  const rn = (lag: number) => re[lag]! / r0 / Math.max(1e-6, rw[lag]!);
  let meilleur = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) meilleur = Math.max(meilleur, rn(lag));
  if (meilleur < voisement) return 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const v = rn(lag);
    if (v < 0.9 * meilleur) continue;
    if (v < rn(lag - 1) || v < rn(lag + 1)) continue; // pas un sommet local
    const g = rn(lag - 1);
    const d = rn(lag + 1);
    const den = g - 2 * v + d;
    const dec = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (g - d)) / den)) : 0;
    return frequence / (lag + dec);
  }
  return 0;
}

/** f0 d'un bout de son entier (une trame centrée toutes les `pas` s), pour les tests et les essais. */
export function hauteurDuSon(x: Float32Array, t0: Sec = 0, probas?: ProbasPourHauteur): HauteurVoix {
  const acc = new AccumulateurHauteur(t0 + x.length / REGLAGES_HAUTEUR.frequence);
  acc.ajouter(x, t0, probas);
  return acc.resultat();
}

/**
 * Accumulateur de la hauteur de la voix sur toute une source : reçoit le son à 16 kHz morceau par morceau (dans
 * l'ordre), garde seulement ce qu'il faut pour la trame suivante (jamais tout le son).
 */
export class AccumulateurHauteur {
  private readonly f0: Float32Array;
  private readonly pasEch: number;
  private readonly n: number;
  private readonly o: Outils;
  private tampon = new Float32Array(0);
  /** Indice (échantillon absolu) du 1er échantillon du tampon. */
  private debut = 0;
  /** Prochaine case à calculer. */
  private prochaine = 0;

  constructor(duree: Sec) {
    const r = REGLAGES_HAUTEUR;
    this.f0 = new Float32Array(Math.max(0, Math.ceil(duree / r.pas)));
    this.pasEch = Math.round(r.pas * r.frequence);
    this.n = Math.round(r.fenetre * r.frequence);
    this.o = outils(this.n);
  }

  /** Début (échantillon absolu) de la trame de la case k (centrée sur la case). */
  private debutTrame(k: number): number {
    return k * this.pasEch + Math.round(this.pasEch / 2) - Math.round(this.n / 2);
  }

  /** Ajoute un morceau de son mono à 16 kHz commençant à t0 (temps source). `probas` : la VAD déjà connue. */
  ajouter(pcm16k: Float32Array, t0: Sec, probas?: ProbasPourHauteur): void {
    const r = REGLAGES_HAUTEUR;
    const i0 = Math.round(t0 * r.frequence);
    if (this.tampon.length === 0 || i0 !== this.debut + this.tampon.length) {
      // Premier morceau, ou trou (silence sauté, reprise) : on repart de ce morceau.
      this.tampon = pcm16k.slice();
      this.debut = i0;
      let k = Math.max(0, Math.ceil((i0 + Math.round(this.n / 2) - Math.round(this.pasEch / 2)) / this.pasEch));
      while (this.debutTrame(k) < i0) k++;
      this.prochaine = Math.max(this.prochaine, k);
    } else {
      const t = new Float32Array(this.tampon.length + pcm16k.length);
      t.set(this.tampon, 0);
      t.set(pcm16k, this.tampon.length);
      this.tampon = t;
    }
    const fin = this.debut + this.tampon.length;
    const plancher = 10 ** (r.plancherDb / 10) * this.n;
    let k = this.prochaine;
    for (; k < this.f0.length; k++) {
      const a = this.debutTrame(k);
      if (a + this.n > fin) break;
      if (a < this.debut) continue;
      const centre = (k + 0.5) * r.pas;
      if (probas) {
        const c = Math.floor(centre / probas.pas);
        const p = c >= 0 && c < probas.p.length ? probas.p[c]! / 255 : 0;
        if (p < r.pMin) continue;
      } else {
        let e = 0;
        for (let j = a - this.debut; j < a - this.debut + this.n; j++) e += this.tampon[j]! * this.tampon[j]!;
        if (e < plancher) continue;
      }
      this.f0[k] = f0Trame(this.tampon, a - this.debut, this.o, r.frequence, r.fMin, r.fMax, r.voisement);
    }
    this.prochaine = k;
    // On ne garde que ce qu'il faut pour la prochaine trame.
    const garder = Math.max(this.debut, this.debutTrame(k));
    if (garder > this.debut) {
      this.tampon = this.tampon.slice(Math.min(this.tampon.length, garder - this.debut));
      this.debut = garder;
    }
  }

  resultat(): HauteurVoix {
    return { pas: REGLAGES_HAUTEUR.pas, f0: this.f0.slice() };
  }
}

/** Médiane des f0 voisées (> 0) sur [de, a[ (0 si aucune). */
export function f0Mediane(h: HauteurVoix, de: Sec, a: Sec): number {
  const v: number[] = [];
  for (let k = Math.max(0, Math.floor(de / h.pas)); k < Math.min(h.f0.length, Math.ceil(a / h.pas)); k++) if (h.f0[k]! > 0) v.push(h.f0[k]!);
  if (v.length === 0) return 0;
  v.sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)]!;
}
