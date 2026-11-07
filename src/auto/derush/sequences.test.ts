// Best-of v4 — l'étape « séquences » (dev-scenes) : histoires réparties sur toute la session, départage sans l'ordre
// chronologique, mise en place / chute, durée visée tenue avec e.dureeDe, passages, « Plus de contexte / Moins ».
// Données FABRIQUÉES seulement (session-test.ts) : aucun son, aucun modèle, aucune donnée privée.

import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import type { PlageTemps } from '../types';
import type { EntreeSequences, MomentV4, ParoleDetectee, SequenceV4 } from '../types-v4';
import { ajusterSequence } from './ajuster';
import {
  bordApres,
  bordAvant,
  debutMiseEnPlace,
  finChute,
  fusionnerHistoires,
  histoireAutour,
  meilleureDAbord,
  paroles,
  REGLES_HISTOIRES,
  type Histoire,
} from './histoires';
import { blocsActifs, centiles, quotas } from './repartition';
import { choisirSequencesV4 } from './sequences';
import { coupesSimples, DUREE_LONGUE, dureeDeMorceaux, MUET_LONG, sessionLongue } from './session-test';

const gardees = (scenes: readonly SequenceV4[]) => scenes.filter((s) => s.garde);
const total = (e: EntreeSequences, scenes: readonly SequenceV4[]) => e.dureeDe(gardees(scenes).map((s) => ({ de: s.de, a: s.a })));
const dansUnMot = (mots: readonly Mot[], t: number) => mots.some((m) => t > m[1] + 1e-6 && t < m[2] - 1e-6);

describe('séquences v4 : session de 2 h', () => {
  const s = sessionLongue();
  const choix = choisirSequencesV4(s.entree);
  const g = gardees(choix.scenes);

  it('des histoires choisies dans TOUS les blocs de 20 min (pas seulement la 1re heure)', () => {
    const blocs = new Set(g.map((x) => Math.min(5, Math.floor((x.de < MUET_LONG.de ? x.de : x.de - (MUET_LONG.a - MUET_LONG.de)) / 1200))));
    expect([...blocs].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(g.map((x) => x.bloc)).size).toBe(6);
    expect(Math.max(...g.map((x) => x.a))).toBeGreaterThan(6000);
  });

  it('les moments forts plantés sont presque tous dans une histoire gardée', () => {
    const dedans = s.plantes.filter((p) => g.some((x) => p.t >= x.de && p.t < x.a));
    expect(dedans.length).toBeGreaterThanOrEqual(Math.ceil(0.8 * s.plantes.length));
  });

  it('durée visée tenue à ± 5 % (mesurée par e.dureeDe, comme le montage) ; ≈ 1 histoire par minute', () => {
    const d = total(s.entree, choix.scenes);
    expect(d).toBeGreaterThanOrEqual(1044 * 0.95);
    expect(d).toBeLessThanOrEqual(1044 * 1.05);
    expect(g.length).toBeGreaterThanOrEqual(14);
    expect(g.length).toBeLessThanOrEqual(30);
    const med = [...g.map((x) => x.duree)].sort((a, b) => a - b)[Math.floor(g.length / 2)]!;
    expect(med).toBeGreaterThanOrEqual(30);
    expect(med).toBeLessThanOrEqual(REGLES_HISTOIRES.garde.max);
    for (const x of g) expect(Math.abs(x.duree - s.entree.dureeDe([x]))).toBeLessThanOrEqual(0.051);
  });

  it('des histoires de 30 à 120 s de source, sans recouvrement, dans l\'ordre chronologique, hors du passage muet', () => {
    for (const x of choix.scenes) {
      expect(x.a - x.de).toBeLessThanOrEqual(REGLES_HISTOIRES.source.max + 1e-6);
      expect(x.a <= MUET_LONG.de || x.de >= MUET_LONG.a).toBe(true);
      expect(x.coeur.de).toBeGreaterThanOrEqual(x.de - 1e-6);
      expect(x.coeur.a).toBeLessThanOrEqual(x.a + 1e-6);
    }
    for (const x of g) expect(x.duree).toBeGreaterThanOrEqual(REGLES_HISTOIRES.garde.min);
    const sources = g.map((x) => x.a - x.de).sort((a, b) => a - b);
    expect(sources[Math.floor(sources.length / 2)]!).toBeGreaterThanOrEqual(REGLES_HISTOIRES.source.min);
    for (let i = 1; i < choix.scenes.length; i++) expect(choix.scenes[i]!.de).toBeGreaterThanOrEqual(choix.scenes[i - 1]!.a);
  });

  it('jamais une borne au milieu d\'un mot', () => {
    for (const x of choix.scenes) {
      expect(dansUnMot(s.entree.mots, x.de)).toBe(false);
      expect(dansUnMot(s.entree.mots, x.a)).toBe(false);
    }
  });

  it('note brute sans plafond, centile 0 à 100 (= score), raison et titre', () => {
    const notes = choix.scenes.map((x) => x.noteBrute);
    expect(new Set(notes).size).toBeGreaterThan(notes.length / 2);
    for (const x of choix.scenes) {
      expect(x.score).toBe(x.centile);
      expect(x.centile).toBeGreaterThanOrEqual(0);
      expect(x.centile).toBeLessThanOrEqual(100);
      expect(x.protegee).toBe(false);
      expect(x.morceaux).toBeUndefined();
      expect(x.raison.length).toBeGreaterThan(0);
      expect(x.titre.length).toBeGreaterThan(0);
    }
    expect(Math.max(...choix.scenes.map((x) => x.centile))).toBe(100);
    // Une histoire avec un moment planté a une meilleure note que la médiane.
    const avec = choix.scenes.filter((x) => s.plantes.some((p) => p.t >= x.de && p.t < x.a));
    expect(avec.every((x) => x.centile >= 50)).toBe(true);
  });

  it('passages pas retenus : les non choisies de centile ≥ 30, triées par note, 100 au plus', () => {
    expect(choix.passages.length).toBeLessThanOrEqual(100);
    for (const p of choix.passages) {
      expect(p.note).toBeGreaterThanOrEqual(30);
      expect(g.some((x) => x.de === p.de && x.a === p.a)).toBe(false);
      expect(p.src).toBe('s1');
    }
    for (let i = 1; i < choix.passages.length; i++) expect(choix.passages[i]!.note).toBeLessThanOrEqual(choix.passages[i - 1]!.note);
  });

  it('pure et reproductible', () => {
    const encore = choisirSequencesV4(s.entree);
    expect(encore).toEqual(choix);
  });
});

