// C. Émotion de l'avatar pendant un tour de parole (dev 3), fonction PURE, d'après le son et les mots du tour :
// rire → rit (fort ou ≥ 3 s : mortDeRire) ; cri → crie (> −6 dBFS : hurle) ; juron + fort → enerve (répété : rage) ;
// « quoi », « hein », « ?! » après un calme → surpris (pic fort : choque) ; « gg », « ez », « trop fort » → frime ;
// « nul », « noob », « mdr » adressé → moqueur ; « vite », « aide », « cours » + fort → panique ; sinon parle.
// Contrat : conception/contrat-wankil.md §5.

import { estJuron, motNu } from '../auto/habillage/jurons';
import type { SignauxSource } from '../auto/types';
import type { Emotion, Mot, Sec, TourDeParole } from '../recette/types';

/** Règles chiffrées de l'émotion d'un tour. */
export const REGLES_EMOTION = {
  rireFort: 0.7, rireLong: 3, hurleDb: -6, juronDb: -16, picChoque: 6, calme: 1.5, ecartCalmeDb: 6, forteDb: -16,
} as const;

/** Mots clés des émotions (partagés avec la v4, emotions-v4.ts : mêmes listes). */
export const SURPRIS: ReadonlySet<string> = new Set(['quoi', 'hein', 'pardon', 'comment']);
export const FRIME: ReadonlySet<string> = new Set(['gg', 'ez', 'easy', 'ggwp', 'izi']);
export const MOQUEUR: ReadonlySet<string> = new Set(['nul', 'nulle', 'noob', 'mdr', 'lol', 'looser', 'loser', 'nullos']);
export const PANIQUE: ReadonlySet<string> = new Set(['vite', 'aide', 'aidez', 'cours', 'courez', 'help', 'fuis', 'fuyez']);

const db = (rms: number) => (rms > 0 ? 20 * Math.log10(rms) : -120);

/** Le plus fort RMS (dBFS) sur [de, a]. */
function maxDb(s: SignauxSource | null, de: Sec, a: Sec): number {
  if (!s) return -120;
  let m = 0;
  for (let i = Math.max(0, Math.floor(de / s.pas)); i < Math.min(s.rms.length, Math.ceil(a / s.pas)); i++) m = Math.max(m, s.rms[i]!);
  return db(m);
}

/** RMS moyen (dBFS) sur [de, a]. */
function moyDb(s: SignauxSource, de: Sec, a: Sec): number {
  let t = 0;
  let n = 0;
  for (let i = Math.max(0, Math.floor(de / s.pas)); i < Math.min(s.rms.length, Math.ceil(a / s.pas)); i++) {
    t += s.rms[i]! * s.rms[i]!;
    n++;
  }
  return n ? db(Math.sqrt(t / n)) : -120;
}

const recouvre = (p: { ts?: Sec; de?: Sec; a?: Sec }, de: Sec, a: Sec) => (p.de ?? 0) < a && (p.a ?? 0) > de;

export function emotionDuTour(tour: TourDeParole, mots: readonly Mot[], signaux: SignauxSource | null): Emotion {
  const R = REGLES_EMOTION;
  const { ts, fin } = tour;
  const s = signaux;
  const nus = mots.map((m) => motNu(m[0]));
  const fortDuTour = maxDb(s, ts, fin) > R.forteDb || mots.some((m) => m[3] === 1 || m[0].includes('!'));
  // 1. Rire.
  const rires = s?.rires.filter((r) => recouvre(r, ts, fin)) ?? [];
  if (rires.length > 0) return rires.some((r) => r.force >= R.rireFort || r.a - r.de >= R.rireLong) ? 'mortDeRire' : 'rit';
  // 2. Cri.
  const cris = s?.cris.filter((c) => recouvre(c, ts, fin)) ?? [];
  if (cris.length > 0) return cris.some((c) => maxDb(s, c.de, c.a) > R.hurleDb) ? 'hurle' : 'crie';
  // 3. Juron dit fort.
  const jurons = mots.filter((m) => estJuron(m[0]));
  const fortsJurons = jurons.filter((m) => !s || maxDb(s, m[1], m[2]) > R.juronDb);
  if (fortsJurons.length >= 2) return 'rage';
  if (fortsJurons.length === 1) return 'enerve';
  // 4. « Quoi ?! » après un calme.
  const surpris = nus.some((n) => SURPRIS.has(n)) || mots.some((m) => /\?!|!\?/.test(m[0]));
  if (surpris) {
    const calme = !s || moyDb(s, Math.max(0, ts - R.calme), ts) < moyDb(s, ts, fin) - R.ecartCalmeDb;
    if (calme) return s?.pics.some((p) => p.ts >= ts && p.ts < fin && p.z >= R.picChoque) ? 'choque' : 'surpris';
  }
  // 5. Frime, 6. moquerie.
  const suite = nus.join(' ');
  if (nus.some((n) => FRIME.has(n)) || /\btrop fort\b/.test(suite)) return 'frime';
  if (nus.some((n) => MOQUEUR.has(n))) return 'moqueur';
  // 7. Panique (dit fort).
  if ((nus.some((n) => PANIQUE.has(n)) || /\bnon non\b/.test(suite)) && fortDuTour) return 'panique';
  return 'parle';
}
