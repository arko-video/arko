// Parole SANS modèle (dev-vad), PURE : le repli quand Silero VAD ne peut pas tourner (fichier du modèle qui ne charge
// pas, appareil trop vieux pour onnxruntime-web). Jamais un « mode muet caché » : la chaîne le dit (methode
// 'sans-modele'), et l'écran peut proposer de refaire l'analyse avec le détecteur de voix.
//
// Une trame de 20 ms est de la parole si :
//  1. l'énergie de la bande voix (300–3400 Hz, empreintes de la piste principale) dépasse le fond (10ᵉ centile sur
//     10 s) de `auDessusFond` dB, et au moins `plancherDb` dBFS ;
//  2. elle tombe dans une fenêtre « syllabique » : le volume y monte et descend 3 à 8 fois par seconde (part de ses
//     variations entre 3 et 8 Hz, partDansBande d'ia/rires.ts) et assez profondément (écart type / moyenne) — c'est ce
//     qui sépare la voix des sons du jeu, presque toujours assez forts pour passer le test 1 ;
//  3. la suite dure au moins `paroleMin` s ; les trous de moins de `trouMax` s sont bouchés ; marge de chaque côté.
// Réglages calibrés sur la vraie session (0–7400 s, rapport dev-vad), contre Silero VAD : 89,7 % de sa parole
// couverte, 22,1 % du temps trouvé hors de sa parole (cibles : ≥ 75 % et ≤ 30 %) ; zonesDeVoix d'avant : 95 % / 52,6 %.

import { partDansBande } from '../../ia/rires';
import type { Sec } from '../../recette/types';
import { bruitDeFond } from '../coupes/voix';
import type { PlageTemps } from '../types';
import type { EnveloppeDb } from '../types-v3';

export interface ReglagesSansModele {
  /** Lissage de l'énergie avant tout (s). */
  lissage: Sec;
  /** Fenêtre du fond (s) et marge au-dessus (dB). */
  fenetreFond: Sec;
  auDessusFond: number;
  /** Niveau minimal (dBFS de la bande voix). */
  plancherDb: number;
  /** Fenêtre d'analyse du rythme des syllabes (s) et pas entre deux fenêtres (s). */
  fenetre: Sec;
  saut: Sec;
  /** Bande des syllabes (Hz) et part minimale des variations du volume qui y tombe. */
  fMin: number;
  fMax: number;
  partMin: number;
  /** Profondeur minimale des variations (écart type / moyenne du volume linéaire). */
  profondeurMin: number;
  /**
   * Rythme mesuré sur le volume en dB (ramené au fond) plutôt que linéaire : une voix faible à côté d'un son fort du
   * jeu garde ses syllabes ; profondeur = écart type en dB.
   */
  enDb: boolean;
  profondeurMinDb: number;
  /** Part de la fenêtre (début, fin, de 0 à 1) marquée « syllabique » quand elle passe le test. */
  centre: readonly [number, number];
  paroleMin: Sec;
  trouMax: Sec;
  marge: Sec;
}

export const REGLAGES_SANS_MODELE: Readonly<ReglagesSansModele> = {
  lissage: 0.06,
  fenetreFond: 30,
  auDessusFond: 12,
  plancherDb: -52,
  fenetre: 0.8,
  saut: 0.1,
  fMin: 3,
  fMax: 8,
  partMin: 0.4,
  profondeurMin: 0.2,
  enDb: false,
  profondeurMinDb: 3,
  centre: [0.1, 0.9],
  paroleMin: 0.25,
  trouMax: 0.3,
  marge: 0.1,
};

/** Moyenne glissante centrée de `n` cases, en puissance (dB → puissance → moyenne → dB). */
function lisserDb(db: Float32Array, n: number): Float32Array {
  const res = new Float32Array(db.length);
  const demi = Math.floor(n / 2);
  const p = Float64Array.from(db, (x) => 10 ** (x / 10));
  let s = 0;
  let c = 0;
  for (let i = 0; i < Math.min(demi, db.length); i++) {
    s += p[i]!;
    c++;
  }
  for (let i = 0; i < db.length; i++) {
    const entre = i + demi;
    if (entre < db.length) {
      s += p[entre]!;
      c++;
    }
    const sort = i - demi - 1;
    if (sort >= 0) {
      s -= p[sort]!;
      c--;
    }
    res[i] = 10 * Math.log10(Math.max(1e-12, s / Math.max(1, c)));
  }
  return res;
}