describe('séquences v4 : départage', () => {
  it('à force égale partout, le choix ne garde pas que le début (jamais l\'ordre chronologique)', () => {
    const s = sessionLongue({ forteEgale: true });
    const g = gardees(choisirSequencesV4(s.entree).scenes);
    expect(new Set(g.map((x) => x.bloc)).size).toBe(6);
    const premiereHeure = g.filter((x) => x.de < 3600).length;
    expect(premiereHeure).toBeLessThan(g.length * 0.75);
  });

  it('meilleureDAbord : note, puis force du cœur ; à égalité parfaite, pas l\'ordre des débuts', () => {
    const h = (de: number, noteBrute: number, forceCoeur = 0): Histoire => ({ de, a: de + 60, i0: 0, i1: 0, coeur: { de, a: de }, iCoeur: -1, forceCoeur, moments: [], garde: 40, parole: 30, punchlines: 0, echanges: 0, noteBrute });
    expect([h(10, 1), h(500, 2)].sort(meilleureDAbord)[0]!.de).toBe(500);
    expect([h(10, 1, 0.2), h(500, 1, 0.9)].sort(meilleureDAbord)[0]!.de).toBe(500);
    const egales = Array.from({ length: 30 }, (_, i) => h(100 + i * 200, 1));
    const ordre = [...egales].sort(meilleureDAbord).map((x) => x.de);
    expect(ordre).not.toEqual(egales.map((x) => x.de));
    expect([...egales].reverse().sort(meilleureDAbord).map((x) => x.de)).toEqual(ordre);
  });

  it('le moment le plus fort de la session gagne même s\'il est à la fin (durée visée d\'une histoire)', () => {
    const s = sessionLongue();
    const fort: MomentV4 = { ...s.entree.moments.find((m) => m.genre === 'fouRire' && m.t > 5000)!, force: 5 };
    const moments = s.entree.moments.map((m) => (m.t === fort.t ? fort : m));
    const scenes = choisirSequencesV4({ ...s.entree, moments, dureeVisee: 55 }).scenes;
    const g = gardees(scenes);
    expect(g.length).toBeLessThanOrEqual(2);
    const meilleure = [...scenes].sort((x, y) => y.noteBrute - x.noteBrute)[0]!;
    expect(fort.t >= meilleure.de && fort.t < meilleure.a).toBe(true);
    expect(meilleure.garde).toBe(true);
  });
});

