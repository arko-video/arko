// Silero VAD v5 sur une SessionOnnx (dev-vad) : le MÊME code dans le navigateur (Worker « Qui parle »,
// onnxruntime-web WASM 1 fil, modeles/onnx-web.ts) et dans le banc (onnxruntime-node). Le son arrive par morceaux
// (mono, 16 kHz, entre −1 et 1, voir reechantillonnage.ts) ; une probabilité de voix est rangée par case de 32 ms
// (512 échantillons), en Uint8 (p × 255 : 2 h ≈ 225 Ko). Rien d'autre n'est gardé : mémoire bornée (une trame).
//
// Comme le modèle officiel (get_speech_timestamps / OnnxWrapper de Silero) : entrée = 64 derniers échantillons de la
// trame d'avant + 512 nouveaux, état [2, 1, 128] repris d'un appel à l'autre, zéros au départ.
// En plus : le silence numérique (RMS < −90 dBFS) ne passe plus dans le modèle après 1 s (p = 0, rien à entendre) ;
// à la reprise, l'état est celui du début du saut (repartir de zéro invente de la parole : voir REGLAGES_MOTEUR_VAD).
// Fin d'enregistrement AFK : ≈ 40 % de la session de Romain est sautée.

import type { Sec } from '../../recette/types';
import { SILERO } from '../modeles/catalogue';
import type { PlageTemps } from '../types';
import type { ProbasVad, SessionOnnx, TenseurOnnx } from '../types-v4';

/** Nom du modèle rangé dans les probabilités (fichier du catalogue sans « .onnx »). */
export const MODELE_VAD = 'silero-vad-v5';

export interface OptionsMoteurVad {
  /** Nom du modèle rangé dans les probabilités (catalogue : 'silero-vad-v5'). */
  modele?: string;
  /** Sauter les trames de silence numérique (défaut : oui). */
  sauterSilence?: boolean;
  /** Une trame sous ce niveau (RMS, dBFS) est du silence numérique. */
  silenceDb?: number;
  /** Le silence n'est sauté qu'après `attente` s de silence passées dans le modèle (0 : dès la 1ʳᵉ trame). */
  attente?: Sec;
  /** À la reprise après un saut : l'état du début du saut (true) ; false : zéro si le saut a duré ≥ `reinitialiserApres`. */
  reprendreEtat?: boolean;
  /** Sauts de moins de tant de secondes : ne coupent pas `plages` (et, sans `reprendreEtat`, gardent l'état). */
  reinitialiserApres?: Sec;
}

/**
 * Réglages du saut du silence, MESURÉS sur la vraie session (0–3000 s, contre Silero sans saut) : à −60 dBFS (contrat),
 * 57 % des trames d'avant la fin AFK seraient sautées (le jeu est très calme, Romain parle à −40 dBFS) et 5,6 % des
 * décisions changent (+141 s de « parole » inventée à la reprise) ; à −90 dBFS avec 1 s d'attente et l'état gardé :
 * 0,11 % des décisions changent, la fin AFK (≈ 40 % du fichier) est sautée quand même.
 */
export const REGLAGES_MOTEUR_VAD = { silenceDb: -90, attente: 1, reprendreEtat: true, reinitialiserApres: 1 } as const;

/** Ce que le moteur a fait (banc, rapport de performance). */
export interface BilanMoteurVad {
  /** Trames de 32 ms reçues en entier. */
  trames: number;
  /** Trames passées dans le modèle (= appels de la session). */
  calculees: number;
  /** Trames de silence numérique sautées. */
  sautees: number;
  /** Reprises de zéro (après ≥ 1 s sautée, ou un trou dans le son reçu). */
  reinitialisations: number;
}

const F = SILERO.frequence;
const N = SILERO.trame;
const C = SILERO.contexte;
const TAILLE_ETAT = SILERO.etat[0] * SILERO.etat[1] * SILERO.etat[2];
/** Un morceau qui ne suit pas le précédent à plus de 10 ms près : nouveau départ (état remis à zéro). */
const TOLERANCE = Math.round(0.01 * F);

