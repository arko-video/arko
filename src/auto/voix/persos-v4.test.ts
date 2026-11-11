// Tests de l'étape « persos » v4 (dev-persos) : phrases (tours recoupés aux fins de phrase), perso 0,1 s avant et
// 0,35 s après comme la DA, mots ratés rattachés, émotion par phrase (cri de la voix faible), bouche fermée sur le
// jeu, p1 à gauche / p2 à droite, « Sous-titres pour » la voix faible (mode mots seulement). Données fabriquées.
import { describe, expect, it } from 'vitest';
import { boucheOuverte } from '../../chibis/bouche';
import { avatarsAuTemps, placerAvatars } from '../../moteur/couches/avatars';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import { definirSousTitres } from '../../recette/operations-habillage';
import { choisirModeSousTitres, definirPunchlines } from '../../recette/operations-habillage-auto';
import { SOUS_TITRES_VOIX } from '../../recette/sous-titres-voix';
import type { Mot, Recette, TourDeParole } from '../../recette/types';
import type { SignauxSource } from '../types';
import type { EntreePersos, MomentV4, ParoleDetectee, VoixDetecteesV4 } from '../types-v4';
import { PERSOS_V4, phrasesDesTours, poserPersosV4, voixDesMotsParNiveau } from './persos-v4';

const DUREE = 60;

function energie(plages: [number, number, number][], fond = -70): { pas: number; db: Float32Array; duree: number; bandes: Float32Array } {
  const v = new Float32Array(Math.round(DUREE / 0.02)).fill(fond);
  for (const [a, b, db] of plages) for (let i = Math.round(a / 0.02); i < Math.round(b / 0.02); i++) v[i] = db;
  return { pas: 0.02, db: v, duree: DUREE, bandes: new Float32Array(v.length * 8) };
}

