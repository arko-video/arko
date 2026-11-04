// Fonctions PURES d'analyse du son (phase 6) : enveloppe (volume toutes les 20 ms), puis détection
// des pics, des « calme → pic » et des cris. Les rires sont dans rires.ts.
// Aucune dépendance au navigateur : tout se teste avec Vitest sur un signal fabriqué.

import type { Sec } from '../recette/types';

/** Une case de l'enveloppe dure 20 ms (50 valeurs par seconde : 5 h ≈ 900 000 valeurs, ~3,6 Mo). */
export const PAS_ENVELOPPE: Sec = 0.02;
/** Le son est ramené en mono 16 kHz avant de mesurer son volume. */
export const FREQUENCE_ANALYSE = 16000;
/** En dessous, on considère que c'est du silence (en dB). */
export const PLANCHER_DB = -100;

/**
 * Accumulateur d'enveloppe : on lui donne le son morceau par morceau (dans l'ordre),
 * il ne garde que la somme des carrés de chaque case de 20 ms. On ne stocke JAMAIS tout le son.
 */
export class Enveloppe {
  readonly sommes: Float32Array;
  readonly comptes: Uint16Array;

  constructor(
    readonly duree: Sec,
    readonly pas: Sec = PAS_ENVELOPPE,
    readonly frequence = FREQUENCE_ANALYSE,
  ) {
    const n = Math.max(1, Math.ceil(duree / pas - 1e-9));
    this.sommes = new Float32Array(n);
    this.comptes = new Uint16Array(n);
  }

  get longueur(): number {
    return this.sommes.length;
  }

  /**
   * Ajoute un morceau de son mono (fréquence quelconque) qui commence au temps source `debut`.
   * Il est rééchantillonné en 16 kHz (interpolation linéaire). Seuls les instants dans [tMin, tMax[
   * sont comptés : ça évite de compter deux fois un morceau à cheval sur une reprise.
   */
  ajouter(mono: Float32Array, frequenceSource: number, debut: Sec, tMin: Sec = 0, tMax: Sec = Infinity): void {
    if (mono.length === 0 || frequenceSource <= 0) return;
    const f = this.frequence;
    const parCase = this.pas * f;
    const fin = debut + mono.length / frequenceSource;
    const j0 = Math.max(Math.ceil(debut * f - 1e-6), Math.ceil(tMin * f - 1e-6));
    const j1 = Math.min(Math.ceil(fin * f - 1e-6), Number.isFinite(tMax) ? Math.ceil(tMax * f - 1e-6) : Infinity);
    const n = this.sommes.length;
    const dernier = mono.length - 1;
    for (let j = j0; j < j1; j++) {
      const k = Math.floor(j / parCase);
      if (k >= n) break;
      const pos = Math.max(0, (j / f - debut) * frequenceSource);
      const i = Math.min(Math.floor(pos), dernier);
      const a = mono[i]!;
      const b = mono[i < dernier ? i + 1 : i]!;
      const x = a + (b - a) * (pos - i);
      this.sommes[k]! += x * x;
      this.comptes[k]!++;
    }
  }

  /** Volume (RMS) des cases [0, nb[ ; une case vide vaut 0. */
  valeurs(nb = this.sommes.length): Float32Array {
    const res = new Float32Array(Math.min(nb, this.sommes.length));
    for (let k = 0; k < res.length; k++) {
      const c = this.comptes[k]!;
      res[k] = c > 0 ? Math.sqrt(this.sommes[k]! / c) : 0;
    }
    return res;
  }

  /** Remet des volumes déjà calculés (point de reprise) au début de l'enveloppe. */
  restaurer(volumes: Float32Array): void {
    const nb = Math.min(volumes.length, this.sommes.length);
    for (let k = 0; k < nb; k++) {
      const v = volumes[k]!;
      this.sommes[k] = v * v;
      this.comptes[k] = 1;
    }
  }
}

