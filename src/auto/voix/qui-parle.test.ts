// C. Qui parle (dev 1) : voix fabriquées à des niveaux différents (−40 / −25 dB, comme la session de Romain), au même
// niveau (timbre seul), une seule voix, pistes séparées ; extraits ; lissage ; attribution des mots et phrases.
import { describe, expect, it } from 'vitest';
import type { Mot, TourDeParole } from '../../recette/types';
import type { EmpreintesVoix, VoixDetectees } from '../types-v3';
import { personneDuMot, phrasesParPersonne } from './attribution';
import { AccumulateurEmpreintes, PAS_EMPREINTES } from './empreintes';
import { extraitsDeVoix, separerVoix, voixDesPistes } from './qui-parle';
import { construireTours, lisserEtiquettes } from './tours';
import { bruitDeJeu, fabriquerVoix, FREQ_TEST, mixer, toursAlternes, VOIX_A, VOIX_B, type TourVrai } from './voix-test';

const DUREE = 90;

/** Empreintes d'un son, envoyé par morceaux de 0,5 s (comme le Worker). */
function empreintes(son: Float32Array, piste?: number): EmpreintesVoix {
  const acc = new AccumulateurEmpreintes(son.length / FREQ_TEST);
  const pas = FREQ_TEST / 2;
  for (let i = 0; i < son.length; i += pas) acc.ajouter(son.subarray(i, i + pas), FREQ_TEST, i / FREQ_TEST);
  return acc.resultat(piste);
}

/** Part des trames de parole (vérité) attribuées à la bonne voix (p1 = voix 0) ; et part des trames attribuées. */
function justesse(d: VoixDetectees, vrai: readonly TourVrai[], ids: [string, string] = ['p1', 'p2']): { juste: number; couvert: number } {
  let total = 0;
  let attribuees = 0;
  let justes = 0;
  for (const t of vrai)
    for (let x = t.de + 0.01; x < t.a; x += PAS_EMPREINTES) {
      total++;
      const tour = d.tours.find((u) => u.ts <= x && x < u.fin);
      if (!tour) continue;
      attribuees++;
      if (tour.p === ids[t.v]) justes++;
    }
  return { juste: justes / Math.max(1, attribuees), couvert: attribuees / Math.max(1, total) };
}

const zones = (vrai: readonly TourVrai[]) => vrai.map((t) => ({ de: t.de, a: t.a }));

describe('empreintes', () => {
  it('niveau de la bande voix ≈ niveau de la voix, une trame toutes les 20 ms', () => {
    const vrai = [{ v: 0 as const, de: 1, a: 4 }];
    const e = empreintes(fabriquerVoix(VOIX_A, vrai, 5, -30));
    expect(e.db.length).toBe(250);
    expect(e.bandes.length).toBe(250 * 8);
    const parle = Array.from(e.db.slice(60, 190)).sort((a, b) => a - b);
    expect(parle[Math.floor(parle.length / 2)]!).toBeGreaterThan(-36);
    expect(parle[Math.floor(parle.length / 2)]!).toBeLessThan(-24);
    expect(e.db[10]!).toBe(-100);
  });

  it('une source à 48 kHz donne les mêmes niveaux (réduite vers 16 kHz)', () => {
    const t16 = fabriquerVoix(VOIX_B, [{ de: 0.5, a: 2.5 }], 3, -30);
    const t48 = new Float32Array(t16.length * 3);
    for (let i = 0; i < t48.length; i++) t48[i] = t16[Math.floor(i / 3)]!;
    const acc = new AccumulateurEmpreintes(3);
    acc.ajouter(t48, 48000, 0);
    const e48 = acc.resultat();
    const e16 = empreintes(t16);
    for (const k of [40, 70, 100]) expect(Math.abs(e48.db[k]! - e16.db[k]!)).toBeLessThan(3);
  });
});

