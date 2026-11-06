// F. Volume final (dev 3) : mesure de la sonie intégrée (LUFS, ITU-R BS.1770-4 / EBU R128 : filtre K, blocs de 400 ms
// qui avancent de 100 ms, portes −70 LUFS puis −10 LU) et de la crête vraie (dBTP, suréchantillonnage × 4), puis gain
// vers −14 LUFS et limiteur de crête vraie à −1,5 dBTP. Utilisé par l'export (2 passes : mesure du mixage, puis export
// avec le gain). Fonctions PURES (Float32Array), utilisables dans le Worker. Fichier du dev 3.

import type { VolumeFinal } from '../../recette/types';
import { courbeSecurite } from './limiteur';
import { CRETE, InterpolateurCrete } from '../../auto/son/crete-vraie';

export interface MesureSonie {
  /** Sonie intégrée (LUFS). -Infinity pour un silence. */
  lufs: number;
  /** Crête vraie (dBTP). */
  creteDbtp: number;
}

/** Ce que l'écran Exporter affiche à la fin (« Volume : −14,0 LUFS · crête −1,6 dBTP »). */
export interface BilanSonie extends MesureSonie {
  /** Sonie avant correction, et gain appliqué (dB). */
  lufsAvant: number;
  gainDb: number;
}

/** Gain appliqué au plus (un export presque muet n'est pas poussé de +40 dB). */
export const GAIN_MAX_DB = 20;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/**
 * Les deux étages du filtre K (BS.1770-4) : plateau aigu +4 dB puis passe-haut (RLB). À 48 kHz, les coefficients
 * publiés par la norme ; ailleurs, recalculés avec les mêmes paramètres.
 */
