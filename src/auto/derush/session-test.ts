// Outils pour les tests du derush (dev 1) : une session de jeu FABRIQUÉE de 30 min dont on connaît les passages drôles.
// Voix synthétiques (au niveau de l'enveloppe), bruit de jeu, rires en rafales à 5 Hz, cris, échanges rapides entre
// deux personnes, mots transcrits. (Le nom ne finit pas par .test.ts : Vitest ne le lance pas seul.)
// En plus (dev-scenes, Best-of v4) : sessionLongue(), une session de 2 h prête pour l'étape « séquences ».

import { hasard } from '../../ia/synthese-test';
import type { Mot, TourDeParole } from '../../recette/types';
import { morceauxDans, ranger } from '../coupes/decoupe';
import { signauxDepuisEnveloppe } from '../signaux-source';
import type { PlageTemps, SignauxSource } from '../types';
import type { EntreeSequences, MomentV4, ParoleDetectee, SegmentParole, VoixDetecteesV4 } from '../types-v4';

export const PAS = 0.02;
export const DUREE_SESSION = 1800;

/** Un passage drôle planté : son instant clé (temps source) et ce que c'est. */
export interface PassagePlante {
  t: number;
  quoi: string;
}

export interface Session {
  signaux: SignauxSource;
  mots: Mot[];
  paroles: TourDeParole[];
  plantes: PassagePlante[];
  /** Scènes de parole (débuts / fins) telles que fabriquées. */
  scenes: { de: number; a: number }[];
}

/** Scènes de parole : [de, a] ; entre deux, plus de 20 s de jeu sans parole. */
const SCENES: [number, number][] = [
  [20, 80], [110, 175], [210, 290], [320, 380], [390, 440], [470, 540], [590, 665], [700, 760],
  [790, 1110], [1140, 1200], [1230, 1290], [1320, 1370], [1385, 1430], [1460, 1530], [1580, 1640], [1680, 1720], [1750, 1790],
];

export const PLANTES: PassagePlante[] = [
  { t: 150, quoi: 'fou rire' },
  { t: 400, quoi: 'cri puis rire' },
  { t: 630, quoi: 'échanges rapides' },
  { t: 900, quoi: 'fou rire dans une scène de 5 min' },
  { t: 1250, quoi: 'calme puis gros pic' },
  { t: 1400, quoi: 'juron crié' },
  { t: 1600, quoi: 'rire et mots forts' },
  { t: 1700, quoi: 'fou rire court' },
  { t: 1000, quoi: 'cri et réaction dans la scène de 5 min' },
  { t: 1500, quoi: 'échanges rapides et rire' },
];

/** Fabrique la session (toujours la même : hasard reproductible). */
export function sessionFabriquee(): Session {
  const r = hasard(7);
  const n = Math.round(DUREE_SESSION / PAS);
  const env = new Float32Array(n);
  const k = (t: number) => Math.round(t / PAS);
  for (let i = 0; i < n; i++) env[i] = 0.01 * (1 + 0.4 * (r() - 0.5)); // jeu ≈ −40 dB
  const mots: Mot[] = [];
  const paroles: TourDeParole[] = [];
  const rapides = (t: number) => (t >= 600 && t < 660) || (t >= 1490 && t < 1520);
  for (const [de, a] of SCENES) {
    let t = de;
    let p = 0;
    while (t < a - 1) {
      const vite = rapides(t);
      const tour = vite ? 1 + r() : 3 + 4 * r();
      const fin = Math.min(a, t + tour);
      for (let x = t; x + 0.3 <= fin; x += 0.4) {
        mots.push(['bla', Math.round(x * 100) / 100, Math.round((x + 0.3) * 100) / 100]);
        for (let j = k(x); j < k(x + 0.3); j++) env[j] = Math.max(env[j]!, 0.03 * (1 + 0.3 * (r() - 0.5)));
      }
      paroles.push({ ts: Math.round(t * 100) / 100, fin: Math.round(fin * 100) / 100, p: p === 0 ? 'p1' : 'p2' });
      p = 1 - p;
      t = fin + (vite ? 0.3 : 1.8 + 1.5 * r());
    }
  }
  const rire = (t0: number, dur: number, fort: number) => {
    for (let j = k(t0); j < k(t0 + dur); j++) env[j] = fort * (0.55 + 0.45 * Math.sin(2 * Math.PI * 5 * (j * PAS - t0)));
  };
  const cri = (t0: number, dur: number) => {
    for (let j = k(t0); j < k(t0 + dur); j++) env[j] = 0.4 * (1 + 0.05 * (r() - 0.5));
  };
  const motFort = (t: number, txt: string) => mots.push([txt, t, t + 0.4, 1]);
  rire(150, 3.5, 0.2);
  cri(400, 1.5);
  rire(402, 2, 0.15);
  rire(900, 3.5, 0.2);
  cri(1000, 1.2);
  rire(1001.6, 2, 0.15);
  for (let j = k(1244); j < k(1249.9); j++) env[j] = 0.005; // calme…
  for (let j = k(1250); j < k(1250.3); j++) env[j] = 0.6; // …puis gros pic
  cri(1400, 1.5);
  motFort(1400.2, 'putain');
  rire(1600, 2, 0.15);
  motFort(1599, 'NON');
  motFort(1602.5, 'incroyable');
  rire(1700, 3.2, 0.2);
  rire(1505, 2, 0.15);
  mots.sort((x, y) => x[1] - y[1]);
  return { signaux: signauxDepuisEnveloppe('s1', DUREE_SESSION, PAS, env), mots, paroles, plantes: PLANTES, scenes: SCENES.map(([de, a]) => ({ de, a })) };
}

