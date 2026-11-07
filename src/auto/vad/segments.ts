// Parole (dev-vad), fonctions PURES : probabilités de Silero VAD → segments de parole ; outils « est-ce qu'on
// parle à t ? » ; zones à faire écouter à Whisper. Version de départ de l'architecte (7/11/2026), reprise par dev-vad.
// Algorithme = celui de Silero (get_speech_timestamps) : entrée à 0,5, sortie à 0,35, parole ≥ 0,25 s, fin après
// 0,1 s sous 0,35 ; puis les trous < 0,3 s sont bouchés (règle 8 de docs/references-montage-auto.md).
// Marges MESURÉES sur la vraie session (rapport dev-vad, 0–7400 s, contre la bouche du montage à la main) : Silero
// entend le début d'une phrase en retard (ratés 2,3 fois plus nombreux juste AVANT un segment qu'après) : 0,2 s
// avant, 0,05 s après (au lieu de 30 ms des deux côtés) → bouche couverte Romain 75,5 → 84,0 %, Guts 80,7 → 87,1 %.

import type { Sec } from '../../recette/types';
import type { PlageTemps } from '../types';
import type { ParoleDetectee, ProbasVad, ReglagesVad, SegmentParole } from '../types-v4';

/** Réglages des segments : ceux de ReglagesVad (`marge` = marge APRÈS) + une marge AVANT à part (défaut : `marge`). */
export type ReglagesSegments = ReglagesVad & { margeAvant?: Sec };

export const REGLAGES_VAD: Readonly<ReglagesVad & { margeAvant: Sec }> = { entree: 0.5, sortie: 0.35, paroleMin: 0.25, silenceMin: 0.1, marge: 0.05, margeAvant: 0.2, trouMax: 0.3 };

/** Zones données à Whisper : segments + 0,3 s de chaque côté, trous de moins de 1 s bouchés. */
export const ZONES_WHISPER = { marge: 0.3, trou: 1 } as const;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Probabilité de voix (0 à 1) au temps t (0 hors des cases). */
export function probaA(v: ProbasVad, t: Sec): number {
  const k = Math.floor(t / v.pas);
  return k >= 0 && k < v.p.length ? v.p[k]! / 255 : 0;
}

/** Plus grande probabilité sur [de, a[ (0 si vide). */
export function probaMax(v: ProbasVad, de: Sec, a: Sec): number {
  let m = 0;
  for (let k = Math.max(0, Math.floor(de / v.pas)); k < Math.min(v.p.length, Math.ceil(a / v.pas)); k++) m = Math.max(m, v.p[k]!);
  return m / 255;
}

/** Fusionne des plages triées ou non (trous < `trou` s bouchés). */
export function fusionnerPlages<T extends PlageTemps>(plages: readonly T[], trou: Sec, unir: (a: T, b: T) => T = (a, b) => ({ ...a, a: Math.max(a.a, b.a) })): T[] {
  const tries = [...plages].filter((p) => p.a > p.de).sort((x, y) => x.de - y.de);
  const res: T[] = [];
  for (const p of tries) {
    const der = res[res.length - 1];
    if (der && p.de - der.a < trou) res[res.length - 1] = unir(der, p);
    else res.push({ ...p });
  }
  return res;
}

/** Part de [0, duree] couverte par des segments sans chevauchement. */
function part(segments: readonly PlageTemps[], duree: Sec): number {
  if (duree <= 0) return 0;
  return Math.min(1, segments.reduce((t, s) => t + (s.a - s.de), 0) / duree);
}