/** Volume en décibels (0 dB = son au maximum). */
export function enDecibels(env: Float32Array): Float32Array {
  const res = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) res[i] = Math.max(PLANCHER_DB, 20 * Math.log10(env[i]! + 1e-12));
  return res;
}

/** Moyenne glissante centrée sur `n` cases (lisse les petits accidents). */
export function lisser(x: Float32Array, n: number): Float32Array {
  const res = new Float32Array(x.length);
  const demi = Math.floor(n / 2);
  let somme = 0;
  let compte = 0;
  // Fenêtre [i - demi, i + demi] mise à jour pas à pas.
  for (let i = 0; i < Math.min(demi, x.length); i++) {
    somme += x[i]!;
    compte++;
  }
  for (let i = 0; i < x.length; i++) {
    const entre = i + demi;
    if (entre < x.length) {
      somme += x[entre]!;
      compte++;
    }
    const sort = i - demi - 1;
    if (sort >= 0) {
      somme -= x[sort]!;
      compte--;
    }
    res[i] = somme / compte;
  }
  return res;
}

export interface Fond {
  /** Niveau habituel (dB) juste avant chaque case. */
  moyenne: Float32Array;
  /** Écart type (dB) juste avant chaque case, jamais sous `ecartMin`. */
  ecart: Float32Array;
}

/**
 * Niveau « habituel » avant chaque case : moyenne et écart type des `fenetre` cases qui précèdent,
 * en laissant `garde` cases juste avant (pour ne pas compter le début du pic lui-même).
 * Au tout début (pas assez d'historique), on prend les premières cases du fichier.
 */
export function fondGlissant(db: Float32Array, fenetre: number, garde: number, ecartMin = 2): Fond {
  const n = db.length;
  const s1 = new Float64Array(n + 1);
  const s2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    s1[i + 1] = s1[i]! + db[i]!;
    s2[i + 1] = s2[i]! + db[i]! * db[i]!;
  }
  const moyenne = new Float32Array(n);
  const ecart = new Float32Array(n);
  const minHistorique = Math.min(fenetre, 50);
  for (let i = 0; i < n; i++) {
    let b = i - garde;
    let a = Math.max(0, b - fenetre);
    if (b - a < minHistorique) {
      a = 0;
      b = Math.min(n, fenetre);
    }
    const nb = Math.max(1, b - a);
    const m = (s1[b]! - s1[a]!) / nb;
    const v = Math.max(0, (s2[b]! - s2[a]!) / nb - m * m);
    moyenne[i] = m;
    ecart[i] = Math.max(ecartMin, Math.sqrt(v));
  }
  return { moyenne, ecart };
}

export interface Pic {
  /** Temps source du DÉBUT du pic (l'instant où le son monte : c'est là que tombent le zoom et le boom). */
  t: Sec;
  /** Case du début. */
  i: number;
  /** Case du sommet. */
  iSommet: number;
  /** Combien d'écarts types au-dessus du niveau habituel, au sommet (z-score). */
  z: number;
  /** Niveau du sommet (dB). */
  db: number;
}

export interface OptionsPics {
  seuilZ?: number;
  /** Un pic doit dépasser ce niveau (dB) pour compter. */
  dbMin?: number;
  /** Deux pics plus proches que ça (s) n'en font qu'un (on garde le plus fort). */
  ecartMin?: Sec;
  /** Le sommet est cherché dans les `sommetMax` secondes après le début. */
  sommetMax?: Sec;
}

/**
 * Pics de volume : cases où le z-score glissant (niveau comparé aux 30 s d'avant) dépasse `seuilZ`.
 * Une zone forte donne un seul pic : son début (t) et son sommet.
 */
