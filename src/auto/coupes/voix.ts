// A, sans transcription (dev 1), fonctions PURES : énergie de la voix dans la bande 300–3400 Hz (filtres biquad),
// toutes les 20 ms, puis zones de voix avec un seuil ADAPTATIF au-dessus du bruit de fond du jeu.
// L'accumulateur reçoit le son morceau par morceau (comme ia/signaux.ts Enveloppe) : jamais tout le son en mémoire.

import type { Sec } from '../../recette/types';
import type { PlageTemps } from '../types';

export const BANDE_VOIX = { bas: 300, haut: 3400 };
const PLANCHER = -100;

/** Énergie de la bande voix (dBFS), une valeur par `pas` (0,02 s), temps source. */
export interface EnergieVoix {
  pas: Sec;
  db: Float32Array;
}

/** Un filtre biquad (formules RBJ), avec son état : il garde la mémoire d'un morceau à l'autre. */
class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private readonly a1: number;
  private readonly a2: number;

  constructor(type: 'passeHaut' | 'passeBas', f0: number, frequence: number) {
    const w = (2 * Math.PI * Math.min(f0, frequence * 0.45)) / frequence;
    const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
    const c = Math.cos(w);
    const a0 = 1 + alpha;
    const k = type === 'passeHaut' ? (1 + c) / 2 : (1 - c) / 2;
    this.b0 = k / a0;
    this.b1 = (type === 'passeHaut' ? -2 * k : 2 * k) / a0;
    this.b2 = k / a0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  filtrer(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Accumule l'énergie de la bande voix d'un son donné morceau par morceau, dans l'ordre. */
export class AccumulateurVoix {
  private readonly sommes: Float64Array;
  private readonly comptes: Uint32Array;
  private filtres: Biquad[] = [];
  private frequence = 0;
  private finPrecedente = -1;

  constructor(
    readonly duree: Sec,
    readonly pas: Sec = 0.02,
  ) {
    const n = Math.max(1, Math.ceil(duree / pas - 1e-9));
    this.sommes = new Float64Array(n);
    this.comptes = new Uint32Array(n);
  }

  /** Ajoute un morceau mono (fréquence quelconque) qui commence au temps source `debut`. */
  ajouter(mono: Float32Array, frequence: number, debut: Sec): void {
    if (mono.length === 0 || frequence <= 0) return;
    // Nouvelle fréquence ou trou dans le son : les filtres repartent de zéro.
    if (frequence !== this.frequence || Math.abs(debut - this.finPrecedente) > 2 / frequence) {
      this.frequence = frequence;
      // Deux passe-haut (le grave des explosions compte peu) et un passe-bas.
      this.filtres = [
        new Biquad('passeHaut', BANDE_VOIX.bas, frequence),
        new Biquad('passeHaut', BANDE_VOIX.bas, frequence),
        new Biquad('passeBas', BANDE_VOIX.haut, frequence),
      ];
    }
    const [h1, h2, b] = this.filtres as [Biquad, Biquad, Biquad];
    const n = this.sommes.length;
    const parCase = this.pas * frequence;
    const decale = (debut / this.pas) * parCase; // position (en échantillons) du début, comptée depuis 0
    for (let i = 0; i < mono.length; i++) {
      const y = b.filtrer(h2.filtrer(h1.filtrer(mono[i]!)));
      const k = Math.floor((decale + i) / parCase);
      if (k < 0) continue;
      if (k >= n) break;
      this.sommes[k]! += y * y;
      this.comptes[k]!++;
    }
    this.finPrecedente = debut + mono.length / frequence;
  }

  resultat(): EnergieVoix {
    const db = new Float32Array(this.sommes.length);
    for (let k = 0; k < db.length; k++) {
      const c = this.comptes[k]!;
      const m = c > 0 ? this.sommes[k]! / c : 0;
      db[k] = m > 0 ? Math.max(PLANCHER, 10 * Math.log10(m)) : PLANCHER;
    }
    return { pas: this.pas, db };
  }
}

export interface OptionsZonesVoix {
  /** La voix doit dépasser le bruit de fond (percentile bas glissant) d'au moins `margeDb` (défaut 8 dB). */
  margeDb?: number;
  /** Fenêtre du bruit de fond glissant (défaut 10 s). */
  fenetreFond?: Sec;
}

/** Valeur au rang `part` (0 à 1) d'une liste de nombres (elle est triée sur place). */
function rang(x: Float32Array, part: number): number {
  x.sort();
  return x[Math.min(x.length - 1, Math.floor(part * x.length))]!;
}

/** Moyenne glissante centrée sur `n` cases (lisse les syllabes). */
function lisser(x: Float32Array, n: number): Float32Array {
  const res = new Float32Array(x.length);
  const demi = Math.floor(n / 2);
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, i - demi); k <= Math.min(x.length - 1, i + demi); k++) {
      s += x[k]!;
      c++;
    }
    res[i] = s / c;
  }
  return res;
}

/**
 * Bruit de fond (dB) à chaque case : 10ᵉ percentile de la fenêtre glissante, calculé toutes les 0,5 s puis
 * interpolé (une vidéo de 2 h = 14 400 calculs, pas 360 000).
 */
export function bruitDeFond(db: Float32Array, pas: Sec, fenetre: Sec = 10): Float32Array {
  const n = db.length;
  const fond = new Float32Array(n);
  if (n === 0) return fond;
  const saut = Math.max(1, Math.round(0.5 / pas));
  const demi = Math.max(1, Math.round(fenetre / 2 / pas));
  const points: number[] = [];
  for (let c = 0; c < n + saut; c += saut) {
    const k = Math.min(c, n - 1);
    const a = Math.max(0, k - demi);
    const b = Math.min(n, k + demi + 1);
    points.push(rang(db.slice(a, b), 0.1));
  }
  for (let k = 0; k < n; k++) {
    const i = Math.floor(k / saut);
    const t = (k - i * saut) / saut;
    const p0 = points[i]!;
    const p1 = points[Math.min(points.length - 1, i + 1)]!;
    fond[k] = p0 + (p1 - p0) * t;
  }
  return fond;
}

/** Zones où quelqu'un parle (temps source), triées. Trous < 0,3 s bouchés, zones < 0,2 s ignorées. */
export function zonesDeVoix(e: EnergieVoix, options: OptionsZonesVoix = {}): PlageTemps[] {
  const marge = options.margeDb ?? 8;
  const db = lisser(e.db, 5); // 100 ms
  const fond = bruitDeFond(db, e.pas, options.fenetreFond ?? 10);
  const trou = Math.round(0.3 / e.pas);
  const minCases = Math.round(0.2 / e.pas);
  const zones: [number, number][] = [];
  for (let k = 0; k < db.length; k++) {
    if (db[k]! <= fond[k]! + marge || db[k]! < -70) continue;
    const der = zones[zones.length - 1];
    if (der && k - der[1] <= trou) der[1] = k + 1;
    else zones.push([k, k + 1]);
  }
  return zones.filter(([a, b]) => b - a >= minCases).map(([a, b]) => ({ de: Math.round(a * e.pas * 100) / 100, a: Math.round(b * e.pas * 100) / 100 }));
}
