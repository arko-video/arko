// Tests de la bouche façon PNGtuber et de l'émotion d'un tour (dev 3).
import { describe, expect, it } from 'vitest';
import type { SignauxSource } from '../auto/types';
import type { Mot, TourDeParole } from '../recette/types';
import { BOUCHE, bitsBouche, boucheOuverte, completerTours, depuisBase64, versBase64 } from './bouche';
import { emotionDuTour } from './emotions';

/** Enveloppe de 20 ms : `fort` (dB) sur les plages données, −60 dB ailleurs. */
function enveloppe(duree: number, fort: [number, number][], db = -20) {
  const n = Math.round(duree / 0.02);
  const v = new Float32Array(n).fill(-60);
  for (const [a, b] of fort) for (let i = Math.round(a / 0.02); i < Math.round(b / 0.02); i++) v[i] = db;
  return { pas: 0.02, db: v };
}

function signaux(o: Partial<SignauxSource> & { niveau?: number } = {}): SignauxSource {
  const rms = new Float32Array(3000).fill(10 ** ((o.niveau ?? -30) / 20));
  return { src: 's1', duree: 60, pas: 0.02, rms, pics: [], cris: [], rires: [], muets: [], ...o };
}

const tour = (ts: number, fin: number, b?: string): TourDeParole => ({ ts, fin, p: 'p1', ...(b ? { b } : {}) });

describe('bouche (bitsBouche, boucheOuverte)', () => {
  it('base64 aller-retour', () => {
    const o = new Uint8Array([0, 255, 128, 7, 99]);
    expect([...depuisBase64(versBase64(o))]).toEqual([...o]);
    expect(versBase64(new Uint8Array([255, 0]))).toBe(btoa(String.fromCharCode(255, 0)));
  });
  it('ouverte quand la voix dépasse le seuil, fermée sinon ; aller-retour par les bits', () => {
    const env = enveloppe(4, [[1, 1.4], [2, 2.6]]);
    const b = bitsBouche(env, 0.5, 3.5, -40);
    const t = tour(0.5, 3.5, b);
    expect(boucheOuverte(t, 0.7)).toBe(false);
    expect(boucheOuverte(t, 1.1)).toBe(true);
    expect(boucheOuverte(t, 1.6)).toBe(false);
    expect(boucheOuverte(t, 2.3)).toBe(true);
    expect(boucheOuverte(t, 3.0)).toBe(false);
    // Longueur bornée comme le veut le normaliseur : ⌈(fin − ts) / 0,04 / 6⌉ + 4.
    expect(b.length).toBeLessThanOrEqual(Math.ceil(3 / 0.04 / 6) + 4);
  });
  it('tenue minimale 0,08 s : un éclat de 20 ms garde la bouche ouverte 2 pas', () => {
    const env = enveloppe(2, [[1.0, 1.02]]);
    const t = tour(0, 2, bitsBouche(env, 0, 2, -40));
    expect(boucheOuverte(t, 1.01)).toBe(true);
    expect(boucheOuverte(t, 1.05)).toBe(true);
    expect(boucheOuverte(t, 1.09)).toBe(false);
  });
  it('sans bits : pendant les mots, 6 battements par seconde ; hors du tour : fermée', () => {
    const mots: Mot[] = [['salut', 1, 1.5]];
    const t = tour(0.5, 3);
    expect(boucheOuverte(t, 0.8, mots)).toBe(false);
    expect(boucheOuverte(t, 1.01, mots)).toBe(true);
    expect(boucheOuverte(t, 1.01 + 1 / 12, mots)).toBe(false);
    expect(boucheOuverte(t, 1.01 + 2 / 12, mots)).toBe(true);
    expect(boucheOuverte(t, 3.2, mots)).toBe(false);
    let ouvertures = 0;
    for (let k = 0; k < 120; k++) if (boucheOuverte(tour(0, 10), k / 120) && !boucheOuverte(tour(0, 10), (k - 1) / 120)) ouvertures++;
    expect(ouvertures).toBe(BOUCHE.battementSansMots);
  });
  it('completerTours : émotion + bits, seuil = niveau de la personne − 10 dB', () => {
    const env = enveloppe(4, [[1, 2]], -35);
    const [a] = completerTours([tour(0.5, 3)], { enveloppe: () => env, niveaux: { p1: -30 } });
    expect(a!.emo).toBe('parle');
    expect(boucheOuverte(a!, 1.5)).toBe(true); // −35 > −40
    const [b] = completerTours([tour(0.5, 3)], { enveloppe: () => env, niveaux: { p1: -20 } });
    expect(boucheOuverte(b!, 1.5)).toBe(false); // −35 < −30
    const [c] = completerTours([tour(0.5, 3, 'AAAA')], {});
    expect(c!.b).toBeUndefined();
  });
});

