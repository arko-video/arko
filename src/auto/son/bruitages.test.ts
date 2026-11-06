// E. Bruitages auto : déclencheurs (un par catégorie du brief), « non ! » ≠ « non », +0,1 s, −4 dB, 2 par minute,
// signaux (rire, juron crié, silence gênant), liste éditable relue : ces règles sont celles du MODE_LARGE (ancien
// réglage). Le mode PRUDENT par défaut (retour de Romain) est testé dans reaction.test.ts.
import { describe, expect, it } from 'vitest';
import type { Mot } from '../../recette/types';
import type { SignauxSource } from '../types';
import { BRUITAGES, dureeBruitage, limiterParMinute, MODE_LARGE, proposerBruitages, trouverExpression, volDepuisDb } from './bruitages';
import { DECLENCHEURS_DEFAUT, lireDeclencheurs, motsDepuisTexte, type CategorieBruitage } from './declencheurs';

/** Phrase posée à partir de `t`, un mot toutes les 0,4 s. */
function phrase(texte: string, t: number): Mot[] {
  return texte.split(' ').map((m, i) => [m, t + i * 0.4, t + i * 0.4 + 0.3] as Mot);
}

function signaux(o: Partial<SignauxSource> = {}, duree = 600): SignauxSource {
  return { src: 's1', duree, pas: 0.02, rms: new Float32Array(Math.round(duree / 0.02)).fill(0.01), pics: [], cris: [], rires: [], muets: [], ...o };
}

const cat = (mots: Mot[], s: SignauxSource | null = null) => proposerBruitages(mots, 's1', s, DECLENCHEURS_DEFAUT, MODE_LARGE).map((p) => p.categorie);

describe('déclencheurs du brief', () => {
  const cas: [string, CategorieBruitage][] = [
    ['on a gagné les gars', 'reussite'],
    ['je l\'ai fait 300 fois', 'reussite'],
    ['wow regarde ça', 'wow'],
    ['il me reste 1000 PV', 'wow'],
    ['zéro diamant', 'bruh'],
    ['je suis bloqué là', 'triste'],
    ['on est coincés ici', 'triste'],
    ['c\'est impossible', 'rate'],
    ['je suis invincible', 'destin'],
    ['c\'est le destin', 'destin'],
    ['la TNT explose', 'explosion'],
    ['Non!', 'ohnon'],
    ['je suis mort', 'wasted'],
    ['gros spawn kill', 'wasted'],
    ['allez tchao', 'fin'],
  ];
  for (const [texte, c] of cas) {
    it(`« ${texte} » → ${c}`, () => expect(cat(phrase(texte, 10))).toEqual([c]));
  }

  it('« non ! » demande le point d\'exclamation (mot collé ou à part)', () => {
    expect(cat(phrase('non je crois pas', 10))).toEqual([]);
    expect(cat(phrase('non ! pas ça', 10))).toEqual(['ohnon']);
    expect(trouverExpression(phrase('NON! non', 0), 'non !')).toEqual([{ k0: 0, k1: 0 }]);
  });

  it('expression entière : « mortel » ne déclenche pas « mort »', () => {
    expect(cat(phrase('c\'est mortel', 10))).toEqual([]);
  });

  it('posé au début du mot + 0,1 s, à −4 dB, 4 s au plus avec un fondu de 0,3 s', () => {
    const [p] = proposerBruitages(phrase('bon wow', 20), 's1', null, DECLENCHEURS_DEFAUT, MODE_LARGE);
    expect(p).toMatchObject({ ts: 20.5, src: 's1', k: 1, vol: 0.631, dur: 4, fondu: 0.3 });
    expect(p!.pourquoi).toBe('« wow » à 0:20');
    expect(volDepuisDb(BRUITAGES.gainDb)).toBeCloseTo(0.631, 3);
    expect(dureeBruitage(1)).toBe(2);
    expect(dureeBruitage(3)).toBe(3);
    expect(dureeBruitage(12)).toBe(4);
  });
});