export function filtreK(f: number): [Biquad, Biquad] {
  if (f === 48000) {
    return [
      { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
      { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 },
    ];
  }
  const plateau = (() => {
    const [G, Q, fc] = [3.99984385397, 0.7071752369554193, 1681.9744509555319];
    const K = Math.tan((Math.PI * fc) / f);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.499666774155);
    const a0 = 1 + K / Q + K * K;
    return { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  })();
  const passeHaut = (() => {
    const [Q, fc] = [0.5003270373253953, 38.13547087613982];
    const K = Math.tan((Math.PI * fc) / f);
    const a0 = 1 + K / Q + K * K;
    return { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  })();
  return [plateau, passeHaut];
}

/** dB d'une amplitude (−Infinity pour 0). */
export function versDb(x: number): number {
  return x > 0 ? 20 * Math.log10(x) : -Infinity;
}

/** Mesure la sonie bloc par bloc (on ne garde jamais tout le son : une énergie par 100 ms). */
export class MesureurSonie {
  private readonly k: [Biquad, Biquad];
  /** États des filtres : par canal, 2 étages × 2 valeurs (forme directe transposée). */
  private etats: Float64Array[] = [];
  private readonly parSousBloc: number;
  private somme = 0;
  private compte = 0;
  /** Énergie (somme des canaux du carré moyen filtré) de chaque tranche de 100 ms. */
  private readonly tranches: number[] = [];
  private crete: InterpolateurCrete[] = [];

  constructor(readonly frequence = 48000) {
    this.k = filtreK(frequence);
    this.parSousBloc = Math.round(frequence / 10);
  }

  /** Ajoute un bloc stéréo (2 canaux de même longueur), dans l'ordre. */
  ajouter(canaux: Float32Array[]): void {
    const n = canaux[0]?.length ?? 0;
    while (this.etats.length < canaux.length) {
      this.etats.push(new Float64Array(4));
      this.crete.push(new InterpolateurCrete());
    }
    canaux.forEach((c, i) => this.crete[i]!.ajouter(c));
    const [e1, e2] = this.k;
    let k = 0;
    while (k < n) {
      const fin = Math.min(n, k + this.parSousBloc - this.compte);
      for (let c = 0; c < canaux.length; c++) {
        const x = canaux[c]!;
        const s = this.etats[c]!;
        let [z1, z2, z3, z4] = [s[0]!, s[1]!, s[2]!, s[3]!];
        let somme = 0;
        for (let j = k; j < fin; j++) {
          const v = x[j]!;
          const y1 = e1.b0 * v + z1;
          z1 = e1.b1 * v - e1.a1 * y1 + z2;
          z2 = e1.b2 * v - e1.a2 * y1;
          const y2 = e2.b0 * y1 + z3;
          z3 = e2.b1 * y1 - e2.a1 * y2 + z4;
          z4 = e2.b2 * y1 - e2.a2 * y2;
          somme += y2 * y2;
        }
        s.set([z1, z2, z3, z4]);
        this.somme += somme;
      }
      this.compte += fin - k;
      k = fin;
      if (this.compte === this.parSousBloc) {
        this.tranches.push(this.somme / this.parSousBloc);
        this.somme = 0;
        this.compte = 0;
      }
    }
  }

  /** Sonie intégrée (portes absolue −70 LUFS et relative −10 LU) et crête vraie, jusqu'ici. */
  resultat(): MesureSonie {
    const blocs: number[] = [];
    for (let j = 0; j + 4 <= this.tranches.length; j++) blocs.push((this.tranches[j]! + this.tranches[j + 1]! + this.tranches[j + 2]! + this.tranches[j + 3]!) / 4);
    const lufs = (z: number) => -0.691 + 10 * Math.log10(z);
    const moyenne = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;
    const absolus = blocs.filter((z) => z > 0 && lufs(z) > -70);
    let integre = -Infinity;
    if (absolus.length > 0) {
      const relatif = lufs(moyenne(absolus)) - 10;
      const gardes = absolus.filter((z) => lufs(z) > relatif);
      if (gardes.length > 0) integre = lufs(moyenne(gardes));
    }
    const crete = Math.max(0, ...this.crete.map((c) => c.crete));
    return { lufs: integre, creteDbtp: versDb(crete) };
  }
}

/**
 * Gain corrigé après un essai : le limiteur rabote les crêtes et fait perdre un peu de sonie. On a mesuré
 * `lufsLimite` en sortie du limiteur réglé à `gainEssai` : on ajoute ce qui manque (borné à ±20 dB, pure).
 */
export function gainCompense(gainEssai: number, lufsLimite: number, cible: VolumeFinal): number {
  if (!Number.isFinite(lufsLimite)) return gainEssai;
  return Math.max(-GAIN_MAX_DB, Math.min(GAIN_MAX_DB, gainEssai + (cible.lufs - lufsLimite)));
}

/** Gain (dB) pour amener `mesure` à la cible (pure) : 0 pour un silence, borné à ±20 dB. */
export function gainVersCible(mesure: MesureSonie, cible: VolumeFinal): number {
  if (!Number.isFinite(mesure.lufs)) return 0;
  return Math.max(-GAIN_MAX_DB, Math.min(GAIN_MAX_DB, cible.lufs - mesure.lufs));
}

/** Anticipation (échantillons) et retour du limiteur. */
const RAMPE = 96; // 2 ms à 48 kHz : le gain descend AVANT la crête
const RELACHE_S = 0.08;
/** Le limiteur vise 0,3 dB sous le plafond (l'interpolation de la mesure peut différer un peu). */
const MARGE_DB = 0.3;

/**
 * Applique un gain puis garde la crête vraie sous `plafondDbtp`, bloc par bloc (état gardé entre les blocs).
 * Le son ressort RETARDÉ de `latence` échantillons (anticipation) : l'appelant jette les `latence` premiers et pousse
 * `latence` zéros à la fin (voir moteur/export/exporter.ts).
 */
export class LimiteurCreteVraie {
  /** Retard du son en sortie (échantillons). */
  readonly latence = RAMPE + CRETE.demi + 2;
  private readonly gain: number;
  private readonly plafond: number;
  private readonly relache: number;
  /** Par canal : C échantillons déjà sortis (contexte de l'interpolation) puis ceux en attente (avec gain). */
  private attente: Float64Array[] = [];
  private gainCourant = 1;

  constructor(
    readonly gainDb: number,
    readonly plafondDbtp: number,
    readonly frequence = 48000,
  ) {
    this.gain = Math.pow(10, gainDb / 20);
    this.plafond = Math.pow(10, (plafondDbtp - MARGE_DB) / 20);
    this.relache = 1 - Math.exp(-1 / (RELACHE_S * frequence));
  }

  /** Traite un bloc stéréo EN PLACE (sortie retardée de `latence`). */
  traiter(canaux: Float32Array[]): void {
    const n = canaux[0]?.length ?? 0;
    if (n === 0) return;
    const C = CRETE.demi;
    while (this.attente.length < canaux.length) this.attente.push(new Float64Array(C + this.latence));
    // ext = [C de contexte | latence en attente | n nouveaux], avec le gain.
    const ext = canaux.map((c, i) => {
      const e = new Float64Array(this.attente[i]!.length + n);
      e.set(this.attente[i]!);
      for (let k = 0; k < n; k++) e[this.attente[i]!.length + k] = c[k]! * this.gain;
      return e;
    });
    const total = ext[0]!.length;
    const dispo = total - 2 * C; // positions (après le contexte) dont la crête est connue
    // Crête de chaque intervalle [p, p+1] (calculée une fois), puis besoin de chaque position.
    const seuil = this.plafond * CRETE.seuilCalcul;
    const entre = new Float64Array(total);
    for (const e of ext) {
      for (let p = C - 1; p < C + dispo; p++) {
        if (Math.abs(e[p]!) < seuil && Math.abs(e[p + 1]!) < seuil) continue;
        entre[p] = Math.max(entre[p]!, CRETE.entre(e, p));
      }
    }
    const besoin = new Float64Array(dispo);
    for (let k = 0; k < dispo; k++) {
      const p = k + C;
      let crete = Math.max(entre[p - 1]!, entre[p]!);
      for (const e of ext) crete = Math.max(crete, Math.abs(e[p]!));
      besoin[k] = crete > this.plafond ? this.plafond / crete : 1;
    }
    // Anticipation : en remontant le temps, le besoin ne remonte que de 1/RAMPE par échantillon.
    for (let k = dispo - 2; k >= 0; k--) besoin[k] = Math.min(besoin[k]!, besoin[k + 1]! + 1 / RAMPE);
    const plafondSur = this.plafond * Math.pow(10, MARGE_DB / 20);
    for (let k = 0; k < n; k++) {
      const cible = besoin[k]!;
      this.gainCourant = cible < this.gainCourant ? cible : this.gainCourant + (cible - this.gainCourant) * this.relache;
      canaux.forEach((c, i) => (c[k] = courbeSecurite(ext[i]![k + C]! * this.gainCourant, plafondSur * 0.999, plafondSur)));
    }
    // On garde C de contexte + `latence` en attente.
    this.attente = ext.map((e) => e.slice(n));
  }
}
