import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mot } from '../recette/types';
import { appliquerCorrections, corriger, listerCorrections, memoriserCorrection, oublierCorrection } from './corrections';

/** Faux localStorage (les tests tournent dans Node). */
function fauxStockage() {
  const donnees = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => void donnees.set(k, v),
  });
  return donnees;
}

afterEach(() => vi.unstubAllGlobals());

describe('corriger', () => {
  it('remplace sans tenir compte de la casse ni de la ponctuation, et garde la ponctuation entendue', () => {
    const mots: Mot[] = [['jlb!', 0, 0.3, 1], ['Jlb', 1, 1.2], ['salut', 2, 2.2]];
    expect(corriger(mots, new Map([['jlb', 'JLB']]))).toEqual([['JLB!', 0, 0.3, 1], ['JLB', 1, 1.2], ['salut', 2, 2.2]]);
  });
  it('fusionne plusieurs mots en un seul', () => {
    const mots: Mot[] = [['on', 0, 0.2], ['joue', 0.3, 0.5], ['à', 0.6, 0.7], ['fort', 0.8, 1], ['nite.', 1, 1.3]];
    const table = new Map([['fort nite', 'Fortnite']]);
    expect(corriger(mots, table).map((m) => m[0])).toEqual(['on', 'joue', 'à', 'Fortnite.']);
    expect(corriger(mots, table)[3]).toEqual(['Fortnite.', 0.8, 1.3]);
  });
  it('garde l\'espace insécable française devant « ! »', () => {
    expect(corriger([['jlb\u00A0!', 0, 0.3, 1]], new Map([['jlb', 'JLB']]))).toEqual([['JLB\u00A0!', 0, 0.3, 1]]);
  });
});

describe('memoriserCorrection', () => {
  it('écrit dans arko.corrections et sert aux transcriptions suivantes', () => {
    const donnees = fauxStockage();
    memoriserCorrection('Jlb,', 'JLB');
    memoriserCorrection('fort  nite', 'Fortnite!');
    expect(JSON.parse(donnees.get('arko.corrections')!)).toEqual({ jlb: 'JLB', 'fort nite': 'Fortnite' });
    expect(appliquerCorrections([['jlb', 0, 0.2]])).toEqual([['JLB', 0, 0.2]]);
  });
  it('ignore une correction vide ou identique', () => {
    fauxStockage();
    memoriserCorrection('salut', '  ');
    memoriserCorrection('salut', 'salut');
    expect(listerCorrections()).toEqual([]);
  });
  it('« constructor » et « __proto__ » sont des mots comme les autres', () => {
    const donnees = fauxStockage();
    // Avant la Map : table['constructor'] renvoyait une fonction et la transcription plantait.
    expect(appliquerCorrections([['constructor', 0, 0.3], ['__proto__', 0.4, 0.6], ['toString', 0.7, 0.9]])).toEqual([
      ['constructor', 0, 0.3],
      ['__proto__', 0.4, 0.6],
      ['toString', 0.7, 0.9],
    ]);
    memoriserCorrection('constructor', 'Constructeur');
    memoriserCorrection('hasOwnProperty', 'Possède');
    expect(JSON.parse(donnees.get('arko.corrections')!)).toEqual({ constructor: 'Constructeur', hasownproperty: 'Possède' });
    expect(appliquerCorrections([['constructor', 0, 0.3]])).toEqual([['Constructeur', 0, 0.3]]);
  });
  it('liste et oublie les corrections', () => {
    fauxStockage();
    memoriserCorrection('jlb', 'JLB');
    memoriserCorrection('on', 'ON');
    expect(listerCorrections()).toEqual([
      { avant: 'jlb', apres: 'JLB' },
      { avant: 'on', apres: 'ON' },
    ]);
    oublierCorrection('On !');
    expect(listerCorrections()).toEqual([{ avant: 'jlb', apres: 'JLB' }]);
    expect(appliquerCorrections([['on', 0, 0.2]])).toEqual([['on', 0, 0.2]]);
  });
  it('marche sans localStorage', () => {
    expect(() => memoriserCorrection('a', 'b')).not.toThrow();
    expect(appliquerCorrections([['a', 0, 1]])).toEqual([['a', 0, 1]]);
  });
});