describe('séparer les voix d\'une seule piste', () => {
  const vrai = toursAlternes(DUREE);
  const a = fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), DUREE, -40, 1);
  const b = fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), DUREE, -25, 2);

  it('−40 et −25 dB (session de Romain) : niveau + timbre, ≥ 95 % des trames bien attribuées', () => {
    const e = empreintes(mixer(a, b, bruitDeJeu(DUREE, -52)));
    const d = separerVoix(e, zones(vrai), 's1');
    expect(d.methode).toBe('niveau+timbre');
    expect(d.voix.map((v) => v.id)).toEqual(['p1', 'p2']);
    expect(d.voix[0]!.niveauDb).toBeLessThan(d.voix[1]!.niveauDb - 8);
    const j = justesse(d, vrai);
    console.info(`qui parle −40/−25 dB : ${(j.juste * 100).toFixed(1)} % justes, ${(j.couvert * 100).toFixed(1)} % couvertes, sûres ${(d.sure * 100).toFixed(0)} %`);
    expect(j.juste).toBeGreaterThanOrEqual(0.95);
    expect(j.couvert).toBeGreaterThanOrEqual(0.85);
    expect(d.tours.every((t) => t.fin - t.ts >= 0.4 - 1e-9 && t.src === 's1')).toBe(true);
  });

  it('même niveau, timbres différents : timbre seul, ≥ 85 %', () => {
    const b30 = fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), DUREE, -30, 2);
    const a30 = fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), DUREE, -30, 1);
    const e = empreintes(mixer(a30, b30, bruitDeJeu(DUREE, -52)));
    const d = separerVoix(e, zones(vrai), 's1');
    expect(d.methode).toBe('timbre');
    // Au même niveau, l'ordre des ids n'est pas garanti : on prend la meilleure correspondance.
    const j = [justesse(d, vrai, ['p1', 'p2']), justesse(d, vrai, ['p2', 'p1'])].sort((x, y) => y.juste - x.juste)[0]!;
    console.info(`qui parle même niveau : ${(j.juste * 100).toFixed(1)} % justes, ${(j.couvert * 100).toFixed(1)} % couvertes`);
    expect(j.juste).toBeGreaterThanOrEqual(0.85);
  });

  it.each([[5, VOIX_A], [6, VOIX_B], [7, VOIX_A]] as const)('une seule voix (graine %i) : « une »', (graine, timbre) => {
    const seule = toursAlternes(DUREE, graine, true);
    const e = empreintes(mixer(fabriquerVoix(timbre, seule, DUREE, -30, graine), bruitDeJeu(DUREE, -52)));
    const d = separerVoix(e, zones(seule), 's1');
    expect(d.methode).toBe('une');
    expect(d.voix).toHaveLength(1);
    expect(justesse(d, seule.map((t) => ({ ...t, v: 0 as const }))).juste).toBe(1);
  });

  it('zones trouvées au son (sans mots) : ça marche aussi', async () => {
    const { zonesDeVoix } = await import('../coupes/voix');
    const e = empreintes(mixer(a, b, bruitDeJeu(DUREE, -52)));
    const d = separerVoix(e, zonesDeVoix(e), 's1');
    expect(d.methode).toBe('niveau+timbre');
    expect(justesse(d, vrai).juste).toBeGreaterThanOrEqual(0.9);
  });
});