describe('déclencheurs venus du son', () => {
  it('rire fort seulement', () => {
    const s = signaux({ rires: [{ de: 30, a: 32, t: 31, force: 0.9 }, { de: 100, a: 101, t: 100.5, force: 0.3 }] });
    const r = proposerBruitages([], 's1', s, DECLENCHEURS_DEFAUT, MODE_LARGE);
    expect(r.map((p) => [p.categorie, p.ts])).toEqual([['rire', 30.1]]);
  });

  it('juron crié (pic de son) → boom ; juron dit doucement → rien', () => {
    const fort = signaux({ pics: [{ ts: 50.1, db: -8, z: 4 }] });
    expect(cat(phrase('putain', 50), fort)).toEqual(['boom']);
    expect(cat(phrase('putain', 50), signaux())).toEqual([]);
    expect(cat(phrase('putain!', 50), null)).toEqual(['boom']);
  });

  it('silence gênant : 3 s après une question, 5 s sinon, son du jeu calme', () => {
    const mots: Mot[] = [['tu', 10, 10.2], ['viens?', 10.3, 10.6], ['euh', 14, 14.2], ['ok', 16, 16.2]];
    expect(proposerBruitages(mots, 's1', signaux(), DECLENCHEURS_DEFAUT, MODE_LARGE).map((p) => [p.categorie, p.ts])).toEqual([['grillons', 11.6]]);
    const bruyant = signaux({ rms: new Float32Array(30000).fill(0.2) });
    expect(cat(mots, bruyant)).toEqual([]);
  });
});

describe('au plus 2 par minute, les plus sûrs d\'abord', () => {
  it('6 « wow » en une minute → 2 gardés', () => {
    const mots = [0, 8, 16, 24, 32, 40].flatMap((t) => phrase('wow', t));
    expect(proposerBruitages(mots, 's1', null, DECLENCHEURS_DEFAUT, MODE_LARGE)).toHaveLength(2);
    expect(proposerBruitages(mots, 's1', null, DECLENCHEURS_DEFAUT, { ...MODE_LARGE, parMinute: 3 })).toHaveLength(3);
  });

  it('un mot exact passe avant un signal ; jamais deux à moins de 4 s', () => {
    const s = signaux({ rires: [{ de: 5, a: 6, t: 5.5, force: 1 }, { de: 20, a: 21, t: 20.5, force: 1 }] });
    const mots = [...phrase('on a gagné', 10), ...phrase('wow', 30)];
    const r = proposerBruitages(mots, 's1', s, DECLENCHEURS_DEFAUT, MODE_LARGE);
    expect(r.map((p) => p.categorie)).toEqual(['reussite', 'wow']);
    const l = limiterParMinute([{ ts: 0, surete: 1 }, { ts: 2, surete: 3 }, { ts: 61, surete: 1 }, { ts: 63, surete: 1 }], 2);
    expect(l.map((x) => x.ts)).toEqual([2, 61]);
  });
});

describe('liste éditable', () => {
  it('relit la liste gardée, garde les catégories connues, remet celles qui manquent', () => {
    const l = lireDeclencheurs(JSON.stringify([{ categorie: 'wow', mots: ['Incroyable', 'incroyable', ' ouf '] }, { categorie: 'pirate', mots: ['x'] }]));
    expect(l.find((d) => d.categorie === 'wow')!.mots).toEqual(['incroyable', 'ouf']);
    expect(l.find((d) => d.categorie === 'rire')!.signal).toBe('rire');
    expect(l).toHaveLength(DECLENCHEURS_DEFAUT.length);
    expect(lireDeclencheurs('{abîmé')).toEqual(DECLENCHEURS_DEFAUT.map((d) => ({ ...d, mots: [...d.mots] })));
    expect(motsDepuisTexte('gagné, on a gagné ,\n GG')).toEqual(['gagné', 'on a gagné', 'gg']);
  });

  it('un mot ajouté par l\'utilisateur déclenche (avec accents)', () => {
    const l = lireDeclencheurs(JSON.stringify([{ categorie: 'wow', mots: ['incroyable'] }]));
    expect(proposerBruitages(phrase('Incroyable !', 3), 's1', null, l, MODE_LARGE).map((p) => p.categorie)).toEqual(['wow']);
  });
});