/* ------------------------------------------------------------------ Best-of v4 (dev-scenes) : une session de 2 h */

const SYLLABES = ['ba', 'ko', 'di', 'mu', 'ze', 'ra', 'lo', 'ti', 'fe', 'nu'];

/**
 * Le i-ème mot inventé (« baba », « koba »…), tous différents : une même suite de mots répétée serait une BOUCLE de
 * Whisper, que les séquences et les punchlines ne prennent pas (motsDouteux).
 */
export function motFictif(i: number): string {
  return String(Math.max(0, Math.floor(i)))
    .padStart(2, '0')
    .split('')
    .map((c) => SYLLABES[Number(c)]!)
    .join('');
}

/** Un moment fort planté dans la session de 2 h : son sommet et son bloc de 20 min. */
export interface MomentPlante {
  t: number;
  bloc: number;
}

export interface SessionLongue {
  entree: EntreeSequences;
  /** Les moments forts plantés (2 par bloc, au milieu d'un échange). */
  plantes: MomentPlante[];
  /** Les échanges de parole fabriqués : [début, fin]. */
  echanges: [number, number][];
  /** Morceaux gardés par les « coupes » de la session (paroles ± 0,25 / 0,35 s, fusionnés sous 0,5 s). */
  morceaux: PlageTemps[];
}

export const DUREE_LONGUE = 7200;
/** Passage muet planté (fin d'enregistrement AFK) : aucune histoire ne doit y tomber. */
export const MUET_LONG: PlageTemps = { de: 6300, a: 6700 };

/** Coupes simples (comme la DA) : chaque parole ± 0,25 s avant / 0,35 s après, fusion sous 0,5 s. */
export function coupesSimples(paroles: readonly PlageTemps[]): PlageTemps[] {
  const res: PlageTemps[] = [];
  for (const p of [...paroles].sort((x, y) => x.de - y.de)) {
    const m = { de: Math.max(0, p.de - 0.25), a: p.a + 0.35 };
    const der = res[res.length - 1];
    if (der && m.de - der.a < 0.5) der.a = Math.max(der.a, m.a);
    else res.push(m);
  }
  return res;
}

/** dureeDe d'après des morceaux : la même découpe que le montage (decoupe.ts → morceauxDans, morceaux ≥ 0,35 s). */
export function dureeDeMorceaux(morceaux: readonly PlageTemps[]): (plages: readonly PlageTemps[]) => number {
  const r = ranger(morceaux);
  return (plages) => Math.round(plages.reduce((t, p) => t + morceauxDans(p.de, p.a, r, 0.35).parts.reduce((s, x) => s + x.a - x.de, 0), 0) * 100) / 100;
}

/**
 * Session de jeu FABRIQUÉE de 2 h (toujours la même) : des échanges de 20 à 45 s (phrases de 4 à 8 mots, 2 voix en
 * alternance) séparés de 8 à 25 s de jeu, un passage muet, des moments faibles partout (force 0,1 à 0,3) et 2 moments
 * forts (force 0,8 à 1) plantés dans CHAQUE bloc de 20 min. `forteEgale` : tous les forts à la même force (le
 * départage ne doit pas suivre l'ordre chronologique).
 */
