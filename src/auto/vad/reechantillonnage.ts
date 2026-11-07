// Son ramené à 16 kHz pour Silero VAD (et la hauteur de la voix), au fil de la lecture (dev-vad), PUR.
// Le décodeur du navigateur donne des morceaux à la fréquence de la piste (48 kHz pour OBS, parfois 44,1 kHz) :
// passe-bas (Butterworth d'ordre 6 à 7 kHz, pour ne pas replier les aigus du jeu sur la voix), puis un échantillon
// tous les f / 16000 (interpolation linéaire entre deux échantillons filtrés). Les échantillons de sortie tombent sur
// la grille t = n / 16000 depuis le début de la source : les cases de 32 ms ne dépendent pas du découpage.
// (Les empreintes de voix, empreintes.ts, ont leur propre réduction coupée à 3,8 kHz : elle ne convient pas à Silero,
// qui écoute jusqu'à 8 kHz ; et à 44,1 kHz elle donne 14,7 kHz. D'où cette 2ᵉ réduction, sur la MÊME lecture.)

import type { Sec } from '../../recette/types';

export const FREQUENCE_VAD = 16000;
/** Coupure du passe-bas avant réduction (Hz). */
export const COUPURE_VAD = 7000;
/** Q des 3 cellules d'un Butterworth d'ordre 6 (angles 15°, 45°, 75°). */
const Q_BUTTERWORTH_6 = [0.5176, 0.7071, 1.9319] as const;

/** Passe-bas biquad (formules RBJ) avec sa mémoire. */
class PasseBas {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private readonly b0: number;
  private readonly b1: number;
  private readonly a1: number;
  private readonly a2: number;

  constructor(f0: number, q: number, frequence: number) {
    const w = (2 * Math.PI * Math.min(f0, frequence * 0.45)) / frequence;
    const alpha = Math.sin(w) / (2 * q);
    const c = Math.cos(w);
    const a0 = 1 + alpha;
    this.b0 = (1 - c) / 2 / a0;
    this.b1 = (1 - c) / a0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  filtrer(x: number): number {
    const y = this.b0 * (x + this.x2) + this.b1 * this.x1 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Un morceau de son à 16 kHz et le temps (s) de son 1er échantillon. */
export interface Morceau16k {
  pcm: Float32Array;
  t0: Sec;
}

/** Réduit vers 16 kHz des morceaux successifs de son mono (n'importe quelle fréquence). */
export class Vers16k {
  private frequence = 0;
  private filtres: PasseBas[] = [];
  /** Échantillons d'entrée par échantillon de sortie. */
  private rapport = 1;
  /** Position (en échantillons d'entrée depuis le début du flux) du prochain échantillon de sortie. */
  private position = 0;
  /** Échantillons d'entrée déjà lus dans ce flux. */
  private lus = 0;
  private precedent = 0;
  /** Indice (grille 16 kHz depuis t = 0) du prochain échantillon de sortie. */
  private indiceSortie = 0;
  private finPrecedente = -1;

  /** Nouveau flux (1er morceau, autre fréquence, ou morceau qui ne suit pas le précédent à 50 ms près). */
  private demarrer(frequence: number, debut: Sec) {
    this.frequence = frequence;
    this.rapport = frequence / FREQUENCE_VAD;
    this.filtres = frequence > FREQUENCE_VAD * 1.01 ? Q_BUTTERWORTH_6.map((q) => new PasseBas(COUPURE_VAD, q, frequence)) : [];
    this.indiceSortie = Math.ceil(debut * FREQUENCE_VAD - 1e-6);
    this.position = Math.max(0, (this.indiceSortie / FREQUENCE_VAD - debut) * frequence);
    this.lus = 0;
    this.precedent = 0;
  }

  /** Ajoute un morceau mono commençant au temps `debut` (s) ; rend sa part à 16 kHz (null s'il n'en donne aucune). */
  ajouter(mono: Float32Array, frequence: number, debut: Sec): Morceau16k | null {
    if (mono.length === 0 || !(frequence > 0)) return null;
    if (frequence !== this.frequence || Math.abs(debut - this.finPrecedente) > 0.05) this.demarrer(frequence, debut);
    this.finPrecedente = debut + mono.length / frequence;
    const sortie = new Float32Array(Math.ceil(mono.length / this.rapport) + 2);
    const t0 = this.indiceSortie / FREQUENCE_VAD;
    let n = 0;
    const { filtres, rapport } = this;
    let position = this.position;
    let precedent = this.precedent;
    let indice = this.lus;
    for (let i = 0; i < mono.length; i++, indice++) {
      let x = mono[i]!;
      for (const f of filtres) x = f.filtrer(x);
      // Les sorties dont la position tombe dans ]indice − 1, indice] : entre `precedent` et `x`.
      while (position <= indice) {
        const frac = 1 - (indice - position);
        sortie[n++] = frac > 1 - 1e-9 ? x : precedent + (x - precedent) * frac;
        position += rapport;
      }
      precedent = x;
    }
    this.position = position;
    this.precedent = precedent;
    this.lus = indice;
    this.indiceSortie += n;
    return n > 0 ? { pcm: sortie.subarray(0, n), t0 } : null;
  }
}