describe('séquences v4 : une histoire (mise en place, cœur, chute)', () => {
  // Un échange : phrases de 5 mots (0,3 s, toutes les 0,4 s), séparées de 0,8 s, de 100 à ≈ 140 s ; 10 s de jeu avant.
  const mots: Mot[] = [];
  const phrases: [number, number][] = [];
  for (let t = 100; t < 140; ) {
    const d = t;
    for (let i = 0; i < 5; i++, t += 0.4) mots.push(['mot', Math.round(t * 100) / 100, Math.round((t + 0.3) * 100) / 100]);
    phrases.push([d, Math.round((t - 0.1) * 100) / 100]);
    t += 0.8;
  }
  for (let t = 60; t < 88; t += 0.4) mots.push(['avant', Math.round(t * 100) / 100, Math.round((t + 0.3) * 100) / 100]);
  for (let t = 150; t < 200; t += 0.4) mots.push(['apres', Math.round(t * 100) / 100, Math.round((t + 0.3) * 100) / 100]);
  mots.sort((x, y) => x[1] - y[1]);
  const parole: ParoleDetectee = { src: 's1', methode: 'mots', segments: [], probas: null, part: 0 };
  const cri: MomentV4 = { de: 125, a: 126, t: 125, genre: 'cri', force: 0.9, indices: [] };
  const rire: MomentV4 = { de: 127.5, a: 129, t: 127.5, genre: 'rire', force: 0.6, indices: [] };
  const e: EntreeSequences = {
    src: 's1',
    duree: 300,
    mots,
    parole,
    moments: [cri, rire],
    voix: null,
    signaux: { src: 's1', duree: 300, pas: 0.02, rms: new Float32Array(15000), pics: [], cris: [], rires: [], muets: [] },
    dureeVisee: 60,
    dureeDe: dureeDeMorceaux(coupesSimples(mots.map((m) => ({ de: m[1], a: m[2] })))),
  };
  const u = paroles(e);

  it('mise en place : le début de l\'échange (au début d\'une phrase), 8 à 30 s avant le cœur', () => {
    const i = debutMiseEnPlace(u, cri.de);
    expect(u[i]!.de).toBeCloseTo(100, 5);
    expect(bordAvant(u, i)).toBeLessThanOrEqual(100);
    expect(bordAvant(u, i)).toBeGreaterThan(88.3);
    // Un cœur juste après le début de l'échange : au moins 8 s avant, au début d'une phrase de l'échange d'avant.
    const j = debutMiseEnPlace(u, 103);
    expect(u[j]!.de).toBeLessThanOrEqual(95);
    expect(u[j]!.de).toBeGreaterThanOrEqual(103 - 30);
  });

  it('chute : fin de la phrase en cours après la réaction (+ 1 s dans la pause), jamais en plein mot', () => {
    const k = finChute(u, cri, 129);
    const phrase = phrases.find(([de, a]) => 129 >= de - 0.8 && 129 <= a + 0.8)!;
    expect(u[k]!.a).toBeCloseTo(phrase[1], 5);
    const fin = bordApres(u, k, 1, 300);
    expect(fin).toBeGreaterThan(phrase[1]);
    expect(fin).toBeLessThanOrEqual(phrase[1] + 0.45);
    expect(dansUnMot(mots, fin)).toBe(false);
  });

  it('histoire complète : contient la mise en place, le cri, le rire (réaction) et sa chute ; complétée jusqu\'à ≈ 60 s gardées', () => {
    const h = histoireAutour(cri, 0, e, u)!;
    expect(h.de).toBeLessThanOrEqual(100);
    expect(h.a).toBeGreaterThan(129);
    expect(h.moments).toEqual([0, 1]);
    expect(h.garde).toBeGreaterThanOrEqual(REGLES_HISTOIRES.garde.min);
    expect(h.a - h.de).toBeLessThanOrEqual(REGLES_HISTOIRES.source.max);
    expect(dansUnMot(mots, h.de) || dansUnMot(mots, h.a)).toBe(false);
    // Le cœur compte double : la note dépasse celle de la même plage sans cœur.
    const sans = histoireAutour(cri, -1, e, u)!;
    expect(h.noteBrute).toBeGreaterThan(sans.noteBrute);
  });

  it('fusion : la même histoire n\'est gardée qu\'une fois ; deux voisines proches n\'en font qu\'une (≤ 120 s)', () => {
    const a = histoireAutour(cri, 0, e, u, 20)!;
    const b = histoireAutour(rire, 1, e, u, 20)!;
    const f = fusionnerHistoires([a, b, a], e, u);
    expect(f.length).toBe(1);
    expect(f[0]!.a - f[0]!.de).toBeLessThanOrEqual(120);
    expect(f[0]!.moments).toEqual(expect.arrayContaining([0, 1]));
  });
});

