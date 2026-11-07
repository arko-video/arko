// « Persos de qui parle » dans CHAQUE montage sans IA (7/11/2026) : Montage express, Best-of serré, clips du monteur
// sans IA (et leur compilation 16:9). Une voix → un perso ; pas de parole → aucun perso ; persos tout prêts 1, 2…
// dans l'ordre des voix, ou ceux choisis ; réglage décoché → rien ; avatars visibles quand la voix parle.

import { describe, expect, it } from 'vitest';
import { PERSOS_PRETS } from '../../chibis/persos/prets';
import { chibiAuHasard } from '../../chibis/hasard';
import { clipsSansIA } from '../../ia/sans-ia';
import type { Moment } from '../../ia/moments';
import { avatarsAuTemps, placerAvatars } from '../../moteur/couches/avatars';
import { compiler } from '../../recette/chronologie';
import { fusionnerRecettes } from '../../recette/compilation';
import { normaliser } from '../../recette/normaliser';
import type { Mot, Recette, TourDeParole } from '../../recette/types';
import { BEST_OF_DEFAUT, construireBestOf, scenesBestOf } from '../express/best-of';
import { construireMontageExpress, type AnalyseExpress, type ReglagesExpress } from '../express/express';
import { choisirScenes, decouperScenes } from '../express/scenes';
import type { SignauxSource } from '../types';
import type { VoixDetectees } from '../types-v3';
import { paroleDansMontage, poserPersos } from './persos-montage';

const DUREE = 600;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Échanges de phrases (5 mots, 0,4 s par mot) de `de` à `a`, voix p1 / p2 en alternance (ou une seule voix). */
function echange(de: number, a: number, voix: string[] = ['p1', 'p2']): { mots: Mot[]; tours: TourDeParole[] } {
  const mots: Mot[] = [];
  const tours: TourDeParole[] = [];
  let k = 0;
  for (let t = de; t + 2 <= a; t += 2.6, k++) {
    const txt = k % 3 === 0 ? ['non!', 'putain', 'le', 'creeper', 'là'] : ['on', 'va', 'au', 'château', 'maintenant'];
    txt.forEach((x, i) => mots.push([x, r2(t + i * 0.4), r2(t + i * 0.4 + 0.3)]));
    tours.push({ ts: r2(t), fin: r2(t + 1.9), p: voix[k % voix.length]! });
  }
  return { mots, tours };
}

const PARTIES = [echange(10, 60), echange(150, 220), echange(300, 340, ['p2'])];
const MOTS = PARTIES.flatMap((p) => p.mots);
const TOURS = PARTIES.flatMap((p) => p.tours);
const SIGNAUX: SignauxSource = { src: 's1', duree: DUREE, pas: 0.02, rms: new Float32Array(DUREE * 50).fill(0.01), pics: [{ ts: 20, db: -6, z: 5 }, { ts: 180, db: -5, z: 6 }], cris: [], rires: [{ de: 181, a: 183, t: 182, force: 0.9 }], muets: [] };
const VOIX: VoixDetectees = { src: 's1', methode: 'niveau+timbre', voix: [{ id: 'p1', niveauDb: -40, part: 0.5 }, { id: 'p2', niveauDb: -25, part: 0.5 }], tours: TOURS, sure: 0.9 };

function recette(destination: 'youtube' | 'tiktok' = 'youtube'): Recette {
  return normaliser({
    format: 'arko.recette/1', destination,
    sources: [{ id: 's1', nom: 'session.mp4', taille: 1, emp: 'e1', duree: DUREE, type: 'video', l: 1280, h: 720 }],
    plans: [{ de: 0, a: DUREE }], textes: [], sons: [], zooms: [], guide: null, boucle: false, export: {},
  }).recette;
}

const REGLAGES: ReglagesExpress = { dureeVisee: { min: 60, max: 120 }, garder: 'parole+forts', niveauBlancs: 'normal', transcrire: true, punchlines: true, bruitages: false, musique: [], bords: false, zooms: 'normal', sections: false, accroche: true, avecIA: false };
const RESSOURCES = { sourcesAudio: [], bruitages: [], musique: null };

function analyse(voix: VoixDetectees | null = VOIX): AnalyseExpress {
  const scenes = choisirScenes(decouperScenes(MOTS, SIGNAUX), MOTS, SIGNAUX, 300);
  return { transcription: { src: 's1', mots: MOTS, plages: [{ de: 0, a: DUREE }], complete: true }, parole: 'mots', signaux: SIGNAUX, scenes, cadreBords: null, avertissements: [], voix, empreintes: [] };
}

/** Le montage a des avatars, et l'avatar de chaque voix apparaît quand elle parle. */
function verifierAvatars(r: Recette, n: number) {
  expect(r.avatars).toEqual({ mode: 'parle', rebond: true });
  expect(r.personnes).toHaveLength(n);
  const sc = compiler(r);
  const places = placerAvatars(r, sc);
  expect(places.length).toBeGreaterThan(0);
  const pl = places[Math.floor(places.length / 2)]!;
  const vus = avatarsAuTemps(r, places, (pl.t0 + pl.t1) / 2, sc.gab);
  expect(vus.map((v) => v.p)).toContain(pl.p);
}