function parole(plages: [number, number][]): ParoleDetectee {
  const p = new Uint8Array(Math.ceil(DUREE / 0.032));
  for (const [a, b] of plages) for (let k = Math.floor(a / 0.032); k < Math.ceil(b / 0.032); k++) p[k] = 255;
  return { src: 's1', methode: 'vad', segments: plages.map(([de, a]) => ({ de, a, p: 1 })), probas: { src: 's1', pas: 0.032, p, plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' }, part: 0.3 };
}

const T = (ts: number, fin: number, p: string): TourDeParole => ({ ts, fin, p });

describe('phrasesDesTours', () => {
  it('coupe aux fins de phrase (ponctuation, trou > 0,6 s entre deux mots), au creux de la voix', () => {
    const mots: Mot[] = [['on', 2, 2.3], ['y', 2.4, 2.5], ['va.', 2.6, 3], ['attends', 3.3, 3.8], ['ici', 3.9, 4.2], ['regarde', 5, 5.6]];
    const env = energie([[2, 3, -20], [3.1, 3.15, -25], [3.2, 3.24, -46], [3.3, 4.2, -20], [5, 5.6, -20]], -40);
    const ph = phrasesDesTours([T(2, 5.6, 'p1')], { mots, energie: env });
    expect(ph).toHaveLength(3);
    // 1re coupe entre « va. » (3,0) et « attends » (3,3), au point le plus calme : pas dans la bosse de 3,1–3,15.
    expect(ph[0]!.fin).toBeGreaterThan(3);
    expect(ph[0]!.fin).toBeLessThan(3.3);
    expect(ph[0]!.fin).toBeCloseTo(3.21, 2);
    // 2ᵉ coupe dans le trou de 0,8 s (4,2 → 5,0) ; les phrases se suivent sans trou (le perso ne disparaît pas).
    expect(ph[1]!.ts).toBe(ph[0]!.fin);
    expect(ph[1]!.fin).toBeGreaterThan(4.2);
    expect(ph[1]!.fin).toBeLessThan(5);
    expect(ph[2]!.fin).toBe(5.6);
    expect(ph[0]!.ts).toBeCloseTo(1.9, 6); // 0,1 s avant
  });

  it('une phrase trop longue (sans mots) est coupée au creux ; jamais de phrase de moins de 0,5 s', () => {
    // 13 s de voix continue, des creux à 4,5 s et 9 s.
    const env = energie([[10, 23, -20], [14.5, 14.6, -50], [19, 19.1, -50]]);
    const ph = phrasesDesTours([T(10, 23, 'p1')], { energie: env });
    expect(ph.length).toBeGreaterThanOrEqual(3);
    for (const x of ph) expect(x.fin - x.ts).toBeLessThanOrEqual(PERSOS_V4.longueMax + PERSOS_V4.avant + 1e-6);
    expect(ph.some((x) => Math.abs(x.fin - 14.55) < 0.06)).toBe(true);
    // Ponctuation à 0,2 s du début : la coupe est abandonnée (phrase trop courte).
    const court = phrasesDesTours([T(30, 33, 'p1')], { mots: [['oh.', 30, 30.2], ['non', 30.3, 30.6], ['pas', 31, 31.3]] });
    expect(court).toHaveLength(1);
  });

  it('apparition 0,1 s avant, sans repasser sur la phrase d\'avant de la même voix ; 0,9 s visible au moins', () => {
    const ph = phrasesDesTours([T(2, 3, 'p1'), T(3.05, 4, 'p1'), T(10, 10.2, 'p2'), T(10.3, 11, 'p1')]);
    const p1 = ph.filter((x) => x.p === 'p1');
    expect(p1[0]!.ts).toBeCloseTo(1.9, 6);
    expect(p1[1]!.ts).toBeCloseTo(3, 6);
    // 0,2 s de parole : prolongée jusqu'à 0,9 − 0,35 = 0,55 s après le début… mais pas sur la phrase de p1 à 10,3 → 10,2 (0,1 s avant).
    const p2 = ph.find((x) => x.p === 'p2')!;
    expect(p2.ts).toBeCloseTo(9.9, 6);
    expect(p2.fin).toBeCloseTo(10.2, 6);
    const seul = phrasesDesTours([T(20, 20.2, 'p2')]);
    expect(seul[0]!.fin - seul[0]!.ts).toBeCloseTo(PERSOS_V4.montreMin - PERSOS_V4.tenue, 6);
  });

  it('pont : deux phrases proches de la même voix se rejoignent, pas si quelqu\'un parle entre elles', () => {
    const a = phrasesDesTours([T(2, 3, 'p1'), T(3.6, 4.5, 'p1')]);
    expect(a[0]!.fin).toBe(a[1]!.ts);
    const b = phrasesDesTours([T(2, 3, 'p1'), T(3.1, 3.6, 'p2'), T(3.7, 4.5, 'p1')]);
    expect(b.find((x) => x.p === 'p1')!.fin).toBe(3);
  });

  it('un mot que la VAD a ratée est rattaché au tour voisin (< 0,6 s), pas sur la voix d\'à côté', () => {
    const ph = phrasesDesTours([T(2, 3, 'p2'), T(5, 6, 'p1')], { mots: [['hein', 3.3, 3.6], ['bon', 4.7, 4.95]] });
    expect(ph.find((x) => x.p === 'p2')!.fin).toBeCloseTo(3.6, 6);
    expect(ph.find((x) => x.p === 'p1')!.ts).toBeCloseTo(4.6, 6); // 4,7 − 0,1
    const pris = phrasesDesTours([T(2, 3, 'p2'), T(3.3, 4, 'p1')], { mots: [['oh', 3.05, 3.4]] });
    expect(pris.find((x) => x.p === 'p2')!.fin).toBe(3); // le mot touche la phrase de p1 : laissé
  });

  it('QA : une suite de mots ratés de la voix FORTE ne se colle pas de proche en proche au tour de la voix faible', () => {
    // Romain (p2, −32 dB) parle de 2 à 3 s (VAD) ; puis Guts (p1, −20 dB) dit 4 mots de 3,3 à 5 s que la VAD a ratés
    // (aucun tour) ; puis Romain encore, raté aussi, à 6,0 s. Seuil de qui parle : −26 dB.
    const env = energie([[2, 3, -32], [3.3, 5, -20], [6, 6.3, -32]]);
    const mots: Mot[] = [['regarde', 3.3, 3.6], ['le', 3.75, 4.05], ['coffre', 4.2, 4.5], ['ici', 4.65, 4.95], ['hein', 6, 6.3]];
    const v = {
      methode: 'niveau+timbre' as const,
      voix: [{ id: 'p1', niveauDb: -20, part: 0.5 }, { id: 'p2', niveauDb: -32, part: 0.5 }],
      separation: { par: 'niveau' as const, seuilDb: -26, ecartDb: 12, cosinusCentres: null, ambigu: 0, morceaux: 4, proposerEmpreinte: null },
    };
    // Avant (sans le niveau des mots) : les 4 mots de Guts allongeaient le tour de Romain jusqu'à 4,95 s.
    const avant = phrasesDesTours([T(2, 3, 'p2')], { mots });
    expect(avant.filter((x) => x.p === 'p2').at(-1)!.fin).toBeCloseTo(4.95, 6);
    const qui = voixDesMotsParNiveau(v, env)!;
    expect(qui(mots[0]!)).toBe('p1');
    expect(qui(mots[4]!)).toBe('p2');
    const ph = phrasesDesTours([T(2, 3, 'p2'), T(5.4, 5.8, 'p2')], { mots, voixDuMot: qui });
    const p2 = ph.filter((x) => x.p === 'p2');
    expect(p2[0]!.fin).toBeLessThanOrEqual(3.35 + 1e-6); // pas sur les mots de Guts (pont et 0,9 s compris)
    expect(p2.every((x) => x.fin <= 3.3 || x.ts >= 5)).toBe(true);
    expect(p2.at(-1)!.fin).toBeCloseTo(6.3, 6); // le mot de Romain raté, lui, est rattaché à SON tour voisin
    // Sans séparation au niveau (pistes, empreinte seule, une voix) : on ne sait pas, comme avant.
    expect(voixDesMotsParNiveau({ ...v, methode: 'pistes' }, env)).toBeNull();
    expect(voixDesMotsParNiveau({ ...v, separation: { ...v.separation, par: 'empreinte', seuilDb: null } }, env)).toBeNull();
    expect(voixDesMotsParNiveau(v, null)).toBeNull();
    // À ± 3 dB du seuil : ambigu, pas de décision.
    expect(voixDesMotsParNiveau(v, energie([[3.3, 3.6, -27]]))!(mots[0]!)).toBeNull();
  });

  it('pure : les tours donnés ne bougent pas', () => {
    const tours = [T(2, 3, 'p1')];
    phrasesDesTours(tours);
    expect(tours).toEqual([T(2, 3, 'p1')]);
  });
});

/* ------------------------------------------------------------------ une petite session à 2 voix */

// Guts (p1, voix forte, −20 dB) de 2 à 6 s (deux phrases), Romain (p2, voix faible, −32 dB) de 7 à 10 s avec un cri
// à −24 dB (+8 dB sur SA voix) de 8,2 à 8,8 s ; une explosion du jeu (−15 dB, aucune voix) de 12 à 13 s, pendant un
// tour (mal) attribué à Guts de 11,5 à 13,5 s.
const MOTS: Mot[] = [
  ['on', 2.1, 2.4], ['va', 2.5, 2.8], ['au', 2.9, 3.1], ['chateau.', 3.2, 3.8], ['regarde', 4.2, 4.8], ['ici', 4.9, 5.5],
  ['attends', 7.1, 7.6], ['putain', 8.3, 8.8], ['non', 9.2, 9.6],
];
const ENV = energie([[2, 3.8, -20], [4.2, 5.5, -20], [7.1, 9.6, -32], [8.2, 8.8, -24], [12, 13, -15]]);
const PAROLE = parole([[2, 3.8], [4.2, 5.5], [7, 9.7]]);
const MOMENTS: MomentV4[] = [{ genre: 'cri', de: 8.2, a: 8.8, t: 8.5, force: 0.8, p: 'p2', indices: ['+8 dB'] }];
const VOIX: VoixDetecteesV4 = {
  src: 's1', methode: 'niveau+timbre',
  voix: [{ id: 'p1', niveauDb: -20, part: 0.6 }, { id: 'p2', niveauDb: -32, part: 0.4 }],
  tours: [T(2, 5.5, 'p1'), T(7, 9.7, 'p2'), T(11.5, 13.5, 'p1')], sure: 0.9,
  separation: { par: 'niveau', seuilDb: -26, ecartDb: 12, cosinusCentres: null, ambigu: 0, morceaux: 8, proposerEmpreinte: null },
};
const SIGNAUX: SignauxSource = { src: 's1', duree: DUREE, pas: 0.02, rms: new Float32Array(DUREE * 50).fill(0.01), pics: [], cris: [], rires: [], muets: [] };

function recette(avecMots = true): Recette {
  const r = normaliser({
    format: 'arko.recette/1', destination: 'youtube',
    sources: [{ id: 's1', nom: 'session.mp4', taille: 1, emp: 'e1', duree: DUREE, type: 'video', l: 1280, h: 720 }],
    plans: [{ de: 0, a: 20 }], textes: [], sons: [], zooms: [], guide: null, boucle: false, export: {},
  }).recette;
  return avecMots ? definirSousTitres(r, { style: 'classique', y: 0.85, parLigne: 7, mots: MOTS, src: 's1' }) : r;
}

const entree = (o: Partial<EntreePersos> = {}): EntreePersos => ({
  voix: VOIX, empreintes: [ENV], parole: PAROLE, mots: MOTS, moments: MOMENTS, signaux: SIGNAUX, noms: { p1: 'Guts', p2: 'Romain' }, chibis: {}, quiParle: true, avatars: true, ...o,
});

describe('poserPersosV4', () => {
  it('un perso par voix, avatars de la DA (parle, rebond, tenue 0,35 s), émotion PAR PHRASE', () => {
    const r = poserPersosV4(recette(), entree());
    expect(r.personnes!.map((p) => [p.id, p.nom])).toEqual([['p1', 'Guts'], ['p2', 'Romain']]);
    expect(r.avatars).toEqual({ mode: 'parle', rebond: true, tenue: 0.35 });
    const p1 = r.paroles!.filter((t) => t.p === 'p1');
    expect(p1.length).toBeGreaterThanOrEqual(3); // « … château. » | « regarde ici » | le tour du jeu
    const romain = r.paroles!.filter((t) => t.p === 'p2');
    // Le cri de la voix faible (+8 dB sur SA voix, −24 dBFS) : « crie » (les seuils absolus de la v3 le rataient).
    expect(romain.some((t) => t.emo === 'crie')).toBe(true);
  });

  it('bouche : fermée pendant l\'explosion du jeu (aucune voix), ouverte sur la voix faible', () => {
    const r = poserPersosV4(recette(), entree());
    const jeu = r.paroles!.find((t) => t.p === 'p1' && t.ts > 10)!;
    for (let t = 12.05; t < 13; t += 0.1) expect(boucheOuverte(jeu, t)).toBe(false);
    const romain = r.paroles!.find((t) => t.p === 'p2' && t.ts < 7.2)!;
    let ouvert = 0;
    for (let t = 7.1; t < 8; t += 0.04) if (boucheOuverte(romain, t)) ouvert++;
    expect(ouvert).toBeGreaterThan(5);
  });

  it('p1 (la voix forte) à gauche, p2 à droite ; visible 0,1 s avant, jusqu\'à 0,35 s après, puis plus', () => {
    // Mode « quand la personne parle » (le mode « réactions » d'office est vérifié dans avatars.test.ts).
    const r0 = poserPersosV4(recette(), entree());
    const r = { ...r0, avatars: { ...r0.avatars, mode: 'parle' as const } };
    const sc = compiler(r);
    const places = placerAvatars(r, sc);
    const vus = (t: number) => avatarsAuTemps(r, places, t, sc.gab).filter((x) => x.echelle > 0);
    expect(vus(3).map((x) => x.p)).toEqual(['p1']);
    expect(vus(3)[0]!.place.x).toBeLessThan(0.5);
    expect(vus(8).map((x) => x.p)).toEqual(['p2']);
    expect(vus(8)[0]!.place.x).toBeGreaterThan(0.5);
    expect(vus(6.95).map((x) => x.p)).toContain('p2'); // tour de p2 à 7 s : perso dès 6,9 s
    expect(vus(9.95).map((x) => x.p)).toContain('p2'); // fin 9,7 + 0,35
    expect(vus(10.2).map((x) => x.p)).not.toContain('p2');
  });

  it('« Sous-titres pour » : la voix faible (12 dB sous la forte) en mode mots ; le choix de la revue gagne', () => {
    expect(poserPersosV4(recette(), entree()).sousTitres?.pour).toBe('p2');
    expect(poserPersosV4(recette(), entree()).sousTitres?.mode).toBe('punchlines');
    expect(poserPersosV4(recette(), entree({ sousTitresPour: null })).sousTitres?.pour).toBeUndefined();
    expect(poserPersosV4(recette(), entree({ sousTitresPour: 'p1' })).sousTitres?.pour).toBe('p1');
    // Mode voix (sans mots ni sous-titres) : les persos, sans « Sous-titres pour ».
    const v = poserPersosV4(recette(false), entree({ mots: undefined }));
    expect(v.personnes).toHaveLength(2);
    expect(v.sousTitres?.pour).toBeUndefined();
    // Deux voix au même niveau : personne n'est sous-titré d'office.
    const meme: VoixDetecteesV4 = { ...VOIX, voix: [{ id: 'p1', niveauDb: -25, part: 0.5 }, { id: 'p2', niveauDb: -27, part: 0.5 }] };
    expect(poserPersosV4(recette(), entree({ voix: meme })).sousTitres?.pour).toBeUndefined();
  });

  it('sous-titres de la voix faible : ses phrases, jamais en même temps qu\'une punchline', () => {
    // Punchline sur « putain » (8,3–8,8 s), dite par Romain : elle a la priorité sur sa ligne « boîte ».
    const avecPunch = definirPunchlines(choisirModeSousTitres(recette(), 'punchlines'), [{ ts: 8.3, fin: 8.8 }]);
    const r = poserPersosV4(avecPunch, entree());
    const lignes = compiler(r).sousTitres!.lignes;
    const boites = lignes.filter((l) => l.style === SOUS_TITRES_VOIX.style);
    const punch = lignes.filter((l) => l.style !== SOUS_TITRES_VOIX.style);
    expect(punch.length).toBeGreaterThan(0);
    expect(boites.length).toBeGreaterThan(0);
    // Les lignes « boîte » ne montrent que des mots de Romain (7,1–9,6 s), et ne croisent aucune punchline.
    for (const b of boites) {
      expect(b.mots.every((m) => m.mot[1] >= 7 && m.mot[1] < 10)).toBe(true);
      for (const x of punch) expect(b.t0 < x.t1 && x.t0 < b.t1).toBe(false);
    }
  });

  it('pistes séparées : la bouche suit la piste de chacun (sans la VAD de la piste principale)', () => {
    // La piste 1 (Discord) porte Guts ; la VAD (piste principale) ne l'entend pas de 2 à 5,5 s.
    const discord = { ...energie([[2, 3.8, -20], [4.2, 5.5, -20]]), piste: 1 };
    const micro = { ...energie([[7.1, 9.6, -32]]), piste: 0 };
    const pistes: VoixDetecteesV4 = { ...VOIX, methode: 'pistes', voix: [{ id: 'p1', niveauDb: -20, part: 0.6, piste: 1 }, { id: 'p2', niveauDb: -32, part: 0.4, piste: 0 }], tours: [T(2, 5.5, 'p1'), T(7, 9.7, 'p2')] };
    const r = poserPersosV4(recette(), entree({ voix: pistes, empreintes: [micro, discord], parole: parole([[7, 9.7]]) }));
    const guts = r.paroles!.filter((t) => t.p === 'p1');
    expect(guts.some((t) => boucheOuverte(t, 3))).toBe(true);
    expect(r.personnes!.map((p) => p.piste)).toEqual([1, 0]);
  });

  it('sans voix, sans tours, ou qui parle et persos décochés : la recette telle quelle', () => {
    const r0 = recette();
    expect(poserPersosV4(r0, entree({ voix: null }))).toBe(r0);
    expect(poserPersosV4(r0, entree({ voix: { ...VOIX, tours: [] } }))).toBe(r0);
    expect(poserPersosV4(r0, entree({ quiParle: false, avatars: false }))).toBe(r0);
    // Qui parle sans avatars : personnes et tours, pas d'avatars.
    const sans = poserPersosV4(r0, entree({ avatars: false }));
    expect(sans.personnes).toHaveLength(2);
    expect(sans.avatars).toBeUndefined();
  });

  it('recette rétrocompatible : rien d\'autre que les champs d\'avant (personnes, paroles, avatars, sousTitres.pour)', () => {
    const r0 = recette();
    const r = poserPersosV4(r0, entree());
    const cles = (x: object) => Object.keys(x).sort();
    expect(cles(r).filter((k) => !cles(r0).includes(k)).sort()).toEqual(['avatars', 'paroles', 'personnes']);
    for (const t of r.paroles!) for (const k of Object.keys(t)) expect(['ts', 'fin', 'p', 'src', 'emo', 'sit', 'b', 'sur']).toContain(k);
    // Normaliser la recette ne change rien (tout est valide).
    expect(normaliser(r, { sources: r.sources }).recette).toEqual(r);
  });
});
