// Best-of v4 — la chaîne pure (architecte, 7/11/2026 ; propriétaire en vague 2 : l'intégrateur). Session FABRIQUÉE
// de 15 min (2 voix dans un seul mélange à −40 / −25 dB, VAD fabriquée sur les tours) : réglages d'office, modules,
// besoins, analyse, revue, montage en une fois, durée annoncée = durée du montage, repli d'une étape qui lève, et les
// étapes d'avant redonnent les séquences d'avant. Aucun modèle, aucun ffmpeg, aucune donnée privée.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import type { Mot, Recette, Source, TourDeParole } from '../../recette/types';
import { TAILLE_MODULE } from '../../sous-titres/config';
import { MODELES } from '../modeles/catalogue';
import { finAccroche } from '../son/musique-auto';
import type { SignauxSource } from '../types';
import type { EmpreintesVoix } from '../types-v3';
import type { EtapesChaine, MesuresSource, ProbasVad } from '../types-v4';
import { scenesBestOf, type AnalyseBestOf } from './best-of';
import {
  analyserChaine,
  besoinsChaine,
  decisionModules,
  dureeEstimee,
  dureeViseeSequences,
  ETAPES_V4,
  etapesAvec,
  montagePossible,
  monterChaine,
  plagesSansDoublon,
  recetteDeDepart,
  reglagesBestOfV4,
  revueParDefaut,
} from './chaine-best-of';
import { ETAPES_ANCIENNES } from './etapes-anciennes';

const DUREE = 900;
const PAS = 0.02;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Phrases de 5 mots (0,4 s par mot), séparées de 0,6 s ; voix p1 (faible) / p2 (forte) en alternance. */
function echange(de: number, a: number, textes: string[][]): { mots: Mot[]; tours: TourDeParole[] } {
  const mots: Mot[] = [];
  const tours: TourDeParole[] = [];
  let k = 0;
  for (let t = de; t + 2 <= a; t += 2.6, k++) {
    const txt = textes[k % textes.length]!;
    txt.forEach((x, i) => mots.push([x, r2(t + i * 0.4), r2(t + i * 0.4 + 0.3)]));
    tours.push({ ts: r2(t), fin: r2(t + (txt.length - 1) * 0.4 + 0.3), p: k % 2 === 0 ? 'p1' : 'p2' });
  }
  return { mots, tours };
}

const NORMAL = [['on', 'va', 'au', 'château', 'maintenant'], ['je', 'cherche', 'du', 'bois', 'ici']];
const FORT = [['non!', 'putain', 'le', 'creeper', 'là'], ['mdr', 'il', 'a', 'tout', 'explosé!']];
const PARTIES = [echange(10, 40, FORT), echange(100, 125, NORMAL), echange(200, 400, [...NORMAL, ...FORT]), echange(500, 520, NORMAL)];
const MOTS = PARTIES.flatMap((p) => p.mots);
const TOURS = PARTIES.flatMap((p) => p.tours);

const SIGNAUX: SignauxSource = {
  src: 's1',
  duree: DUREE,
  pas: PAS,
  rms: new Float32Array(DUREE / PAS).fill(0.01),
  pics: [{ ts: 20, db: -6, z: 5 }, { ts: 299, db: -5, z: 6 }],
  cris: [{ de: 350, a: 351, t: 350.5, force: 0.8 }],
  rires: [{ de: 21, a: 23, t: 22, force: 0.6 }, { de: 300, a: 304, t: 302, force: 0.9 }],
  muets: [{ de: 600, a: DUREE }],
};

/** Empreintes : niveau −40 dB (p1) / −25 dB (p2) pendant les tours, −100 ailleurs ; timbre différent par voix. */
function empreintes(): EmpreintesVoix {
  const n = DUREE / PAS;
  const db = new Float32Array(n).fill(-100);
  const bandes = new Float32Array(n * 8).fill(-100);
  for (const t of TOURS) {
    const niveau = t.p === 'p1' ? -40 : -25;
    for (let k = Math.floor(t.ts / PAS); k < Math.ceil(t.fin / PAS); k++) {
      db[k] = niveau + (k % 5) - 2;
      for (let b = 0; b < 8; b++) bandes[k * 8 + b] = niveau - (t.p === 'p1' ? b : 8 - b);
    }
  }
  return { pas: PAS, duree: DUREE, db, bandes };
}