describe('Montage express', () => {
  it('persos de qui parle cochés d\'office : 2 voix → 2 persos tout prêts (voix 1 → perso 1), avatars', () => {
    const a = analyse();
    const r = construireMontageExpress(recette(), a, a.scenes, REGLAGES, RESSOURCES);
    verifierAvatars(r, 2);
    expect(r.personnes!.map((p) => p.chibi)).toEqual([PERSOS_PRETS[0], PERSOS_PRETS[1]]);
    // L'émotion / la situation suit les mots (« non! putain » → au moins un tour qui n'est pas « parle »).
    expect(r.paroles!.some((t) => t.emo !== undefined || t.sit !== undefined)).toBe(true);
  });
  it('noms et persos choisis sur la revue ; réglage décoché ; sans voix', () => {
    const a = analyse();
    const moi = chibiAuHasard(3);
    const r = construireMontageExpress(recette(), a, a.scenes, REGLAGES, { ...RESSOURCES, noms: { p1: 'Romain' }, chibis: { p1: { def: moi } } });
    expect(r.personnes![0]).toMatchObject({ nom: 'Romain', chibi: moi });
    expect(r.personnes![1]!.nom).toBe('Voix 2');
    const sans = construireMontageExpress(recette(), a, a.scenes, { ...REGLAGES, persos: false }, RESSOURCES);
    expect(sans.personnes).toBeUndefined();
    expect(sans.avatars).toBeUndefined();
    const b = analyse(null);
    expect(construireMontageExpress(recette(), b, b.scenes, REGLAGES, RESSOURCES).personnes).toBeUndefined();
  });
  it('une seule voix → un seul perso', () => {
    const une: VoixDetectees = { ...VOIX, methode: 'une', voix: [VOIX.voix[0]!], tours: TOURS.map((t) => ({ ...t, p: 'p1' })) };
    const a = analyse(une);
    verifierAvatars(construireMontageExpress(recette('tiktok'), a, a.scenes, REGLAGES, RESSOURCES), 1);
  });
});

describe('Best-of serré (même étape partagée)', () => {
  it('2 voix → 2 persos, avatars ; « Persos de qui parle » décoché → qui parle sans avatars', () => {
    const base = analyse();
    const { scenes, passages } = scenesBestOf(base, VOIX, 200);
    const a = { ...base, scenes, voix: VOIX, empreintes: [], passages };
    const res = { ...RESSOURCES, noms: {}, chibis: {} };
    verifierAvatars(construireBestOf(recette(), a, scenes, REGLAGES, BEST_OF_DEFAUT, res), 2);
    const sans = construireBestOf(recette(), a, scenes, REGLAGES, { ...BEST_OF_DEFAUT, avatars: false }, res);
    expect(sans.personnes).toHaveLength(2);
    expect(sans.avatars).toBeUndefined();
  });
});

describe('clips du monteur sans IA (et leur compilation)', () => {
  const moment = (pic: number): Moment => ({ id: `m${pic}`, debut: pic - 5, fin: pic + 5, score: 80, etiquettes: ['rire'], pic, mots: MOTS.filter((w) => w[1] > pic - 30 && w[1] < pic + 20) });
  const source = recette().sources[0]!;
  const clips = clipsSansIA([moment(30), moment(182), moment(320)], source, 3, { signaux: SIGNAUX, dureeMin: 12, dureeMax: 25 });

  it('chaque clip : les voix qui parlent dans SON passage, leur perso tout prêt, avatars', () => {
    const avec = clips.map((c) => poserPersos(c.recette, { voix: VOIX, empreintes: [] }, { mots: MOTS, signaux: SIGNAUX, plage: { de: c.recette.plans[0]!.de, a: c.recette.plans[0]!.a } }));
    const deDeux = avec.find((r) => r.plans[0]!.de < 200 && r.plans[0]!.a > 150)!;
    verifierAvatars(deDeux, 2);
    // Le clip à 320 s : seule la voix 2 parle → un seul perso, le perso 2 (même voix, même perso partout).
    const seule = avec.find((r) => r.plans[0]!.de >= 290)!;
    verifierAvatars(seule, 1);
    expect(seule.personnes![0]).toMatchObject({ id: 'p2', chibi: PERSOS_PRETS[1] });
    // Les tours gardés restent près du clip (pas les 2 h de la source).
    for (const t of seule.paroles!) expect(t.fin).toBeGreaterThan(seule.plans[0]!.de - 6);
    // Compilation 16:9 : toutes les voix, tous les tours, avatars.
    const comp = fusionnerRecettes(avec)!;
    verifierAvatars(comp, 2);
    expect(comp.paroles!.length).toBe(new Set(avec.flatMap((r) => r.paroles!.map((t) => `${t.p}|${t.ts}`))).size);
  });

  it('pas de parole dans le passage → aucun perso', () => {
    const c = clipsSansIA([{ id: 'x', debut: 450, fin: 460, score: 80, etiquettes: ['pic'], pic: 455 }], source, 1, { dureeMin: 12, dureeMax: 20 })[0]!;
    const p = c.recette.plans[0]!;
    expect(paroleDansMontage(c.recette, TOURS)).toBe(0);
    expect(poserPersos(c.recette, { voix: VOIX, empreintes: [] }, { plage: { de: p.de, a: p.a } })).toBe(c.recette);
  });
});
