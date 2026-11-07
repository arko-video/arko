// C. Qui parle (dev 1), fonction PURE : empreintes de voix toutes les 20 ms = niveau (dBFS) + timbre (énergie de
// 8 bandes entre 300 et 3400 Hz, en dB). Calculées une fois par piste, au fil de la lecture (jamais tout en mémoire).
// Contrat : conception/contrat-wankil.md §3.3.
// Coût : le son est d'abord ramené vers 16 kHz (2 filtres passe-bas puis 1 échantillon sur N), puis 8 filtres passe-bande
// (biquad) par échantillon : ~2 millions d'opérations par seconde de son (2 h ≈ 15 s de calcul sur PC, dans un Worker).

import type { Sec } from '../../recette/types';
import type { EmpreintesVoix } from '../types-v3';

/** Les 8 bandes du timbre (Hz), espacées régulièrement en échelle « mel » entre 300 et 3400 Hz. */
export const BANDES_VOIX: readonly (readonly [number, number])[] = [
  [300, 420], [420, 570], [570, 760], [760, 1000], [1000, 1320], [1320, 1750], [1750, 2400], [2400, 3400],
];
export const PAS_EMPREINTES: Sec = 0.02;
/** Niveau d'une trame vide (dBFS). */
export const PLANCHER_EMPREINTES = -100;

const NB = BANDES_VOIX.length;
/** Fréquence visée après réduction (Hz). */
const CIBLE = 16000;

/** Filtre biquad (formules RBJ) avec sa mémoire : passe-bande (gain 1 au centre) ou passe-bas (Butterworth). */
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

  constructor(type: 'bande' | 'bas', f0: number, q: number, frequence: number) {
    const w = (2 * Math.PI * Math.min(f0, frequence * 0.45)) / frequence;
    const alpha = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    const a0 = 1 + alpha;
    if (type === 'bande') {
      this.b0 = alpha / a0;
      this.b1 = 0;
      this.b2 = -alpha / a0;
    } else {
      this.b0 = (1 - c) / 2 / a0;
      this.b1 = (1 - c) / a0;
      this.b2 = (1 - c) / 2 / a0;
    }
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

/** Accumule le son (mono, n'importe quelle fréquence) par morceaux successifs. */
export class AccumulateurEmpreintes {
  private readonly n: number;
  private readonly sommes: Float64Array;
  private readonly comptes: Uint32Array;
  private bandes: Biquad[] = [];
  private antiRepli: Biquad[] = [];
  private frequence = 0;
  private facteur = 1;
  private compteur = 0;
  private finPrecedente = -1;

  constructor(
    readonly duree: Sec,
    readonly pas: Sec = PAS_EMPREINTES,
  ) {
    this.n = Math.max(1, Math.ceil(duree / pas - 1e-9));
    this.sommes = new Float64Array(this.n * NB);
    this.comptes = new Uint32Array(this.n);
  }

  /** Filtres neufs pour cette fréquence (nouvelle source, ou morceau qui ne suit pas le précédent). */
  private preparer(frequence: number) {
    this.frequence = frequence;
    this.facteur = Math.max(1, Math.round(frequence / CIBLE));
    const utile = frequence / this.facteur;
    const coupure = Math.min(3800, utile * 0.45);
    this.antiRepli = this.facteur > 1 ? [new Biquad('bas', coupure, Math.SQRT1_2, frequence), new Biquad('bas', coupure, Math.SQRT1_2, frequence)] : [];
    this.bandes = BANDES_VOIX.map(([bas, haut]) => {
      const centre = Math.sqrt(bas * haut);
      return new Biquad('bande', centre, centre / (haut - bas), utile);
    });
    this.compteur = 0;
  }

  /** Ajoute un morceau de son mono commençant au temps `debut` (s). */
  ajouter(mono: Float32Array, frequence: number, debut: Sec): void {
    if (mono.length === 0 || !(frequence > 0)) return;
    if (frequence !== this.frequence || Math.abs(debut - this.finPrecedente) > 0.05) this.preparer(frequence);
    const { facteur, bandes, antiRepli, sommes, comptes, n, pas } = this;
    const k0 = Math.floor(debut / pas);
    const parCase = pas * frequence;
    const decalage = (debut / pas - k0) * parCase;
    for (let i = 0; i < mono.length; i++) {
      let x = mono[i]!;
      for (const f of antiRepli) x = f.filtrer(x);
      if (this.compteur++ % facteur !== 0) continue;
      const k = k0 + Math.floor((i + decalage) / parCase);
      if (k < 0 || k >= n) continue;
      const base = k * NB;
      for (let b = 0; b < NB; b++) {
        const y = bandes[b]!.filtrer(x);
        sommes[base + b]! += y * y;
      }
      comptes[k]!++;
    }
    this.finPrecedente = debut + mono.length / frequence;
  }

  resultat(piste?: number): EmpreintesVoix {
    const db = new Float32Array(this.n);
    const bandes = new Float32Array(this.n * NB);
    for (let k = 0; k < this.n; k++) {
      const c = this.comptes[k]!;
      let total = 0;
      for (let b = 0; b < NB; b++) {
        const m = c > 0 ? this.sommes[k * NB + b]! / c : 0;
        total += m;
        bandes[k * NB + b] = m > 0 ? Math.max(PLANCHER_EMPREINTES, 10 * Math.log10(m)) : PLANCHER_EMPREINTES;
      }
      db[k] = total > 0 ? Math.max(PLANCHER_EMPREINTES, 10 * Math.log10(total)) : PLANCHER_EMPREINTES;
    }
    const res: EmpreintesVoix = { pas: this.pas, db, duree: this.duree, bandes };
    if (piste !== undefined) res.piste = piste;
    return res;
  }
}