/** Segments de parole d'après les probabilités (algorithme de Silero + trous bouchés). Triés, sans chevauchement. */
export function segmentsDeProbas(v: ProbasVad, duree: Sec, r: ReglagesSegments = REGLAGES_VAD): SegmentParole[] {
  const n = v.p.length;
  const entree = r.entree * 255;
  const sortie = r.sortie * 255;
  const bruts: SegmentParole[] = [];
  let debut = -1;
  let finTemp = -1;
  let somme = 0;
  let nb = 0;
  const fermer = (k0: number, k1: number) => {
    const de = k0 * v.pas;
    const a = k1 * v.pas;
    if (a - de >= r.paroleMin - 1e-9) bruts.push({ de: Math.max(0, de - (r.margeAvant ?? r.marge)), a: Math.min(duree, a + r.marge), p: nb > 0 ? somme / nb / 255 : 0 });
  };
  for (let k = 0; k < n; k++) {
    const p = v.p[k]!;
    if (debut < 0) {
      if (p >= entree) {
        debut = k;
        finTemp = -1;
        somme = p;
        nb = 1;
      }
      continue;
    }
    if (p >= entree) {
      finTemp = -1;
      somme += p;
      nb++;
      continue;
    }
    if (p < sortie) {
      if (finTemp < 0) finTemp = k;
      if ((k + 1 - finTemp) * v.pas >= r.silenceMin - 1e-9) {
        fermer(debut, finTemp);
        debut = -1;
      }
      continue;
    }
    // Entre la sortie et l'entrée : on reste dans la parole.
    if (finTemp < 0) {
      somme += p;
      nb++;
    }
  }
  if (debut >= 0) fermer(debut, finTemp >= 0 ? finTemp : n);
  const unir = (x: SegmentParole, y: SegmentParole): SegmentParole => {
    const lx = x.a - x.de;
    const ly = y.a - y.de;
    return { de: x.de, a: Math.max(x.a, y.a), p: (x.p * lx + y.p * ly) / Math.max(1e-9, lx + ly) };
  };
  return fusionnerPlages(bruts, r.trouMax, unir).map((s) => ({ de: r3(s.de), a: r3(s.a), p: Math.round(s.p * 1000) / 1000 }));
}

/** La parole d'une source d'après la VAD. */
export function paroleDepuisProbas(v: ProbasVad, duree: Sec, r: ReglagesSegments = REGLAGES_VAD): ParoleDetectee {
  const segments = segmentsDeProbas(v, duree, r);
  return { src: v.src, methode: 'vad', segments, probas: v, part: part(segments, duree) };
}

/** La parole d'après des zones déjà trouvées autrement (repli sans modèle, ou mots de Whisper). */
export function paroleDepuisZones(src: string, duree: Sec, zones: readonly PlageTemps[], methode: 'sans-modele' | 'mots'): ParoleDetectee {
  const segments = fusionnerPlages(
    zones.map((z) => ({ de: Math.max(0, z.de), a: Math.min(duree, z.a), p: 1 })),
    0,
  ).filter((s) => s.a > s.de);
  return { src, methode, segments, probas: null, part: part(segments, duree) };
}

/** Indice du segment qui contient t (−1 si aucun). Recherche dichotomique. */
export function segmentA(parole: Pick<ParoleDetectee, 'segments'>, t: Sec): number {
  const s = parole.segments;
  let lo = 0;
  let hi = s.length - 1;
  while (lo <= hi) {
    const mi = (lo + hi) >> 1;
    if (s[mi]!.a <= t) lo = mi + 1;
    else if (s[mi]!.de > t) hi = mi - 1;
    else return mi;
  }
  return -1;
}

/** Quelqu'un parle-t-il à t ? */
export function dansLaParole(parole: Pick<ParoleDetectee, 'segments'>, t: Sec): boolean {
  return segmentA(parole, t) >= 0;
}

/** Zones à faire écouter à Whisper : segments + marge, trous bouchés, dans [0, duree]. */
export function zonesATranscrire(parole: Pick<ParoleDetectee, 'segments'>, duree: Sec, marge: Sec = ZONES_WHISPER.marge, trou: Sec = ZONES_WHISPER.trou): PlageTemps[] {
  return fusionnerPlages(
    parole.segments.map((s) => ({ de: Math.max(0, s.de - marge), a: Math.min(duree, s.a + marge) })),
    trou,
  ).map((z) => ({ de: r3(z.de), a: r3(z.a) }));
}