describe('émotion d\'un tour (une règle par émotion)', () => {
  const m = (txt: string, ts = 1, fin = 1.4, fort?: 1): Mot => (fort ? [txt, ts, fin, fort] : [txt, ts, fin]);
  it('rire → rit ; rire fort ou ≥ 3 s → mortDeRire', () => {
    expect(emotionDuTour(tour(0, 5), [], signaux({ rires: [{ de: 1, a: 2, t: 1.5, force: 0.4 }] }))).toBe('rit');
    expect(emotionDuTour(tour(0, 5), [], signaux({ rires: [{ de: 1, a: 2, t: 1.5, force: 0.8 }] }))).toBe('mortDeRire');
    expect(emotionDuTour(tour(0, 5), [], signaux({ rires: [{ de: 1, a: 4.2, t: 1.5, force: 0.3 }] }))).toBe('mortDeRire');
  });
  it('cri → crie ; cri au-dessus de −6 dBFS → hurle', () => {
    expect(emotionDuTour(tour(0, 5), [], signaux({ cris: [{ de: 1, a: 2, t: 1.5, force: 0.5 }], niveau: -12 }))).toBe('crie');
    expect(emotionDuTour(tour(0, 5), [], signaux({ cris: [{ de: 1, a: 2, t: 1.5, force: 0.9 }], niveau: -3 }))).toBe('hurle');
  });
  it('juron dit fort → enerve ; deux → rage ; juron murmuré → parle', () => {
    expect(emotionDuTour(tour(0, 5), [m('putain')], signaux({ niveau: -10 }))).toBe('enerve');
    expect(emotionDuTour(tour(0, 5), [m('putain'), m('merde', 2, 2.3)], signaux({ niveau: -10 }))).toBe('rage');
    expect(emotionDuTour(tour(0, 5), [m('putain')], signaux({ niveau: -30 }))).toBe('parle');
  });
  it('« quoi ?! » après un calme → surpris ; avec un gros pic → choque', () => {
    const s = signaux({ niveau: -45 });
    s.rms.fill(10 ** (-12 / 20), 100, 250);
    expect(emotionDuTour(tour(2, 5), [m('Quoi', 2.1, 2.4)], s)).toBe('surpris');
    expect(emotionDuTour(tour(2, 5), [m('Hein?!', 2.1, 2.4)], { ...s, pics: [{ ts: 2.5, db: -3, z: 7 }] })).toBe('choque');
    expect(emotionDuTour(tour(2, 5), [m('quoi', 2.1, 2.4)], signaux({ niveau: -12 }))).toBe('parle'); // pas de calme avant
  });
  it('gg / ez / trop fort → frime ; nul / noob / mdr → moqueur', () => {
    expect(emotionDuTour(tour(0, 5), [m('GG')], null)).toBe('frime');
    expect(emotionDuTour(tour(0, 5), [m('trop'), m('fort', 1.4, 1.7)], null)).toBe('frime');
    expect(emotionDuTour(tour(0, 5), [m('t\'es'), m('nul', 1.4, 1.7)], null)).toBe('moqueur');
    expect(emotionDuTour(tour(0, 5), [m('mdr')], null)).toBe('moqueur');
  });
  it('« vite », « aide », « non non » dit fort → panique ; dit doucement → parle', () => {
    expect(emotionDuTour(tour(0, 5), [m('vite', 1, 1.3, 1)], signaux({ niveau: -30 }))).toBe('panique');
    expect(emotionDuTour(tour(0, 5), [m('non'), m('non', 1.4, 1.6)], signaux({ niveau: -10 }))).toBe('panique');
    expect(emotionDuTour(tour(0, 5), [m('vite')], signaux({ niveau: -30 }))).toBe('parle');
  });
  it('sinon : parle', () => expect(emotionDuTour(tour(0, 5), [m('bonjour')], signaux())).toBe('parle'));
});