describe('séquences v4 : répartition', () => {
  it('blocs de 20 min de son ACTIF : le passage muet ne compte pas, un petit dernier bloc rejoint le précédent', () => {
    const b = blocsActifs(3000, [{ de: 1000, a: 1600 }], [{ de: 10, a: 20 }, { de: 2500, a: 2510 }]);
    expect(b.nombre).toBe(2);
    expect(b.blocDe(1300)).toBe(-1);
    expect(b.blocDe(1700)).toBe(0);
    expect(b.blocDe(2000)).toBe(1);
    expect(b.parole).toEqual([10, 10]);
    expect(blocsActifs(1300, [], []).nombre).toBe(1);
  });

  it('centiles : la meilleure 100, la moins bonne 0, égalités au milieu', () => {
    expect(centiles([3, 1, 2])).toEqual([100, 0, 50]);
    expect(centiles([1, 1])).toEqual([50, 50]);
    expect(centiles([7])).toEqual([100]);
  });

  it('quotas : au moins 1 par bloc qui a une bonne histoire, jamais plus de places que N', () => {
    const b = { blocDe: () => 0, nombre: 4, parole: [100, 300, 0, 100] };
    const q = quotas(10, b, [80, 90, 10, 40], [1, 2, 0, 1]);
    expect(q[2]).toBe(0);
    expect(q.every((x, i) => i === 2 || x >= 1)).toBe(true);
    expect(q[1]).toBeGreaterThan(q[0]!);
    expect(quotas(2, b, [80, 90, 50, 40], [1, 2, 3, 0.5]).reduce((t, x) => t + x, 0)).toBeLessThanOrEqual(2);
  });

  it('vidéo courte (TikTok) : une seule histoire, raccourcie à la durée visée si besoin', () => {
    const s = sessionLongue({ dureeVisee: 40 });
    const g = gardees(choisirSequencesV4(s.entree).scenes);
    expect(g.length).toBe(1);
    expect(total(s.entree, g)).toBeLessThanOrEqual(40 * 1.05 + 1e-6);
  });

  it('échanges rapides comptés seulement si les voix sont sûres', () => {
    const avec = choisirSequencesV4(sessionLongue({ voix: true }).entree).scenes;
    const sans = choisirSequencesV4(sessionLongue().entree).scenes;
    expect(avec.some((x) => x.raison.includes('échanges rapides'))).toBe(true);
    expect(sans.some((x) => x.raison.includes('échanges rapides'))).toBe(false);
  });
});