export function sessionLongue(o: { forteEgale?: boolean; dureeVisee?: number; voix?: boolean } = {}): SessionLongue {
  const r = hasard(11);
  const mots: Mot[] = [];
  const segments: SegmentParole[] = [];
  const tours: TourDeParole[] = [];
  const echanges: [number, number][] = [];
  let t = 15;
  while (t < DUREE_LONGUE - 60) {
    if (t >= MUET_LONG.de - 50 && t < MUET_LONG.a) {
      t = MUET_LONG.a + 10;
      continue;
    }
    const fin = t + 20 + 25 * r();
    const debut = t;
    let p = 0;
    while (t < fin) {
      const n = 4 + Math.floor(5 * r());
      const d0 = t;
      for (let i = 0; i < n; i++) {
        mots.push([i === 0 ? 'alors' : motFictif(mots.length), Math.round(t * 100) / 100, Math.round((t + 0.3) * 100) / 100]);
        t += 0.4;
      }
      segments.push({ de: Math.round(d0 * 100) / 100, a: Math.round((t - 0.1) * 100) / 100, p: 0.9 });
      tours.push({ ts: Math.round(d0 * 100) / 100, fin: Math.round((t - 0.1) * 100) / 100, p: p === 0 ? 'p1' : 'p2' });
      p = 1 - p;
      t += 0.8 + 0.6 * r();
    }
    echanges.push([Math.round(debut * 100) / 100, Math.round(t * 100) / 100]);
    t += 8 + 17 * r();
  }
  // Moments : faibles partout, 2 forts par bloc (au milieu d'un échange de chaque moitié du bloc).
  const moments: MomentV4[] = [];
  for (const [de, a] of echanges) {
    const tm = de + (a - de) * 0.4;
    moments.push({ de: tm, a: tm + 0.8, t: tm, genre: 'exclamation', force: Math.round((0.1 + 0.2 * r()) * 100) / 100, indices: ['test'] });
  }
  const plantes: MomentPlante[] = [];
  const actif = (x: number) => (x < MUET_LONG.de ? x : x - (Math.min(x, MUET_LONG.a) - MUET_LONG.de));
  for (let b = 0; b < 6; b++) {
    for (const quart of [0.3, 0.75]) {
      const cible = b * 1200 + quart * 1200;
      const ex = echanges.find(([de]) => actif(de) >= cible) ?? echanges[echanges.length - 1]!;
      const tm = Math.round((ex[0] + (ex[1] - ex[0]) * 0.6) * 100) / 100;
      const genre = quart < 0.5 ? 'cri' : 'fouRire';
      moments.push({ de: tm, a: tm + 1.5, t: tm, genre, force: o.forteEgale ? 0.9 : Math.round((0.8 + 0.2 * r()) * 100) / 100, indices: ['planté'] });
      plantes.push({ t: tm, bloc: Math.min(5, Math.floor(actif(tm) / 1200)) });
    }
  }
  moments.sort((x, y) => x.t - y.t);
  const parole: ParoleDetectee = { src: 's1', methode: 'vad', segments, probas: null, part: segments.reduce((s, x) => s + x.a - x.de, 0) / DUREE_LONGUE };
  const n = Math.round(DUREE_LONGUE / PAS);
  const env = new Float32Array(n).fill(0.01);
  for (let k = Math.round(MUET_LONG.de / PAS); k < Math.round(MUET_LONG.a / PAS); k++) env[k] = 0;
  const signaux: SignauxSource = { src: 's1', duree: DUREE_LONGUE, pas: PAS, rms: env, pics: [], cris: [], rires: [], muets: [{ ...MUET_LONG }] };
  const morceaux = coupesSimples(segments);
  const voix: VoixDetecteesV4 | null = o.voix
    ? {
        src: 's1',
        methode: 'niveau+timbre',
        voix: [{ id: 'p1', niveauDb: -25, part: 0.5 }, { id: 'p2', niveauDb: -40, part: 0.5 }],
        tours,
        sure: 0.95,
        separation: { par: 'niveau', seuilDb: -32, ecartDb: 15, cosinusCentres: null, ambigu: 0, morceaux: tours.length, proposerEmpreinte: null },
      }
    : null;
  const entree: EntreeSequences = { src: 's1', duree: DUREE_LONGUE, mots, parole, moments, voix, signaux, dureeVisee: o.dureeVisee ?? 1044, dureeDe: dureeDeMorceaux(morceaux) };
  return { entree, plantes, echanges, morceaux };
}
