// Tests des moments v4 (dev-moments) : une session FABRIQUÉE (2 voix à −20 / −32 dB, jeu, rire, cri, échanges) ;
// aucun fichier, aucun modèle, aucune donnée de la vraie session.
import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import type { SignauxSource } from '../types';
import type { EntreeMoments, MomentV4, ParoleDetectee, VoixDetecteesV4 } from '../types-v4';
import { signauxAvecMoments, trouverMomentsV4 } from './moments';
import { forcesRelatives, motsDouteux, REGLES_MOMENTS, trouverMoments } from './regles';

const PAS = 0.02;

interface TourPlan {
  v: 0 | 1;
  de: number;
  a: number;
  /** Mots de Whisper sur ce tour (sinon : voix sans mots). */
  mots: boolean;
  /** Hauteur × la sienne, dB au-dessus de son niveau, modulation du volume (Hz). */
  f0x?: number;
  dbPlus?: number;
  modHz?: number;
}

const NIVEAU = [-20, -32]; // p1 = Guts (fort), p2 = Romain (faible)
const F0 = [105, 120];

/** Tours ordinaires : 3 tours de 2,5 s de la même voix, puis l'autre (≈ 1 changement toutes les 9 s), en évitant `trous`. */
function toursOrdinaires(duree: number, trous: readonly [number, number][]): TourPlan[] {
  const res: TourPlan[] = [];
  let t = 5;
  let n = 0;
  while (t + 2.5 < duree - 5) {
    const libre = !trous.some(([a, b]) => t < b + 1 && t + 2.5 > a - 1);
    if (libre) res.push({ v: (Math.floor(n / 3) % 2) as 0 | 1, de: t, a: t + 2.5, mots: true });
    n++;
    t += 3;
  }
  return res;
}

interface Fabrique {
  duree: number;
  tours: TourPlan[];
  /** Sons du jeu (sans voix) : de, a, niveau dB. */
  jeu?: { de: number; a: number; db: number }[];
  pics?: { ts: number; db: number; z: number }[];
  sure?: number;
  sansMots?: boolean;
  sansHauteur?: boolean;
}

function fabriquer(f: Fabrique): EntreeMoments {
  const n = Math.ceil(f.duree / PAS);
  const db = new Float32Array(n).fill(-75);
  const rms = new Float32Array(n);
  const f0 = new Float32Array(n);
  const nP = Math.ceil(f.duree / 0.032);
  const p = new Uint8Array(nP);
  const mots: Mot[] = [];
  for (const x of f.tours) {
    const hz = x.modHz ?? 5;
    for (let k = Math.floor(x.de / PAS); k < Math.min(n, Math.ceil(x.a / PAS)); k++) {
      const t = k * PAS;
      db[k] = NIVEAU[x.v]! + (x.dbPlus ?? 0) + 6 * Math.sin(2 * Math.PI * hz * (t - x.de));
      f0[k] = k % 10 === 9 ? 0 : F0[x.v]! * (x.f0x ?? 1) * (1 + 0.02 * Math.sin(k));
    }
    for (let c = Math.floor(x.de / 0.032); c < Math.min(nP, Math.ceil(x.a / 0.032)); c++) p[c] = 230;
    if (x.mots && !f.sansMots) for (let t = x.de + 0.05; t + 0.25 <= x.a; t += 0.3) mots.push(['mot', Math.round(t * 100) / 100, Math.round((t + 0.25) * 100) / 100]);
  }
  for (const j of f.jeu ?? []) for (let k = Math.floor(j.de / PAS); k < Math.min(n, Math.ceil(j.a / PAS)); k++) db[k] = j.db;
  for (let k = 0; k < n; k++) rms[k] = 10 ** (db[k]! / 20);
  const segments = f.tours.map((x) => ({ de: x.de, a: x.a, p: 0.9 })).sort((x, y) => x.de - y.de);
  const parole: ParoleDetectee = {
    src: 's',
    methode: 'vad',
    segments,
    probas: { src: 's', pas: 0.032, p, plages: [{ de: 0, a: f.duree }], modele: 'silero-vad-v5' },
    part: segments.reduce((s, x) => s + x.a - x.de, 0) / f.duree,
  };
  const voix: VoixDetecteesV4 = {
    src: 's',
    methode: 'niveau+timbre',
    voix: [
      { id: 'p1', niveauDb: NIVEAU[0]!, part: 0.5 },
      { id: 'p2', niveauDb: NIVEAU[1]!, part: 0.5 },
    ],
    tours: f.tours.map((x) => ({ ts: x.de, fin: x.a, p: x.v === 0 ? 'p1' : 'p2', sur: true })),
    sure: f.sure ?? 0.95,
    separation: { par: 'niveau', seuilDb: -26, ecartDb: 12, cosinusCentres: null, ambigu: 0, morceaux: f.tours.length, proposerEmpreinte: null },
  };
  const signaux: SignauxSource = { src: 's', duree: f.duree, pas: PAS, rms, pics: f.pics ?? [], cris: [], rires: [], muets: [] };
  return { signaux, parole, mots: f.sansMots ? [] : mots, voix, energie: { pas: PAS, db }, hauteur: f.sansHauteur ? null : { pas: PAS, f0 } };
}

