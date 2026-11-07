// Tests de l'émotion et de la bouche v4 d'une phrase (dev-persos) : moments v4, seuils RELATIFS à la voix de la
// personne (la voix faible crie aussi), bouche fermée sur un son du jeu (VAD), index des mots. Données fabriquées.
import { describe, expect, it } from 'vitest';
import type { SignauxSource } from '../auto/types';
import type { MomentV4, ProbasVad } from '../auto/types-v4';
import type { Mot, TourDeParole } from '../recette/types';
import { bitsBouche, boucheOuverte } from './bouche';
import { emotionDuTour } from './emotions';
import { bitsBoucheV4, completerToursV4, emotionDuTourV4, IndexMots, REGLES_EMOTION_V4 } from './emotions-v4';

const DUREE = 30;

/** Énergie de la bande voix (20 ms) : −70 dB partout, `db` sur les plages données. */
function energie(plages: [number, number, number][]): { pas: number; db: Float32Array } {
  const v = new Float32Array(Math.round(DUREE / 0.02)).fill(-70);
  for (const [a, b, db] of plages) for (let i = Math.round(a / 0.02); i < Math.round(b / 0.02); i++) v[i] = db;
  return { pas: 0.02, db: v };
}

/** Probabilités de voix (32 ms) : 1 sur les plages données, 0 ailleurs. */
function vad(plages: [number, number][]): ProbasVad {
  const p = new Uint8Array(Math.ceil(DUREE / 0.032));
  for (const [a, b] of plages) for (let k = Math.floor(a / 0.032); k < Math.ceil(b / 0.032); k++) p[k] = 255;
  return { src: 's1', pas: 0.032, p, plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' };
}

const signaux = (o: Partial<SignauxSource> = {}): SignauxSource => ({
  src: 's1', duree: DUREE, pas: 0.02, rms: new Float32Array(DUREE * 50).fill(10 ** (-40 / 20)), pics: [], cris: [], rires: [], muets: [], ...o,
});

const moment = (genre: MomentV4['genre'], de: number, a: number, o: Partial<MomentV4> = {}): MomentV4 => ({ genre, de, a, t: (de + a) / 2, force: 0.5, indices: [], ...o });
const tour = (ts: number, fin: number, p = 'p2'): TourDeParole => ({ ts, fin, p });

describe('emotionDuTourV4 : moments v4 puis mots, seuils relatifs à la voix', () => {
  const env = energie([[2, 4, -32]]);
  const base = { env, niveau: -32, moments: [] as MomentV4[], signaux: signaux() };

  it('rire → rit ; fou rire, rire fort ou long → mort de rire ; moment d\'une autre voix ignoré', () => {
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, moments: [moment('rire', 2.5, 3.2)] })).toBe('rit');
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, moments: [moment('fouRire', 2.2, 3.9)] })).toBe('mortDeRire');
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, moments: [moment('rire', 2.2, 3, { force: 0.8 })] })).toBe('mortDeRire');
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, moments: [moment('rire', 2.5, 3.2, { p: 'p1' })] })).toBe('parle');
    // Un moment qui ne fait que frôler la phrase (sommet dehors, < 0,3 s et < 50 % dedans) ne compte pas.
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, moments: [moment('rire', 3.9, 5, { t: 4.6 })] })).toBe('parle');
  });

  it('cri de la voix FAIBLE → crie ; « hurle » (indice du moment ; sans indices : ≥ +12 dB sur SA voix) → hurle', () => {
    // −32 dB : la v3 (−6 dBFS absolu) n'y voit jamais un hurlement ; ici +6 dB sur sa voix = un cri, pas un hurlement.
    const fort = energie([[2, 4, -32], [2.8, 3.4, -26]]);
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, env: fort, moments: [moment('cri', 2.8, 3.4)] })).toBe('crie');
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, moments: [moment('cri', 2.8, 3.4, { indices: ['hurle (+15 dB)'] })] })).toBe('hurle');
    const tresFort = energie([[2, 4, -32], [2.8, 3.4, -19]]);
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, env: tresFort, moments: [moment('cri', 2.8, 3.4)] })).toBe('hurle');
    // Les indices du moment font foi : « +9 dB » sans « hurle » → crie, même si l'énergie est haute.
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, env: tresFort, moments: [moment('cri', 2.8, 3.4, { indices: ['+9 dB sur sa voix'] })] })).toBe('crie');
    // Un cri doux (+6 dB sur sa voix, sous les + 8 dB du contrat) ne fait pas crier le perso.
    expect(emotionDuTourV4(tour(2, 4), [], { ...base, moments: [moment('cri', 2.8, 3.4, { indices: ['+6 dB sur sa voix'] })] })).toBe('parle');
    expect(REGLES_EMOTION_V4.criDb).toBe(8);
  });

  it('juron dit fort RELATIF : la voix faible (−32 dB) qui jure à −28 dB est énervée (la v3 ne le voyait pas)', () => {
    const env2 = energie([[2, 4, -32], [3, 3.4, -28]]);
    const mots: Mot[] = [['oh', 2.2, 2.5], ['putain', 3, 3.4]];
    expect(emotionDuTourV4(tour(2, 4), mots, { ...base, env: env2 })).toBe('enerve');
    // La v3 : signaux RMS du mélange à −28 dBFS < −16 dBFS → pas de juron « fort ».
    expect(emotionDuTour(tour(2, 4), mots, signaux({ rms: new Float32Array(DUREE * 50).fill(10 ** (-28 / 20)) }))).toBe('parle');
    // Le même juron dit doucement (sous son niveau + 3 dB) : « parle » ; deux jurons forts : rage.
    expect(emotionDuTourV4(tour(2, 4), mots, base)).toBe('parle');
    const deux: Mot[] = [['putain', 2.2, 2.6], ['merde', 3, 3.4]];
    expect(emotionDuTourV4(tour(2, 4), deux, { ...base, env: energie([[2, 4, -27]]) })).toBe('rage');
  });

  it('surpris après un calme, choqué sur un pic ; frime, moqueur ; panique dite fort ; sinon parle', () => {
    const calme = energie([[2, 4, -30]]);
    expect(emotionDuTourV4(tour(2, 4), [['quoi', 2.1, 2.4]], { ...base, env: calme })).toBe('surpris');
    expect(emotionDuTourV4(tour(2, 4), [['quoi', 2.1, 2.4]], { ...base, env: calme, signaux: signaux({ pics: [{ ts: 2.5, db: -6, z: 7 }] }) })).toBe('choque');
    expect(emotionDuTourV4(tour(2, 4), [['gg', 2.1, 2.4]], base)).toBe('frime');
    expect(emotionDuTourV4(tour(2, 4), [['noob', 2.1, 2.4]], base)).toBe('moqueur');
    expect(emotionDuTourV4(tour(2, 4), [['vite', 2.1, 2.4]], { ...base, env: energie([[2, 4, -28]]) })).toBe('panique');
    expect(emotionDuTourV4(tour(2, 4), [['vite', 2.1, 2.4]], base)).toBe('parle');
    expect(emotionDuTourV4(tour(2, 4), [['on', 2.1, 2.4], ['y', 2.5, 2.6], ['va', 2.7, 3]], base)).toBe('parle');
  });

  it('règles chiffrées exposées (tests et banc)', () => {
    expect(REGLES_EMOTION_V4.hurleDb).toBeGreaterThan(REGLES_EMOTION_V4.forteDb);
  });
});