/** VAD fabriquée : p ≈ 0,9 pendant les tours, ≈ 0,02 ailleurs. */
function vad(): ProbasVad {
  const pas = 0.032;
  const p = new Uint8Array(Math.ceil(DUREE / pas)).fill(5);
  for (const t of TOURS) for (let k = Math.floor(t.ts / pas); k < Math.ceil(t.fin / pas); k++) p[k] = 230;
  return { src: 's1', pas, p, plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' };
}

function mesures(o: { vad?: boolean; mots?: boolean } = {}): MesuresSource {
  return {
    src: 's1',
    duree: DUREE,
    signaux: SIGNAUX,
    empreintes: [empreintes()],
    pistesSeparees: false,
    vad: o.vad === false ? null : vad(),
    hauteur: null,
    transcription: o.mots === false ? null : { src: 's1', mots: MOTS, plages: [{ de: 0, a: DUREE }], complete: true },
    neurales: null,
    cadreBords: null,
    modules: { whisper: o.mots === false ? 'absent' : 'present', vad: o.vad === false ? 'absent' : 'present', empreinte: 'absent' },
    avertissements: [],
  };
}

const SOURCE: Source = { id: 's1', nom: 'session.mp4', taille: 1, emp: 'test-chaine', duree: DUREE, type: 'video', l: 1280, h: 720 };
const MUSIQUE: Source = { id: 'a1', nom: 'Kevin MacLeod - Sneaky Snitch.m4a', taille: 1, emp: 'test-musique', duree: 120, type: 'audio' };
const depart = (): Recette => recetteDeDepart(SOURCE, 'youtube', 'Best-of — session');

describe('Best-of v4 : réglages et modules', () => {
  it('réglages d\'office : coupe de la DA, musique automatique, 15–20 min, titres décochés', () => {
    const { express, bestOf } = reglagesBestOfV4('youtube');
    expect(express.niveauBlancs).toBe('normal');
    expect(express.musiqueAuto).toBe(true);
    expect(express.transcrire).toBe(true);
    expect(express.dureeVisee).toEqual({ min: 900, max: 1200 });
    expect(express.bruitages).toBe(false);
    expect(bestOf).toMatchObject({ titres: false, quiParle: true, avatars: true, bips: false });
  });

  it('modules absents : un seul accord pour Whisper (la VAD est rangée dans l\'appli), et ce qui manquera sans eux', () => {
    expect(MODELES.vad.dansLAppli).toBe('modeles/silero-vad-v5.onnx');
    const d = decisionModules({ whisper: 'absent', vad: 'absent', empreinte: 'absent' }, true);
    expect(d.aProposer).toEqual(['whisper']);
    expect(d.octets).toBe(TAILLE_MODULE);
    expect(d.parole).toBe('voix');
    expect(d.manques).toEqual(['textes', 'precision']);
    const ok = decisionModules({ whisper: 'present', vad: 'present', empreinte: 'absent' }, true);
    expect(ok).toMatchObject({ aProposer: [], octets: 0, parole: 'mots', manques: [] });
    // Refusé : plus proposé (pour cette ouverture), mais le manque reste dit.
    expect(decisionModules({ whisper: 'refuse', vad: 'present', empreinte: 'absent' }, true)).toMatchObject({ aProposer: [], parole: 'voix', manques: ['textes'] });
    // Whisper présent, VAD qui n'a pas pu se charger : rien à proposer, mais « moins précis » est dit.
    expect(decisionModules({ whisper: 'present', vad: 'erreur', empreinte: 'absent' }, true)).toMatchObject({ aProposer: [], octets: 0, parole: 'mots', manques: ['precision'] });
  });

  it('les modèles et les musiques ne sont jamais pré-cachés par le service worker (gardés à la demande)', () => {
    const config = readFileSync(new URL('../../../vite.config.ts', import.meta.url), 'utf8');
    const ignores = /globIgnores:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    for (const d of ['ort/**', 'modeles/**', 'musiques/**']) expect(ignores).toContain(`'${d}'`);
    const motifs = /globPatterns:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(motifs).not.toMatch(/onnx|m4a/);
  });
});

describe('Best-of v4 : analyse pure', () => {
  it('besoins : Whisper n\'écoute que les zones de parole (jamais le passage muet)', () => {
    const b = besoinsChaine(mesures());
    expect(b.transcrire.length).toBeGreaterThan(0);
    const total = b.transcrire.reduce((t, z) => t + z.a - z.de, 0);
    expect(total).toBeLessThan(DUREE * 0.6);
    expect(b.transcrire.every((z) => z.a <= 600)).toBe(true);
    expect(b.empreintes).toEqual([]);
  });

  it('analyse : parole de la VAD, mots, voix, coupes sur toute la source, séquences choisies', () => {
    const { express, bestOf } = reglagesBestOfV4('youtube');
    const a = analyserChaine(mesures(), { ...express, dureeVisee: { min: 60, max: 120 } }, bestOf);
    expect(a.v).toBe(4);
    expect(a.parole).toBe('mots');
    expect(a.paroleDetectee.methode).toBe('vad');
    expect(a.voix?.voix.length).toBeGreaterThanOrEqual(1);
    expect(a.morceaux.length).toBeGreaterThan(0);
    expect(a.scenes.some((s) => s.garde)).toBe(true);
    expect(a.scenes.every((s) => s.a <= 600)).toBe(true);
    expect(a.besoins.transcrire.length).toBeGreaterThan(0);
  });

  it('sans Whisper ni VAD : mode voix, des séquences quand même, aucun sous-titre', () => {
    const { express, bestOf } = reglagesBestOfV4('youtube');
    const reg = { ...express, dureeVisee: { min: 60, max: 120 } };
    const a = analyserChaine(mesures({ vad: false, mots: false }), reg, bestOf);
    expect(a.parole).toBe('voix');
    expect(a.paroleDetectee.methode).toBe('sans-modele');
    expect(a.bilanMots).toBeNull();
    const r = monterChaine(depart(), a, revueParDefaut(a), reg, bestOf, null);
    expect(r.plans.length).toBeGreaterThan(0);
    expect(r.sousTitres).toBeNull();
  });
});

/** Session où un quart des phrases de la voix faible est dite plus fort : des morceaux au niveau ambigu (< 25 %). */
function mesuresAmbigues(): MesuresSource {
  const n = DUREE / PAS;
  const db = new Float32Array(n).fill(-100);
  const bandes = new Float32Array(n * 8).fill(-100);
  const v = vad();
  v.p.fill(5);
  for (let t = 10, i = 0; t < 560; t += 2.6, i++) {
    const p1 = i % 2 === 0;
    const niveau = p1 ? (i % 4 === 0 ? -42 + ((i * 7) % 12) : -41) : -24 - ((i * 3) % 4);
    for (let k = Math.floor(t / PAS); k < Math.ceil((t + 2) / PAS); k++) {
      db[k] = niveau + (k % 5) - 2;
      for (let b = 0; b < 8; b++) bandes[k * 8 + b] = niveau - (p1 ? b : 8 - b);
    }
    for (let k = Math.floor(t / v.pas); k < Math.ceil((t + 2) / v.pas); k++) v.p[k] = 230;
  }
  return { ...mesures({ mots: false }), empreintes: [{ pas: PAS, duree: DUREE, db, bandes }], vad: v };
}

describe('Best-of v4 : empreinte de voix', () => {
  it('modèle CAM++ déjà sur l\'appareil : il sert aussi tout seul aux morceaux ambigus (sans rien proposer)', () => {
    const m = mesuresAmbigues();
    const sans = besoinsChaine(m);
    expect(sans.empreintes).toEqual([]);
    expect(sans.raisonEmpreinte).toBeNull();
    const avec = besoinsChaine(m, undefined, { empreinteSurAppareil: true });
    expect(avec.empreintes.length).toBeGreaterThan(20);
    expect(avec.empreintes.length).toBeLessThanOrEqual(300);
    expect(avec.raisonEmpreinte).toBeNull();
  });
});

describe('Best-of v4 : revue et montage', () => {
  it('montage en une fois : coupes, sous-titres, persos, musique placée, −14 LUFS ; durée annoncée = durée du montage', () => {
    const { express, bestOf } = reglagesBestOfV4('youtube');
    const reg = { ...express, dureeVisee: { min: 60, max: 120 } };
    const a = analyserChaine(mesures(), reg, bestOf);
    const revue = revueParDefaut(a);
    const annoncee = dureeEstimee(a, revue.scenes, reg);
    const r = monterChaine(depart(), a, revue, reg, bestOf, { piste: { morceaux: [{ src: 'a1', t: 0 }] }, sources: [MUSIQUE] });
    expect(r.plans.length).toBeGreaterThan(2);
    expect(r.blancs?.niveau).toBe('normal');
    expect(r.volumeFinal).toEqual({ lufs: -14, crete: -1.5 });
    expect(r.musique?.morceaux.length).toBe(1);
    // Morceau choisi à la main : il baisse aussi sur la parole (même la voix faible), comme la musique automatique.
    expect(r.musique?.baisseSur).toBe('parole');
    expect(finAccroche(compiler(r))).toBeGreaterThan(4);
    expect(r.musique?.morceaux[0]!.t).toBeCloseTo(finAccroche(compiler(r)), 2);
    expect(Array.isArray(r.sousTitres?.mots)).toBe(true);
    expect((r.personnes ?? []).length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(compiler(r).duree - annoncee)).toBeLessThan(0.3);
    expect(montagePossible(a, revue.scenes, reg, 'youtube').possible).toBe(true);
    // Une séquence décochée : la durée annoncée suit, et reste celle du montage (accroche comprise).
    const k = revue.scenes.findIndex((x) => x.garde);
    const moins = { ...revue, scenes: revue.scenes.map((x, i) => (i === k ? { ...x, garde: false } : x)) };
    if (moins.scenes.some((x) => x.garde)) {
      const r2 = monterChaine(depart(), a, moins, reg, bestOf, null);
      expect(Math.abs(compiler(r2).duree - dureeEstimee(a, moins.scenes, reg))).toBeLessThan(0.3);
    }
    // Avec les seuls morceaux (sans l'analyse complète) : l'accroche compte pour 6 s.
    const gardees = revue.scenes.filter((x) => x.garde);
    expect(dureeEstimee({ morceaux: a.morceaux }, revue.scenes, reg)).toBeCloseTo(dureeEstimee({ morceaux: a.morceaux }, revue.scenes, { ...reg, accroche: false }) + (gardees.length > 0 ? 6 : 0), 1);
  });

  it('deux séquences cochées qui se recouvrent : chaque seconde de source n\'est jouée qu\'une fois, durée annoncée = montée', () => {
    const { express, bestOf } = reglagesBestOfV4('youtube');
    const reg = { ...express, accroche: false, dureeVisee: { min: 60, max: 120 } };
    const a = analyserChaine(mesures(), reg, bestOf);
    const revue = revueParDefaut(a);
    const k = revue.scenes.findIndex((x) => x.garde);
    const s = revue.scenes[k]!;
    // Une 2ᵉ séquence cochée qui reprend la 2ᵉ moitié de la 1ʳᵉ et va plus loin (« + 1 phrase » de trop).
    const doublon = { ...s, de: (s.de + s.a) / 2, a: s.a + 20, garde: true };
    const scenes = [...revue.scenes.slice(0, k + 1), doublon, ...revue.scenes.slice(k + 1)];
    expect(plagesSansDoublon(scenes.filter((x) => x.garde)).some((p) => p.de < s.a - 0.01 && p.a > s.a + 0.01)).toBe(false);
    const r = monterChaine(depart(), a, { ...revue, scenes }, reg, bestOf, null);
    const sc = compiler(r);
    const joue = sc.plans.filter((p) => !p.ins).map((p) => [p.de, p.a] as const).sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < joue.length; i++) expect(joue[i]![0]).toBeGreaterThanOrEqual(joue[i - 1]![1] - 1e-6);
    expect(Math.abs(sc.duree - dureeEstimee(a, scenes, reg))).toBeLessThan(0.3);
  });

  it('une étape qui lève est remplacée par l\'étape d\'avant (une ligne au journal)', () => {
    const { express, bestOf } = reglagesBestOfV4('youtube');
    const reg = { ...express, dureeVisee: { min: 60, max: 120 } };
    const casse: EtapesChaine = {
      ...ETAPES_V4,
      sequences: () => {
        throw new Error('pas prêt');
      },
    };
    const journal: string[] = [];
    const a = analyserChaine(mesures(), reg, bestOf, { etapes: casse, journal });
    expect(journal.length).toBe(1);
    expect(journal[0]).toContain('sequences');
    expect(a.scenes.some((s) => s.garde)).toBe(true);
  });

  it('les étapes d\'avant (« --ancien ») redonnent les séquences du Best-of d\'avant', () => {
    const { express, bestOf } = reglagesBestOfV4('youtube');
    const reg = { ...express, niveauBlancs: 'serre' as const, dureeVisee: { min: 60, max: 120 } };
    const etapes = etapesAvec(['parole', 'mots', 'voix', 'moments', 'coupes', 'sequences', 'habillage', 'persos']);
    expect(etapes.voix).toBe(ETAPES_ANCIENNES.voix);
    const a = analyserChaine(mesures({ vad: false }), reg, bestOf, { etapes });
    const base: AnalyseBestOf = { ...a, scenes: [], passages: [] };
    const avant = scenesBestOf({ ...base, signaux: SIGNAUX }, a.voix, dureeViseeSequences(reg));
    const cle = (s: { de: number; a: number; garde: boolean }) => `${s.de}|${s.a}|${s.garde}`;
    expect(a.scenes.map(cle)).toEqual(avant.scenes.map(cle));
  });
});
