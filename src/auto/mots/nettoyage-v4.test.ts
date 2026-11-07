import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import type { EnveloppeDb } from '../types-v3';
import type { EntreeMots, ParoleDetectee } from '../types-v4';
import { nettoyerMotsV4 } from './nettoyage-v4';
import { boucles, trouverPiles } from './piles';

const PAS = 0.032;

/** Parole fabriquée : la VAD dit p ≈ 0,9 dans les plages, ≈ 0,02 ailleurs ; les segments sont ces plages. */
function parole(plages: [number, number][], duree = 120): ParoleDetectee {
  const p = new Uint8Array(Math.ceil(duree / PAS)).fill(5);
  for (const [de, a] of plages) for (let k = Math.floor(de / PAS); k < Math.ceil(a / PAS); k++) p[k] = 230;
  const segments = plages.map(([de, a]) => ({ de, a, p: 0.9 }));
  return { src: 's', methode: 'vad', segments, probas: { src: 's', pas: PAS, p, plages: [{ de: 0, a: duree }], modele: 'silero-vad-v5' }, part: 0 };
}

/** Énergie fabriquée : jeu à −60 dB partout, −35 dB dans la parole, plus des passages forts donnés. */
function energie(plages: [number, number][], forts: [number, number][] = [], duree = 120): EnveloppeDb {
  const db = new Float32Array(Math.ceil(duree / 0.02)).fill(-60);
  for (const [de, a] of plages) db.fill(-35, Math.floor(de / 0.02), Math.ceil(a / 0.02));
  for (const [de, a] of forts) db.fill(-20, Math.floor(de / 0.02), Math.ceil(a / 0.02));
  return { pas: 0.02, db };
}

function entree(mots: Mot[], plages: [number, number][], forts: [number, number][] = []): EntreeMots {
  return { mots, plages: [{ de: 0, a: 120 }], parole: parole(plages), energie: energie(plages, forts) };
}

/** Mots normaux à la suite : 0,3 s chacun, collés. */
function suite(textes: string[], debut: number, duree = 0.3): Mot[] {
  return textes.map((t, i): Mot => [t, Math.round((debut + i * duree) * 100) / 100, Math.round((debut + (i + 1) * duree) * 100) / 100]);
}

/** Une pile : tous les mots au même instant, 0,02 s chacun. */
function pile(textes: string[], t: number): Mot[] {
  return textes.map((x): Mot => [x, t, t + 0.02]);
}

const textes = (m: readonly Mot[]) => m.map((x) => x[0]);

describe('piles et boucles (piles.ts)', () => {
  it('trouve les piles : ≥ 3 mots sans vrai temps à la suite', () => {
    const m = [...suite(['a', 'b'], 1), ...pile(['c', 'd', 'e', 'f'], 2), ...suite(['g'], 3), ...pile(['h', 'i'], 4)];
    expect(trouverPiles(m)).toEqual([[2, 5]]);
  });
  it('une boucle de 7 mots répétée 4 fois est gardée une fois ; « non non » reste', () => {
    const phrase = ['il', 'faut', 'aller', 'là', 'bas', 'tout', 'de'];
    const m = [...suite(['non', 'non'], 0), ...suite([...phrase, ...phrase, ...phrase, ...phrase], 1, 0.1)];
    const b = boucles(m);
    expect(b.boucles).toBe(1);
    expect(b.retires.size).toBe(21);
    expect(m.filter((_, i) => !b.retires.has(i)).map((x) => x[0])).toEqual(['non', 'non', ...phrase]);
  });
});