const RIRE: TourPlan = { v: 1, de: 300, a: 302.2, mots: false, f0x: 1.3, dbPlus: 1, modHz: 4.5 };
const CRI: TourPlan = { v: 1, de: 400, a: 401.4, mots: true, f0x: 1.45, dbPlus: 9 };
const ECHANGES: TourPlan[] = Array.from({ length: 8 }, (_, i) => ({ v: (i % 2) as 0 | 1, de: 500 + i * 1.4, a: 500 + i * 1.4 + 1.2, mots: true }));
const JEU = { de: 450, a: 451, db: -8 };
const TROUS: [number, number][] = [
  [RIRE.de, RIRE.a],
  [CRI.de, CRI.a],
  [JEU.de, JEU.a],
  [500, 512],
];

function session(o: Partial<Fabrique> = {}): EntreeMoments {
  const duree = 600;
  const tours = [...toursOrdinaires(duree, TROUS), RIRE, CRI, ...ECHANGES].sort((x, y) => x.de - y.de);
  return fabriquer({ duree, tours, jeu: [JEU], pics: [{ ts: 450, db: -8, z: 8 }], ...o });
}

const dans = (m: MomentV4, de: number, a: number) => m.de < a && m.a > de;
const rires = (ms: MomentV4[]) => ms.filter((m) => m.genre === 'rire' || m.genre === 'fouRire');