/**
 * Cases (20 ms) « syllabiques » : couvertes par au moins une fenêtre dont le volume varie au rythme des syllabes.
 * `fort` : cases déjà au-dessus du fond (on ne calcule le rythme que là où il y a de quoi).
 */
export function casesSyllabiques(db: Float32Array, pas: Sec, fort: Uint8Array, r: ReglagesSansModele = REGLAGES_SANS_MODELE, fond?: Float32Array): Uint8Array {
  const n = Math.max(8, Math.round(r.fenetre / pas));
  const saut = Math.max(1, Math.round(r.saut / pas));
  const res = new Uint8Array(db.length);
  const amp = r.enDb ? Float32Array.from(db, (x, k) => Math.max(x, fond ? fond[k]! : -100)) : Float32Array.from(db, (x) => 10 ** (x / 20));
  const minProf = r.enDb ? r.profondeurMinDb : r.profondeurMin;
  // Nombre de cases fortes cumulé : une fenêtre sans assez de son fort est passée sans calcul.
  const cumul = new Uint32Array(db.length + 1);
  for (let k = 0; k < db.length; k++) cumul[k + 1] = cumul[k]! + fort[k]!;
  for (let a = 0; a + n <= db.length; a += saut) {
    if (cumul[a + n]! - cumul[a]! < n * 0.25) continue;
    let s = 0;
    let s2 = 0;
    for (let k = a; k < a + n; k++) {
      s += amp[k]!;
      s2 += amp[k]! * amp[k]!;
    }
    const m = s / n;
    const ecart = Math.sqrt(Math.max(0, s2 / n - m * m));
    const profondeur = r.enDb ? ecart : m > 0 ? ecart / m : 0;
    if (profondeur < minProf) continue;
    if (partDansBande(amp, a, n, pas, r.fMin, r.fMax) < r.partMin) continue;
    // Seulement le milieu de la fenêtre : un son fort du jeu collé à une phrase n'hérite pas du rythme de la phrase.
    res.fill(1, a + Math.floor(n * r.centre[0]), a + Math.ceil(n * r.centre[1]));
  }
  return res;
}

/** Zones de parole d'après l'énergie de la bande voix seule (temps source, triées, sans chevauchement). */
export function paroleSansModele(energie: EnveloppeDb, duree: Sec, r: ReglagesSansModele = REGLAGES_SANS_MODELE): PlageTemps[] {
  const pas = energie.pas;
  const n = Math.min(energie.db.length, Math.ceil(duree / pas - 1e-9));
  if (n <= 0) return [];
  const db = lisserDb(energie.db.subarray(0, n), Math.max(1, Math.round(r.lissage / pas)));
  const fond = bruitDeFond(db, pas, r.fenetreFond);
  const fort = new Uint8Array(n);
  for (let k = 0; k < n; k++) fort[k] = db[k]! >= Math.max(fond[k]! + r.auDessusFond, r.plancherDb) ? 1 : 0;
  const syll = casesSyllabiques(db, pas, fort, r, fond);
  const trou = Math.round(r.trouMax / pas);
  const min = Math.round(r.paroleMin / pas);
  const suites: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    if (!fort[k] || !syll[k]) continue;
    const der = suites[suites.length - 1];
    if (der && k - der[1] <= trou) der[1] = k + 1;
    else suites.push([k, k + 1]);
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const zones: PlageTemps[] = [];
  for (const [a, b] of suites) {
    if (b - a < min) continue;
    const de = Math.max(0, a * pas - r.marge);
    const fin = Math.min(duree, b * pas + r.marge);
    const der = zones[zones.length - 1];
    if (der && de - der.a < r.trouMax) der.a = r3(fin);
    else zones.push({ de: r3(de), a: r3(fin) });
  }
  return zones;
}