describe('nettoyerMotsV4', () => {
  it('pile près de la parole : ses mots sont répartis dans la parole libre, dans l’ordre, texte inchangé', () => {
    const avant = suite(['salut', 'toi'], 10.1);
    const p = pile(['alors', 'tu', 'viens', 'ou', 'quoi'], 11);
    const r = nettoyerMotsV4(entree([...avant, ...p], [[10, 13]]));
    expect(textes(r.mots)).toEqual(['salut', 'toi', 'alors', 'tu', 'viens', 'ou', 'quoi']);
    const reparties = r.mots.slice(2);
    expect(reparties.every((m) => m[1] >= 10.7 - 1e-6 && m[2] <= 13 + 1e-6 && m[2] - m[1] >= 0.05)).toBe(true);
    for (let i = 1; i < reparties.length; i++) expect(reparties[i]![1]).toBeGreaterThanOrEqual(reparties[i - 1]![2] - 1e-6);
    // Plus de pile (débuts tous à plus de 0,05 s).
    expect(trouverPiles(r.mots)).toEqual([]);
    // « viens » (5 lettres) dure plus que « tu » (2 lettres).
    expect(reparties[2]![2] - reparties[2]![1]).toBeGreaterThan(reparties[1]![2] - reparties[1]![1]);
    expect(r.bilan).toMatchObject({ avant: 7, apres: 7, piles: 1, motsDePiles: 5, repartis: 5, horsParole: 0 });
  });

  it('pile dans le jeu (aucune parole autour) : retirée', () => {
    const r = nettoyerMotsV4(entree([...suite(['oui'], 5.1), ...pile(['merci', 'à', 'tous', 'les', 'amis'], 40)], [[5, 6]]));
    expect(textes(r.mots)).toEqual(['oui']);
    expect(r.bilan).toMatchObject({ avant: 6, apres: 1, piles: 1, motsDePiles: 5, repartis: 0 });
  });

  it('une boucle de répétition (une phrase répétée en boucle) n’est gardée qu’une fois', () => {
    const phrase = ['on', 'va', 'tous', 'mourir', 'ici', 'les', 'gars'];
    const mots = [...suite(phrase, 20, 0.2), ...pile([...phrase, ...phrase, ...phrase], 21.5)];
    const r = nettoyerMotsV4(entree(mots, [[20, 22]]));
    expect(textes(r.mots)).toEqual(phrase);
    expect(r.bilan.motsDePiles).toBe(21);
  });

  it('mot étiré sur un silence : fin ramenée à la fin de la voix', () => {
    const r = nettoyerMotsV4(entree([['ouais', 30, 31.5]], [[29.8, 30.4]]));
    expect(r.mots[0]![1]).toBe(30);
    expect(r.mots[0]![2]).toBeGreaterThan(30.35);
    expect(r.mots[0]![2]).toBeLessThanOrEqual(30.45);
    expect(r.bilan.etires).toBe(1);
  });

  it('mot étiré qui commence dans le silence (1er mot d’une fenêtre) : posé sur la voix', () => {
    const r = nettoyerMotsV4(entree([['attends', 50, 58], ...suite(['quoi'], 58.1)], [[57.5, 58.5]]));
    expect(r.mots[0]![1]).toBeGreaterThan(57.4);
    expect(r.mots[0]![2]).toBeLessThanOrEqual(58.01);
  });

  it('mot étiré sur deux bouts de voix séparés : il garde le premier', () => {
    const r = nettoyerMotsV4(entree([['bon', 60, 61.5]], [[60, 60.3], [61.2, 62]]));
    expect(r.mots[0]![1]).toBe(60);
    expect(r.mots[0]![2]).toBeLessThan(60.4);
  });

  it('mot hors parole retiré ; cri que la VAD a ratée (fort) gardé', () => {
    const r = nettoyerMotsV4(entree([...suite(['salut'], 10.1), ['bah', 70, 70.3], ['AAAH', 90, 90.5, 1]], [[10, 11]], [[89.9, 90.6]]));
    expect(textes(r.mots)).toEqual(['salut', 'AAAH']);
    expect(r.mots[1]).toEqual(['AAAH', 90, 90.5, 1]);
    expect(r.bilan.horsParole).toBe(1);
  });

  it('bords qui débordent un peu de la parole : recalés sur le segment', () => {
    const r = nettoyerMotsV4(entree([['hop', 9.9, 10.3], ['là', 10.7, 11.1]], [[10, 11]]));
    expect(r.mots.map((m) => [m[1], m[2]])).toEqual([[10, 10.3], [10.7, 11]]);
    expect(r.bilan.recales).toBe(2);
  });

  it('texte jamais changé, `fort` gardé, mots triés sans durée nulle', () => {
    const mots: Mot[] = [['Non !', 12, 12.3, 1], ['vas-y', 11, 11], ['  ', 11.5, 11.7]];
    const r = nettoyerMotsV4(entree(mots, [[10, 13]]));
    expect(r.mots.map((m) => m[0])).toEqual(['vas-y', '  ', 'Non !']);
    expect(r.mots[2]![3]).toBe(1);
    expect(r.mots.every((m) => m[2] > m[1])).toBe(true);
    expect(nettoyerMotsV4(entree(mots, [[10, 13]])).mots).toEqual(r.mots);
  });

  it('sans parole connue (mots seuls) : rien n’est retiré pour « hors parole », les étirés sont plafonnés', () => {
    const e: EntreeMots = { mots: [['loin', 80, 80.3], ['long', 90, 91.5]], plages: [{ de: 0, a: 120 }], parole: { src: 's', methode: 'mots', segments: [{ de: 80, a: 91.5, p: 1 }], probas: null, part: 0 }, energie: null };
    const r = nettoyerMotsV4(e);
    expect(r.mots.map((m) => [m[0], m[1], m[2]])).toEqual([['loin', 80, 80.3], ['long', 90, 90.8]]);
  });

  it('repli sans modèle (segments sans probabilités) : mêmes règles sur les segments', () => {
    const p = parole([[10, 12]]);
    const e: EntreeMots = { mots: [...suite(['ok', 'ça', 'marche'], 10.2), ['fantôme', 60, 60.4]], plages: [{ de: 0, a: 120 }], parole: { ...p, methode: 'sans-modele', probas: null }, energie: null };
    expect(textes(nettoyerMotsV4(e).mots)).toEqual(['ok', 'ça', 'marche']);
  });

  it('bilan juste : retirés = mots de piles non répartis + hors parole ; rapide sur 2 h de mots', () => {
    const mots: Mot[] = [];
    const plages: [number, number][] = [];
    for (let t = 0; t < 7000; t += 10) {
      plages.push([t + 1, t + 5]);
      const k = String(t);
      mots.push(...suite(['un', 'deux', 'trois', k], t + 1.2), ...pile(['a', 'b', 'c', k], t + 3), ['perdu', t + 8, t + 8.3]);
    }
    const e: EntreeMots = { mots, plages: [{ de: 0, a: 7200 }], parole: parole(plages, 7200), energie: energie(plages, [], 7200) };
    const t0 = performance.now();
    const r = nettoyerMotsV4(e);
    expect(performance.now() - t0).toBeLessThan(3000);
    const b = r.bilan;
    expect(b.avant - b.apres).toBe(b.motsDePiles - b.repartis + b.horsParole);
    expect(b.horsParole).toBe(700);
    expect(b.repartis).toBe(2800);
  });
});