describe('trouverMoments (session fabriquée)', () => {
  const ms = trouverMomentsV4(session());

  it('trouve le rire fabriqué (voix sans mots, plus aiguë, hachée) et sait qui rit', () => {
    const r = rires(ms).filter((m) => dans(m, RIRE.de, RIRE.a));
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0]!.p).toBe('p2');
    expect(r[0]!.indices.some((x) => x.startsWith('voix sans mots'))).toBe(true);
  });

  it('ne prend pas la parole ordinaire à 5 Hz (avec des mots) pour un rire', () => {
    const autres = rires(ms).filter((m) => !dans(m, RIRE.de - 0.5, RIRE.a + 0.5));
    expect(autres).toEqual([]);
  });

  it('trouve le cri de la voix FAIBLE (+ 9 dB sur SA voix, encore sous le niveau de la voix forte)', () => {
    const c = ms.filter((m) => m.genre === 'cri' && dans(m, CRI.de, CRI.a));
    expect(c.length).toBeGreaterThanOrEqual(1);
    expect(c[0]!.p).toBe('p2');
    // La parole ordinaire de la voix forte (−20 dB, plus forte que ce cri) n'est jamais un cri.
    expect(ms.filter((m) => m.genre === 'cri' && !dans(m, CRI.de - 0.5, CRI.a + 0.5))).toEqual([]);
  });

  it('un son fort du jeu (sans voix) n\'est pas un cri, mais un son fort', () => {
    expect(ms.filter((m) => (m.genre === 'cri' || m.genre === 'rire') && dans(m, JEU.de - 0.5, JEU.a + 0.5))).toEqual([]);
    expect(ms.some((m) => (m.genre === 'sonFort' || m.genre === 'calmePuisPic') && dans(m, JEU.de - 0.5, JEU.a + 0.5))).toBe(true);
  });

  it('trouve les échanges rapides seulement si les voix sont sûres', () => {
    expect(ms.filter((m) => m.genre === 'echanges' && dans(m, 500, 512)).length).toBe(1);
    expect(ms.filter((m) => m.genre === 'echanges' && !dans(m, 499, 513))).toEqual([]);
    expect(trouverMoments(session({ sure: 0.5 })).filter((m) => m.genre === 'echanges')).toEqual([]);
  });

  it('rend des moments triés, des forces entre 0 et 1, et au plus 1,5 rire par minute de parole', () => {
    for (let i = 1; i < ms.length; i++) expect(ms[i]!.t).toBeGreaterThanOrEqual(ms[i - 1]!.t);
    for (const m of ms) {
      expect(m.force).toBeGreaterThanOrEqual(0);
      expect(m.force).toBeLessThanOrEqual(1);
      expect(m.indices.length).toBeGreaterThan(0);
    }
    const parole = session().parole.segments.reduce((s, x) => s + x.a - x.de, 0) / 60;
    expect(rires(ms).length).toBeLessThanOrEqual(Math.max(1, Math.floor(1.5 * parole)));
  });

  it('sans aucun mot (mode voix) : le rire haché et aigu est trouvé, la parole ordinaire non', () => {
    const v = trouverMoments(session({ sansMots: true }));
    expect(rires(v).some((m) => dans(m, RIRE.de, RIRE.a))).toBe(true);
    expect(rires(v).filter((m) => !dans(m, RIRE.de - 0.5, RIRE.a + 0.5))).toEqual([]);
  });

  it('sans la hauteur : les règles marchent encore (le cri par le niveau de SA voix)', () => {
    const v = trouverMoments(session({ sansHauteur: true }));
    expect(v.some((m) => m.genre === 'cri' && dans(m, CRI.de, CRI.a))).toBe(true);
  });

  it('sans parole ni voix : seulement les sons, sans erreur', () => {
    const e = session();
    const vide: EntreeMoments = { ...e, parole: { ...e.parole, segments: [], probas: null, part: 0 }, mots: [], voix: null };
    const v = trouverMoments(vide);
    expect(v.every((m) => m.genre === 'sonFort' || m.genre === 'calmePuisPic')).toBe(true);
  });

  it('signauxAvecMoments donne aux anciens lecteurs les rires / cris v4', () => {
    const s = signauxAvecMoments(session().signaux, ms);
    expect(s.rires.length).toBe(rires(ms).length);
    expect(s.cris.length).toBe(ms.filter((m) => m.genre === 'cri').length);
  });
});

describe('forcesRelatives', () => {
  it('force = poids du genre × rang dans le genre (rire et fou rire ensemble)', () => {
    const f = forcesRelatives([
      { genre: 'rire', note: 0.5, t: 1 },
      { genre: 'fouRire', note: 0.9, t: 2 },
      { genre: 'cri', note: 0.7, t: 3 },
      { genre: 'rire', note: 0.6, t: 4 },
    ]);
    const P = REGLES_MOMENTS.poids;
    expect(f[1]).toBeCloseTo(P.fouRire * 1, 3);
    expect(f[2]).toBeCloseTo(P.cri * 1, 3);
    expect(f[0]).toBeCloseTo(P.rire * (1 / 3), 3);
    expect(f[3]).toBeCloseTo(P.rire * (2 / 3), 3);
  });
});

describe('motsDouteux (hallucinations de Whisper)', () => {
  const mot = (txt: string, t: number, d = 0.2): Mot => [txt, t, t + d];
  it('une suite de mots répétée, une phrase toute faite, une pile', () => {
    const repete = 'on y va on y va'.split(' ').map((w, i) => mot(w, 10 + i * 0.3));
    const invite = 'je vous invite à vous abonner'.split(' ').map((w, i) => mot(w, 30 + i * 0.3));
    const pile = [mot('a', 50, 0.01), mot('b', 50.01, 0.01), mot('c', 50.03, 0.01)];
    const normal = 'attends il y a un creeper derrière toi'.split(' ').map((w, i) => mot(w, 70 + i * 0.3));
    const d = motsDouteux([...repete, ...invite, ...pile, ...normal]);
    expect(Array.from(d.subarray(0, repete.length)).every((x) => x === 1)).toBe(true);
    expect(Array.from(d.subarray(repete.length, repete.length + 3))).toEqual([1, 1, 1]);
    expect(Array.from(d.subarray(repete.length + invite.length, repete.length + invite.length + 3))).toEqual([1, 1, 1]);
    expect(Array.from(d.subarray(repete.length + invite.length + 3)).every((x) => x === 0)).toBe(true);
  });
});