/**
 * Accumule le son à 16 kHz et remplit les probabilités. `ajouter` est asynchrone (la session l'est) : attendre
 * chaque appel avant le suivant. `finir` passe la dernière trame incomplète (complétée de zéros).
 */
export class MoteurVad {
  readonly pas: Sec = SILERO.pas;
  /** Probabilités × 255 (une case par trame de 32 ms), remplies au fil de la lecture : lisibles pendant le calcul. */
  readonly p: Uint8Array;
  readonly modele: string;
  readonly bilan: BilanMoteurVad = { trames: 0, calculees: 0, sautees: 0, reinitialisations: 0 };

  private readonly sauter: boolean;
  private readonly seuilCarre: number;
  private readonly tramesAvantRemise: number;
  private etat = new Float32Array(TAILLE_ETAT);
  private readonly entree = new Float32Array(C + N);
  /** Trame en cours de remplissage : entree[C .. C + rempli[. */
  private rempli = 0;
  /** Case de la trame en cours (−1 : rien commencé). */
  private k = -1;
  /** Indice (à 16 kHz, depuis t = 0) du prochain échantillon attendu. */
  private prochain = -1;
  /** Échantillons à jeter avant la 1ʳᵉ trame (calage sur la grille de 32 ms). */
  private aIgnorer = 0;
  private sauteesDeSuite = 0;
  private silencesDeSuite = 0;
  private readonly tramesAttente: number;
  private readonly reprendreEtat: boolean;
  /** Suites de cases passées dans le modèle [k0, k1] (les sauts de moins de `reinitialiserApres` n'y coupent pas). */
  private readonly suites: [number, number][] = [];
  private readonly tenseurSr: TenseurOnnx = { type: 'int64', data: BigInt64Array.from([BigInt(F)]), dims: [] };

  constructor(
    private readonly session: SessionOnnx,
    readonly duree: Sec,
    o: OptionsMoteurVad = {},
  ) {
    this.p = new Uint8Array(Math.max(1, Math.ceil(duree / SILERO.pas - 1e-9)));
    this.modele = o.modele ?? MODELE_VAD;
    this.sauter = o.sauterSilence ?? true;
    const db = o.silenceDb ?? REGLAGES_MOTEUR_VAD.silenceDb;
    this.seuilCarre = 10 ** (db / 10);
    this.tramesAvantRemise = Math.max(1, Math.round((o.reinitialiserApres ?? REGLAGES_MOTEUR_VAD.reinitialiserApres) / SILERO.pas));
    this.tramesAttente = Math.round((o.attente ?? REGLAGES_MOTEUR_VAD.attente) / SILERO.pas);
    this.reprendreEtat = o.reprendreEtat ?? REGLAGES_MOTEUR_VAD.reprendreEtat;
  }

  /** Remet l'état et le contexte à zéro (nouvelle source, trou dans le son, long silence). */
  private remettreAZero() {
    this.etat.fill(0);
    this.entree.fill(0, 0, C);
    this.bilan.reinitialisations++;
  }

  /** Ajoute un morceau de son (16 kHz mono) dont le 1er échantillon est au temps `t0` (s, temps source). */
  async ajouter(pcm16k: Float32Array, t0: Sec): Promise<void> {
    if (pcm16k.length === 0) return;
    const i0 = Math.round(t0 * F);
    let debut = 0;
    const ecart = this.prochain < 0 ? Infinity : i0 - this.prochain;
    if (Math.abs(ecart) > TOLERANCE) {
      // Nouveau départ : la trame en cours (s'il y en a une) est passée complétée de zéros, puis on se cale sur la
      // grille des cases de 32 ms (le temps d'une case ne dépend jamais de la façon dont le son a été découpé).
      if (this.rempli > 0) await this.passerTrameIncomplete();
      if (this.prochain >= 0) this.remettreAZero();
      const kDebut = Math.ceil(i0 / N);
      this.k = kDebut;
      this.rempli = 0;
      this.aIgnorer = kDebut * N - i0;
    } else if (ecart < 0) {
      // Recouvrement de quelques échantillons : déjà entendus.
      debut = -ecart;
    } else if (ecart > 0) {
      // Petit trou (quelques échantillons) : rempli de zéros, la grille reste juste.
      await this.pousser(new Float32Array(ecart), 0);
    }
    this.prochain = i0 + pcm16k.length;
    await this.pousser(pcm16k, debut);
  }