describe('pistes séparées', () => {
  const vrai = toursAlternes(60, 8);
  const micro = mixer(fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), 60, -40, 1), bruitDeJeu(60, -70, 3));
  const discord = mixer(fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), 60, -25, 2), bruitDeJeu(60, -75, 4));
  const d = voixDesPistes([empreintes(micro, 0), empreintes(discord, 1)], 's1');

  it('méthode « pistes », sûre, une voix par piste, exact', () => {
    expect(d.methode).toBe('pistes');
    expect(d.sure).toBe(1);
    expect(d.voix.map((v) => [v.id, v.piste])).toEqual([['p1', 0], ['p2', 1]]);
    const j = justesse(d, vrai);
    expect(j.juste).toBe(1);
    expect(j.couvert).toBeGreaterThanOrEqual(0.9);
  });

  it('3 extraits par voix : tours sûrs de 2 à 4 s, espacés (60 s, sinon moins sur une courte vidéo)', () => {
    const ex = extraitsDeVoix(d, 'p1');
    expect(ex).toHaveLength(3);
    for (const x of ex) {
      expect(x.a - x.de).toBeGreaterThanOrEqual(1);
      expect(x.a - x.de).toBeLessThanOrEqual(4 + 1e-9);
      expect(d.tours.some((t) => t.p === 'p1' && t.ts <= x.de + 1e-6 && t.fin >= x.a - 1e-6)).toBe(true);
    }
    // Sur une longue vidéo : espacés d'au moins 60 s.
    const longs: TourDeParole[] = [10, 30, 100, 130, 200, 260].map((t) => ({ ts: t, fin: t + 3, p: 'p1' }));
    const ex2 = extraitsDeVoix({ src: 's1', methode: 'pistes', voix: [], tours: longs, sure: 1 }, 'p1');
    expect(ex2.map((x) => x.de)).toEqual([10, 100, 200]);
  });
});

describe('lissage et tours', () => {
  it('médiane sur 0,3 s, trous < 0,3 s bouchés, tours ≥ 0,4 s, incertain si < 60 % de trames sûres', () => {
    // 0 pendant 1 s, une trame de 1 au milieu, trou de 0,2 s, encore 0 pendant 0,5 s, puis 1 pendant 0,2 s seulement.
    const e = new Int8Array(120).fill(-1);
    for (let k = 0; k < 50; k++) e[k] = 0;
    e[25] = 1;
    for (let k = 60; k < 85; k++) e[k] = 0;
    for (let k = 100; k < 110; k++) e[k] = 1;
    const sure = new Uint8Array(120).fill(1);
    for (let k = 60; k < 85; k++) sure[k] = 0;
    const l = lisserEtiquettes(e, 15, 2);
    expect(l[25]).toBe(0);
    const { tours } = construireTours(l, sure, new Float32Array(120), 0.02, ['p1', 'p2'], { tourMin: 0.4, trouMax: 0.3 });
    expect(tours).toEqual([{ ts: 0, fin: 1.7, p: 'p1' }]);
    const { tours: t2 } = construireTours(l, sure.fill(0, 0, 60), new Float32Array(120), 0.02, ['p1', 'p2'], { tourMin: 0.4, trouMax: 0.3 });
    expect(t2[0]!.sur).toBe(false);
  });
});

describe('attribution des mots', () => {
  const tours: TourDeParole[] = [{ ts: 0, fin: 2, p: 'p1' }, { ts: 2, fin: 4, p: 'p2' }, { ts: 6, fin: 8, p: 'p1' }];
  const mots: Mot[] = [['salut', 0.2, 0.6], ['toi', 0.7, 1.0], ['ouais', 2.2, 2.6], ['ça', 2.7, 2.9], ['va', 3.0, 3.2], ['bon', 6.5, 6.9], ['allez', 1.8, 2.5]];

  it('personneDuMot : le plus long recouvrement', () => {
    expect(personneDuMot(tours, mots[0]!)).toBe('p1');
    expect(personneDuMot(tours, ['allez', 1.8, 2.5])).toBe('p2');
    expect(personneDuMot(tours, ['rien', 4.5, 5])).toBeNull();
  });

  it('phrasesParPersonne : trou > 0,6 s ou changement de personne = nouvelle phrase', () => {
    const tries = mots.slice(0, 6);
    const ph = phrasesParPersonne(tries, tours);
    expect(ph.map((p) => [p.k0, p.k1, p.p, p.texte])).toEqual([
      [0, 2, 'p1', 'salut toi'],
      [2, 5, 'p2', 'ouais ça va'],
      [5, 6, 'p1', 'bon'],
    ]);
    expect(ph[1]).toMatchObject({ ts: 2.2, fin: 3.2 });
  });
});