export function detecterPics(db: Float32Array, fond: Fond, pas: Sec, o: OptionsPics = {}): Pic[] {
  const seuil = o.seuilZ ?? 3;
  const dbMin = o.dbMin ?? -50;
  const ecartCases = Math.round((o.ecartMin ?? 1) / pas);
  const sommetMax = Math.round((o.sommetMax ?? 3) / pas);
  const z = (k: number) => (db[k]! - fond.moyenne[k]!) / fond.ecart[k]!;
  const pics: Pic[] = [];
  let i = 0;
  while (i < db.length) {
    if (z(i) < seuil || db[i]! < dbMin) {
      i++;
      continue;
    }
    // Début d'une zone forte : on avance tant que chaque case reste forte par rapport à SON passé.
    let sommet = i;
    let j = i;
    while (j < db.length && j - i < sommetMax && z(j) >= seuil) {
      if (db[j]! > db[sommet]!) sommet = j;
      j++;
    }
    const pic: Pic = { t: i * pas, i, iSommet: sommet, z: (db[sommet]! - fond.moyenne[i]!) / fond.ecart[i]!, db: db[sommet]! };
    const prec = pics[pics.length - 1];
    if (prec && pic.i - prec.i < ecartCases) {
      if (pic.db > prec.db) pics[pics.length - 1] = { ...pic, t: prec.t, i: prec.i };
    } else pics.push(pic);
    // On saute la fin de la zone forte (elle appartient à ce pic).
    while (j < db.length && z(j) >= seuil) j++;
    i = Math.max(j, i + 1);
  }
  return pics;
}

/**
 * « Calme → pic » : pendant au moins `calme` secondes avant le DÉBUT du pic (en laissant 0,3 s juste avant),
 * le son est resté au moins `chute` dB sous le sommet.
 */
export function calmeAvant(db: Float32Array, pic: Pic, pas: Sec, calme: Sec = 3, chute = 15): boolean {
  const fin = pic.i - Math.round(0.3 / pas);
  const debut = fin - Math.round(calme / pas);
  if (debut < 0) return false;
  let max = -Infinity;
  for (let k = debut; k < fin; k++) max = Math.max(max, db[k]!);
  return max <= pic.db - chute;
}

/** Une plage de temps détectée (cri, rire…), avec son sommet. */
export interface Plage {
  debut: Sec;
  fin: Sec;
  /** Temps du sommet. */
  t: Sec;
  /** Force de 0 à 1 (sert au score). */
  force: number;
}

/**
 * Cris : son fort ET soutenu (régulier) pendant 0,5 à 3 s. « Fort » = au moins 2 écarts types et 8 dB
 * au-dessus du niveau habituel au début de la zone ; « soutenu » = le volume varie peu (pas des rafales).
 * Les trous de moins de 0,1 s sont tolérés.
 */
export function detecterCris(db: Float32Array, env: Float32Array, fond: Fond, pas: Sec): Plage[] {
  const res: Plage[] = [];
  const trou = Math.round(0.1 / pas);
  let i = 0;
  while (i < db.length) {
    const seuil = fond.moyenne[i]! + Math.max(2 * fond.ecart[i]!, 8);
    if (db[i]! < seuil) {
      i++;
      continue;
    }
    let j = i;
    let dernierFort = i;
    while (j < db.length && j - dernierFort <= trou) {
      if (db[j]! >= seuil) dernierFort = j;
      j++;
    }
    const fin = dernierFort + 1;
    const duree = (fin - i) * pas;
    if (duree >= 0.5 && duree <= 3 && variation(env, i, fin) < 0.35) {
      let sommet = i;
      for (let k = i; k < fin; k++) if (db[k]! > db[sommet]!) sommet = k;
      const force = Math.min(1, (db[sommet]! - fond.moyenne[i]!) / 40);
      res.push({ debut: i * pas, fin: fin * pas, t: sommet * pas, force });
    }
    i = fin;
  }
  return res;
}

/** Variation du volume (écart type / moyenne) sur [a, b[ : petite pour un son régulier. */
export function variation(env: Float32Array, a: number, b: number): number {
  let s = 0;
  let s2 = 0;
  const n = Math.max(1, b - a);
  for (let k = a; k < b; k++) {
    s += env[k]!;
    s2 += env[k]! * env[k]!;
  }
  const m = s / n;
  if (m <= 0) return 0;
  return Math.sqrt(Math.max(0, s2 / n - m * m)) / m;
}