  private async pousser(pcm: Float32Array, debut: number) {
    let i = debut;
    if (this.aIgnorer > 0) {
      const n = Math.min(this.aIgnorer, pcm.length - i);
      this.aIgnorer -= n;
      i += n;
    }
    while (i < pcm.length) {
      const n = Math.min(N - this.rempli, pcm.length - i);
      this.entree.set(pcm.subarray(i, i + n), C + this.rempli);
      this.rempli += n;
      i += n;
      if (this.rempli === N) {
        await this.passerTrame();
        this.rempli = 0;
        this.k++;
      }
    }
  }

  /** Passe la dernière trame incomplète (complétée de zéros). À appeler une fois, à la fin de la lecture. */
  async finir(): Promise<void> {
    if (this.rempli > 0) await this.passerTrameIncomplete();
  }

  private async passerTrameIncomplete() {
    this.entree.fill(0, C + this.rempli);
    await this.passerTrame();
    this.rempli = 0;
    this.k++;
  }

  private async passerTrame() {
    const k = this.k;
    this.bilan.trames++;
    const e = this.entree;
    let s2 = 0;
    for (let i = C; i < C + N; i++) s2 += e[i]! * e[i]!;
    const silence = this.sauter && s2 / N < this.seuilCarre;
    this.silencesDeSuite = silence ? this.silencesDeSuite + 1 : 0;
    if (silence && this.silencesDeSuite > this.tramesAttente) {
      // Sautée : p = 0 ; l'état reste celui du début du saut.
      this.sauteesDeSuite++;
      this.bilan.sautees++;
      if (k >= 0 && k < this.p.length) this.p[k] = 0;
    } else {
      if (this.sauteesDeSuite > 0) {
        if (!this.reprendreEtat && this.sauteesDeSuite >= this.tramesAvantRemise) this.remettreAZero();
        this.sauteesDeSuite = 0;
      }
      const r = await this.session.run({
        input: { type: 'float32', data: e, dims: [1, C + N] },
        state: { type: 'float32', data: this.etat, dims: SILERO.etat },
        sr: this.tenseurSr,
      });
      const sortie = r.output?.data;
      const etat = r.stateN?.data;
      if (!(sortie instanceof Float32Array) || !(etat instanceof Float32Array) || etat.length !== TAILLE_ETAT) {
        throw new Error('Silero : sorties inattendues (output / stateN).');
      }
      // Copie (la session peut réutiliser ses tampons) ; l'entrée n'est réécrite qu'après la fin de run().
      this.etat = Float32Array.from(etat);
      this.bilan.calculees++;
      if (k >= 0 && k < this.p.length) {
        const p = sortie[0]!;
        this.p[k] = Math.round(Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0)) * 255);
        this.noterCalculee(k);
      }
    }
    // Contexte de la trame suivante : les 64 derniers échantillons de celle-ci (calculée ou sautée).
    e.copyWithin(0, N, N + C);
  }

  private noterCalculee(k: number) {
    const der = this.suites[this.suites.length - 1];
    if (der && k - der[1] - 1 < this.tramesAvantRemise) der[1] = k;
    else this.suites.push([k, k]);
  }

  /** Temps (s) jusqu'où les probabilités sont connues (fin de la dernière trame passée ; 0 avant la 1ʳᵉ). */
  get fait(): Sec {
    return this.k > 0 ? this.k * this.pas : 0;
  }

  /** Parties réellement passées dans le modèle (temps source) ; les longs silences sautés n'y sont pas. */
  plages(): PlageTemps[] {
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    return this.suites.map(([a, b]) => ({ de: r3(a * this.pas), a: r3(Math.min(this.duree, (b + 1) * this.pas)) }));
  }

  /** Les probabilités (sans `src` : la page l'ajoute). */
  resultat(): Omit<ProbasVad, 'src'> {
    return { pas: this.pas, p: this.p, plages: this.plages(), modele: this.modele };
  }
}