describe('séquences v4 : cas limites', () => {
  it('mode voix (aucun texte) : des histoires quand même, « Partie n » en titre', () => {
    const s = sessionLongue();
    const mots: Mot[] = s.entree.parole.segments.map((x) => ['', x.de, x.a]);
    const choix = choisirSequencesV4({ ...s.entree, mots });
    expect(gardees(choix.scenes).length).toBeGreaterThan(5);
    expect(choix.scenes.every((x) => x.titre.startsWith('Partie '))).toBe(true);
  });

  it('rien à dire : aucune séquence, aucun passage', () => {
    const s = sessionLongue();
    const vide: EntreeSequences = { ...s.entree, mots: [], moments: [], parole: { ...s.entree.parole, segments: [] } };
    expect(choisirSequencesV4(vide)).toEqual({ scenes: [], passages: [] });
  });

  it('une vidéo sans voix : les moments (sons forts) font les histoires', () => {
    const s = sessionLongue();
    const sons: MomentV4[] = [500, 2500, 4500].map((t) => ({ de: t, a: t + 2, t, genre: 'sonFort', force: 0.8, indices: [] }));
    const e: EntreeSequences = { ...s.entree, mots: [], moments: sons, parole: { ...s.entree.parole, segments: [] }, dureeDe: (p: readonly PlageTemps[]) => p.reduce((t, x) => t + x.a - x.de, 0) };
    const g = gardees(choisirSequencesV4({ ...e, dureeVisee: 10 }).scenes);
    expect(g.length).toBeGreaterThan(0);
  });
});

describe('séquences v4 : « Plus de contexte / Moins » (ajusterSequence)', () => {
  const s = sessionLongue();
  const g = gardees(choisirSequencesV4(s.entree).scenes);
  const x = g[Math.floor(g.length / 2)]!;
  const u = paroles(s.entree);

  it('Plus de contexte au début : une phrase de plus avant, durée recalculée par e.dureeDe', () => {
    const y = ajusterSequence(x, s.entree, 'debut', 1);
    expect(y).not.toBe(x);
    expect(y.de).toBeLessThan(x.de);
    expect(y.a).toBe(x.a);
    expect(y.duree).toBeCloseTo(s.entree.dureeDe([y]), 1);
    expect(y.duree).toBeGreaterThan(x.duree);
    expect(dansUnMot(s.entree.mots, y.de)).toBe(false);
    expect(y.centile).toBe(x.centile);
    // Une phrase seulement : la parole juste avant le nouveau début est séparée par plus de 0,6 s.
    const avant = u.filter((p) => p.a <= y.de + 0.31);
    const derniere = avant[avant.length - 1];
    if (derniere) expect(u.find((p) => p.de >= y.de)!.de - derniere.a).toBeGreaterThan(0.6 - 1e-6);
  });

  it('Moins à la fin : une phrase de moins ; Plus puis Moins revient au même', () => {
    const y = ajusterSequence(x, s.entree, 'fin', -1);
    expect(y.a).toBeLessThan(x.a);
    expect(y.duree).toBeLessThan(x.duree);
    const z = ajusterSequence(ajusterSequence(x, s.entree, 'fin', 1), s.entree, 'fin', -1);
    expect(z.de).toBe(x.de);
    expect(z.a).toBeCloseTo(x.a, 2);
  });

  it('Moins ne retire jamais le moment au cœur ; rien à ajouter : la même séquence', () => {
    let y: SequenceV4 = x;
    for (let i = 0; i < 100; i++) y = ajusterSequence(y, s.entree, 'debut', -1);
    expect(y.de).toBeLessThanOrEqual(x.coeur.de + 1e-6);
    let z: SequenceV4 = x;
    for (let i = 0; i < 100; i++) z = ajusterSequence(z, s.entree, 'fin', -1);
    expect(z.a).toBeGreaterThanOrEqual(x.coeur.a - 1e-6);
    const premiere = choisirSequencesV4(s.entree).scenes[0]!;
    let p = premiere;
    for (let i = 0; i < 300; i++) p = ajusterSequence(p, s.entree, 'debut', 1);
    expect(ajusterSequence(p, s.entree, 'debut', 1)).toBe(p);
    expect(DUREE_LONGUE).toBe(7200);
  });
});