describe('bouche v4 : ouverte seulement quand la VAD entend parler', () => {
  // La voix de 2 à 4 s, un son du jeu (explosion) de 5 à 6 s, aussi fort que la voix.
  const env = energie([[2, 4, -30], [5, 6, -25]]);
  const v = vad([[2, 4]]);
  it('son du jeu : la v3 ouvre la bouche, la v4 non ; sur la voix : les deux', () => {
    const t = tour(1.5, 6.5);
    const v3 = { ...t, b: bitsBouche(env, t.ts, t.fin, -42) };
    const v4 = { ...t, b: bitsBoucheV4(env, v, t.ts, t.fin, -42) };
    expect(boucheOuverte(v3, 5.5)).toBe(true);
    expect(boucheOuverte(v4, 5.5)).toBe(false);
    expect(boucheOuverte(v3, 3)).toBe(true);
    expect(boucheOuverte(v4, 3)).toBe(true);
    expect(boucheOuverte(v4, 1.7)).toBe(false);
  });
  it('sans VAD : comme la v3 (énergie seule) ; même format de bits', () => {
    expect(bitsBoucheV4(env, null, 1.5, 6.5, -42)).toBe(bitsBouche(env, 1.5, 6.5, -42));
  });
});

describe('completerToursV4', () => {
  it('émotion + situation + bouche, seuil = niveau de LA personne − 10 dB (voix faible et voix forte)', () => {
    // Romain (p2) à −32 dB de 2 à 4 s ; Guts (p1) à −20 dB de 5 à 7 s ; du jeu à −27 dB de 8 à 9 s (sans voix).
    const env = energie([[2, 4, -32], [5, 7, -20], [8, 9, -27]]);
    const v = vad([[2, 4], [5, 7]]);
    const mots: Mot[] = [['la', 2.2, 2.4], ['tnt', 2.5, 2.9], ['explose', 3, 3.5], ['gg', 5.2, 5.6]];
    const tours = [tour(2, 4, 'p2'), tour(5, 7.5, 'p1'), tour(7.6, 9.2, 'p1')];
    const res = completerToursV4(tours, { enveloppe: () => env, mots, signaux: signaux(), niveaux: { p1: -20, p2: -32 }, vad: v, moments: [moment('cri', 2.6, 3.2, { p: 'p2' })] });
    expect(res.map((t) => t.emo)).toEqual(['crie', 'frime', 'parle']);
    expect(res[0]!.sit).toBe('bombe');
    // Bouche de Romain ouverte à −32 dB (seuil −42) ; celle de Guts fermée sur le jeu à −27 dB (VAD 0).
    expect(boucheOuverte(res[0]!, 3)).toBe(true);
    expect(boucheOuverte(res[1]!, 6)).toBe(true);
    expect(boucheOuverte(res[2]!, 8.5)).toBe(false);
    // Les tours d'origine ne sont pas modifiés.
    expect(tours[0]).toEqual(tour(2, 4, 'p2'));
  });
});

describe('IndexMots', () => {
  it('mots qui touchent un passage, et mots dont le milieu y est (même non triés)', () => {
    const mots: Mot[] = [['c', 5, 5.4], ['a', 1, 1.2], ['b', 2, 3.5], ['d', 9, 9.1]];
    const ix = new IndexMots(mots);
    expect(ix.entre(3, 5.1).map((m) => m[0])).toEqual(['b', 'c']);
    expect(ix.milieuDans(2.5, 5.3).map((m) => m[0])).toEqual(['b', 'c']);
    expect(ix.milieuDans(2.8, 5.3).map((m) => m[0])).toEqual(['c']);
    expect(new IndexMots([]).entre(0, 10)).toEqual([]);
  });
});
