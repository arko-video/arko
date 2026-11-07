// Qui parle v4 (dev-voix) : voix FABRIQUÉES (voix-test.ts), jamais de modèle ni de données privées.
// 2 voix à −40 / −25 dB avec du bruit de jeu, même niveau (timbre, et proposition de l'empreinte), une seule voix
// (avec de fausses alarmes de la VAD sur le jeu), 3 voix, ambigus, ordre p1 = la plus forte, « forcer » 1 et 2,
// pistes séparées inchangées, empreintes neuronales FAUSSES (vecteurs fabriqués : deux centres → cosinus).
import { describe, expect, it } from 'vitest';
import type { PlageTemps } from '../types';
import type { EmpreintesVoix } from '../types-v3';
import type { EmpreintesNeurales, EntreeVoix, ParoleDetectee, VoixDetecteesV4 } from '../types-v4';
import { AccumulateurEmpreintes } from './empreintes';
import { normer } from './groupes';
import { voixDesPistes } from './qui-parle';
import { morceauxAEmpreinter, REGLAGES_VOIX_V4, separerParEmpreintes, separerVoixV4 } from './qui-parle-v4';
import { bruitDeJeu, fabriquerVoix, FREQ_TEST, mixer, toursAlternes, toursATrois, VOIX_A, VOIX_B, VOIX_C, type TourVrai3 } from './voix-test';

const DUREE = 90;

function empreintes(son: Float32Array, piste?: number): EmpreintesVoix {
  const acc = new AccumulateurEmpreintes(son.length / FREQ_TEST);
  const pas = FREQ_TEST / 2;
  for (let i = 0; i < son.length; i += pas) acc.ajouter(son.subarray(i, i + pas), FREQ_TEST, i / FREQ_TEST);
  return acc.resultat(piste);
}

/** La parole « comme la VAD » : les tours vrais (+ des fausses alarmes éventuelles), en segments. */
function parole(zones: readonly PlageTemps[], duree = DUREE): ParoleDetectee {
  const segments = [...zones].sort((x, y) => x.de - y.de).map((z) => ({ de: z.de, a: z.a, p: 0.9 }));
  return { src: 's1', methode: 'vad', segments, probas: null, part: segments.reduce((t, s) => t + s.a - s.de, 0) / duree };
}

function entree(e: EmpreintesVoix, zones: readonly PlageTemps[], o: Partial<EntreeVoix> = {}): EntreeVoix {
  return { src: 's1', empreintes: [e], pistesSeparees: false, parole: parole(zones), neurales: null, ...o };
}

/** Part des instants de parole (vérité) attribués à la bonne voix (ids[v]), parmi ceux attribués ; et la couverture. */
function justesse(d: VoixDetecteesV4, vrai: readonly TourVrai3[], ids: readonly string[]): { juste: number; couvert: number } {
  let total = 0;
  let attribuees = 0;
  let justes = 0;
  for (const t of vrai)
    for (let x = t.de + 0.01; x < t.a; x += 0.02) {
      total++;
      const tour = d.tours.find((u) => u.ts <= x && x < u.fin);
      if (!tour) continue;
      attribuees++;
      if (tour.p === ids[t.v]) justes++;
    }
  return { juste: justes / Math.max(1, attribuees), couvert: attribuees / Math.max(1, total) };
}

/** La meilleure correspondance des ids (quand l'ordre n'est pas garanti). */
function meilleure(d: VoixDetecteesV4, vrai: readonly TourVrai3[]): { juste: number; couvert: number } {
  return [justesse(d, vrai, ['p1', 'p2']), justesse(d, vrai, ['p2', 'p1'])].sort((x, y) => y.juste - x.juste)[0]!;
}

/** Fausses empreintes : vecteur de la voix qui parle le plus dans la plage + bruit (graine fixe), normé. */
function faussesNeurales(plages: readonly PlageTemps[], vrai: readonly TourVrai3[], centres: readonly Float32Array[], bruit = 0.6, graine = 11): EmpreintesNeurales {
  let s = graine;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  return {
    modele: 'faux',
    morceaux: plages.map((p) => {
      const parVoix = [0, 0, 0];
      for (const t of vrai) parVoix[t.v]! += Math.max(0, Math.min(p.a, t.a) - Math.max(p.de, t.de));
      const v = parVoix.indexOf(Math.max(...parVoix));
      const c = centres[Math.min(v, centres.length - 1)]!;
      return { de: p.de, a: p.a, v: normer(Array.from(c, (x) => x + (bruit * r()) / Math.sqrt(c.length) * 3)) };
    }),
  };
}

function centreAuHasard(graine: number, dim = 192): Float32Array {
  let s = graine;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  return normer(Array.from({ length: dim }, r));
}

describe('qui parle v4 : 2 voix à des niveaux différents (session de Romain)', () => {
  const vrai = toursAlternes(DUREE);
  const a = fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), DUREE, -40, 1);
  const b = fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), DUREE, -25, 2);
  const e = empreintes(mixer(a, b, bruitDeJeu(DUREE, -52)));
  const d = separerVoixV4(entree(e, vrai))!;

  it('−40 / −25 dB : 2 voix par le niveau, ≥ 95 % justes, p1 = la plus forte', () => {
    expect(d.voix.map((v) => v.id)).toEqual(['p1', 'p2']);
    expect(d.methode).toBe('niveau+timbre');
    expect(d.separation.par).toBe('niveau');
    expect(d.separation.proposerEmpreinte).toBeNull();
    // p1 = la voix FORTE (−25 dB, vérité v = 1), à gauche dans la DA.
    expect(d.voix[0]!.niveauDb).toBeGreaterThan(d.voix[1]!.niveauDb + 8);
    expect(d.separation.ecartDb!).toBeGreaterThan(8);
    expect(d.separation.seuilDb!).toBeLessThan(d.voix[0]!.niveauDb);
    expect(d.separation.seuilDb!).toBeGreaterThan(d.voix[1]!.niveauDb);
    const j = justesse(d, vrai, ['p2', 'p1']);
    console.info(`qui parle v4 −40/−25 dB : ${(j.juste * 100).toFixed(1)} % justes, ${(j.couvert * 100).toFixed(1)} % couvertes`);
    expect(j.juste).toBeGreaterThanOrEqual(0.95);
    expect(j.couvert).toBeGreaterThanOrEqual(0.95);
  });

  it('tours : ≥ 0,3 s, triés, jamais au-delà de la marge autour de la parole, sans chevauchement', () => {
    expect(d.tours.length).toBeGreaterThan(10);
    for (const t of d.tours) {
      expect(t.fin - t.ts).toBeGreaterThanOrEqual(REGLAGES_VOIX_V4.tourMin - 1e-9);
      expect(t.src).toBe('s1');
      const proche = vrai.some((z) => z.de - REGLAGES_VOIX_V4.marge - 0.011 <= t.ts && t.ts <= z.a);
      expect(proche).toBe(true);
    }
    for (let i = 1; i < d.tours.length; i++) expect(d.tours[i]!.ts).toBeGreaterThanOrEqual(d.tours[i - 1]!.fin - 1e-9);
  });

  it('rien d\'ambigu : l\'empreinte n\'apporterait rien (morceauxAEmpreinter = [])', () => {
    expect(d.separation.ambigu).toBeLessThan(0.05);
    expect(d.sure).toBeGreaterThan(0.9);
    expect(morceauxAEmpreinter(entree(e, vrai), d)).toEqual([]);
  });

  it('« Une seule personne » (forcer 1) : une voix, sûre', () => {
    const u = separerVoixV4(entree(e, vrai, { forcer: 1 }))!;
    expect(u.voix).toHaveLength(1);
    expect(u.methode).toBe('une');
    expect(u.separation.proposerEmpreinte).toBeNull();
    expect(justesse(u, vrai.map((t) => ({ ...t, v: 0 as const })), ['p1']).juste).toBe(1);
  });

  it('le résultat ne dépend que des mesures (déterministe)', () => {
    expect(separerVoixV4(entree(e, vrai))).toEqual(d);
  });
});

describe('qui parle v4 : même niveau, une voix, ambigus', () => {
  const vrai = toursAlternes(DUREE);
  const a30 = fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), DUREE, -30, 1);
  const b30 = fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), DUREE, -30, 2);
  const eMeme = empreintes(mixer(a30, b30, bruitDeJeu(DUREE, -52)));

  it('2 voix au même niveau, sans empreinte : « une », empreinte proposée (« memeNiveau ») ; « Deux personnes » : timbre, ≥ 85 %', () => {
    const d = separerVoixV4(entree(eMeme, vrai))!;
    expect(d.methode).toBe('une');
    expect(d.voix).toHaveLength(1);
    expect(d.separation.proposerEmpreinte).toBe('memeNiveau');
    const f = separerVoixV4(entree(eMeme, vrai, { forcer: 2 }))!;
    expect(f.separation.par).toBe('timbre');
    expect(f.methode).toBe('timbre');
    expect(f.voix).toHaveLength(2);
    const j = meilleure(f, vrai);
    console.info(`qui parle v4 même niveau (« Deux personnes », timbre) : ${(j.juste * 100).toFixed(1)} % justes`);
    expect(j.juste).toBeGreaterThanOrEqual(0.85);
    // L'empreinte aiderait : des morceaux répartis, de 0,6 à 3 s, triés, 300 au plus.
    const m = morceauxAEmpreinter(entree(eMeme, vrai), d);
    expect(m.length).toBeGreaterThan(8);
    expect(m.length).toBeLessThanOrEqual(REGLAGES_VOIX_V4.max);
    for (const p of m) {
      expect(p.a - p.de).toBeGreaterThanOrEqual(0.6 - 1e-6);
      expect(p.a - p.de).toBeLessThanOrEqual(3);
    }
    for (let i = 1; i < m.length; i++) expect(m[i]!.de).toBeGreaterThanOrEqual(m[i - 1]!.de);
  });

  it('même niveau + empreintes (fausses, 2 centres) : « empreinte », cosinus < 0,68, ≥ 95 %', () => {
    const e0 = entree(eMeme, vrai);
    const plages = morceauxAEmpreinter(e0, separerVoixV4(e0));
    const centres = [centreAuHasard(1), centreAuHasard(2)];
    const d = separerVoixV4({ ...e0, neurales: faussesNeurales(plages, vrai, centres) })!;
    expect(d.separation.par).toBe('empreinte');
    expect(d.methode).toBe('timbre');
    expect(d.separation.cosinusCentres!).toBeLessThan(0.68);
    expect(d.separation.proposerEmpreinte).toBeNull();
    const j = meilleure(d, vrai);
    console.info(`qui parle v4 même niveau (empreinte) : ${(j.juste * 100).toFixed(1)} % justes`);
    expect(j.juste).toBeGreaterThanOrEqual(0.95);
  });

  it.each([[5, VOIX_A], [6, VOIX_B], [7, VOIX_A]] as const)('une seule voix (graine %i), fausses alarmes sur le jeu : « une »', { timeout: 60_000 }, (graine, timbre) => {
    const seule = toursAlternes(DUREE, graine, true);
    const jeu = bruitDeJeu(DUREE, -52, graine + 20);
    // Quelques sons du jeu plus forts que le fond, que la VAD prendrait pour de la voix.
    const fausses: PlageTemps[] = [];
    for (let i = 0; i + 1 < seule.length && fausses.length < 4; i += 5) fausses.push({ de: seule[i]!.a + 0.15, a: Math.min(seule[i + 1]!.de - 0.1, seule[i]!.a + 0.45) });
    const e = empreintes(mixer(fabriquerVoix(timbre, seule, DUREE, -30, graine), jeu));
    const d = separerVoixV4(entree(e, [...seule, ...fausses.filter((f) => f.a > f.de)]))!;
    expect(d.methode).toBe('une');
    expect(d.voix).toHaveLength(1);
    expect(d.separation.proposerEmpreinte).toBe('memeNiveau');
    expect(justesse(d, seule.map((t) => ({ ...t, v: 0 as const })), ['p1']).juste).toBe(1);
    // Avec des empreintes d'UNE voix : toujours « une » (le cosinus des 2 centres reste haut).
    const plages = morceauxAEmpreinter(entree(e, seule), d);
    const u = separerVoixV4({ ...entree(e, seule), neurales: faussesNeurales(plages, seule.map((t) => ({ ...t, v: 0 as const })), [centreAuHasard(3)]) })!;
    expect(u.voix).toHaveLength(1);
    expect(u.separation.cosinusCentres!).toBeGreaterThanOrEqual(0.68);
  });

  it('« Deux personnes » (forcer 2) sur une voix : 2 voix quand même', { timeout: 60_000 }, () => {
    const seule = toursAlternes(DUREE, 5, true);
    const e = empreintes(mixer(fabriquerVoix(VOIX_A, seule, DUREE, -30, 5), bruitDeJeu(DUREE, -52)));
    const d = separerVoixV4(entree(e, seule, { forcer: 2 }))!;
    expect(d.voix).toHaveLength(2);
  });

  it('morceau ambigu (à ± 3 dB du seuil) : la voix du voisin sûr du même tour ; avec l\'empreinte : « niveau+empreinte »', () => {
    // Fabriqué trame par trame : voix faible −40 dB, forte −25 dB ; un morceau à −32 dB collé (0,1 s) à la forte.
    const pas = 0.02;
    const n = Math.round(60 / pas);
    const db = new Float32Array(n).fill(-80);
    const zones: (PlageTemps & { v: 0 | 1; niv: number })[] = [];
    for (let t = 1, i = 0; t < 55; t += 2.5, i++) zones.push({ de: t, a: t + 1.4, v: (i % 2) as 0 | 1, niv: i % 2 ? -25 + (i % 3) : -40 - (i % 3) });
    const remplir = () => {
      db.fill(-80);
      for (const z of zones) for (let k = Math.round(z.de / pas); k < Math.round(z.a / pas); k++) db[k] = z.niv + (k % 3) - 1;
    };
    remplir();
    const e: EmpreintesVoix = { pas, duree: 60, db, bandes: new Float32Array(n * 8).fill(-90) };
    // Le seuil sans l'ambigu, puis un morceau AU seuil (son 98ᵉ centile = niv + 1), collé (0,1 s) à la voix forte.
    const seuil = separerVoixV4(entree(e, zones))!.separation.seuilDb!;
    const ambigu = { de: zones[3]!.a + 0.1, a: zones[3]!.a + 0.9, v: 1 as const, niv: seuil - 1.5 };
    zones.push(ambigu);
    remplir();
    const e0 = entree(e, zones);
    const d = separerVoixV4(e0)!;
    expect(d.voix).toHaveLength(2);
    expect(d.separation.par).toBe('niveau');
    expect(d.separation.ambigu).toBeGreaterThan(0);
    const tour = d.tours.find((t) => t.ts <= ambigu.de + 0.3 && t.fin >= ambigu.a - 0.1)!;
    expect(tour.p).toBe('p1');
    // L'empreinte demandée couvre l'ambigu ; avec elle, il est tranché (fausses empreintes : la voix forte).
    const plages = morceauxAEmpreinter(e0, d);
    expect(plages.some((p) => p.de <= ambigu.de + 0.05 && p.a >= ambigu.a - 0.05)).toBe(true);
    const vrai = zones.map((z) => ({ de: z.de, a: z.a, v: z.v === 1 ? (0 as const) : (1 as const) }));
    const avec = separerVoixV4({ ...e0, neurales: faussesNeurales(plages, vrai, [centreAuHasard(4), centreAuHasard(5)], 0.3) })!;
    expect(avec.separation.par).toBe('niveau+empreinte');
    expect(avec.tours.find((t) => t.ts <= ambigu.de + 0.3 && t.fin >= ambigu.a - 0.1)!.p).toBe('p1');
  });
});

describe('qui parle v4 : 3 voix, pistes séparées, rien', () => {
  it('3 voix à −42 / −31 / −20 dB : 3 voix, de la plus forte à la plus faible, ≥ 90 %', { timeout: 60_000 }, () => {
    const vrai = toursATrois(120);
    const son = mixer(
      fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), 120, -42, 1),
      fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), 120, -31, 2),
      fabriquerVoix(VOIX_C, vrai.filter((t) => t.v === 2), 120, -20, 3),
      bruitDeJeu(120, -55),
    );
    const d = separerVoixV4({ ...entree(empreintes(son), vrai), parole: parole(vrai, 120) })!;
    expect(d.voix.map((v) => v.id)).toEqual(['p1', 'p2', 'p3']);
    expect(d.voix[0]!.niveauDb).toBeGreaterThan(d.voix[1]!.niveauDb);
    expect(d.voix[1]!.niveauDb).toBeGreaterThan(d.voix[2]!.niveauDb);
    const j = justesse(d, vrai, ['p3', 'p2', 'p1']);
    console.info(`qui parle v4 3 voix : ${(j.juste * 100).toFixed(1)} % justes`);
    expect(j.juste).toBeGreaterThanOrEqual(0.9);
  });

  it('pistes séparées : exactement voixDesPistes (inchangé), « pistes », rien à empreinter', { timeout: 60_000 }, () => {
    const vrai = toursAlternes(60, 8);
    const micro = empreintes(mixer(fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), 60, -40, 1), bruitDeJeu(60, -70, 3)), 0);
    const discord = empreintes(mixer(fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), 60, -25, 2), bruitDeJeu(60, -75, 4)), 1);
    const e: EntreeVoix = { src: 's1', empreintes: [micro, discord], pistesSeparees: true, parole: parole(vrai, 60), neurales: null };
    const d = separerVoixV4(e)!;
    const { separation, ...sans } = d;
    expect(sans).toEqual(voixDesPistes([micro, discord], 's1'));
    expect(separation.par).toBe('pistes');
    expect(d.methode).toBe('pistes');
    expect(morceauxAEmpreinter(e, d)).toEqual([]);
  });

  it('personne ne parle / pas d\'empreintes : null', () => {
    const e = empreintes(bruitDeJeu(10, -52));
    expect(separerVoixV4({ src: 's1', empreintes: [e], pistesSeparees: false, parole: parole([], 10), neurales: null })).toBeNull();
    expect(separerVoixV4({ src: 's1', empreintes: [], pistesSeparees: false, parole: parole([{ de: 1, a: 2 }], 10), neurales: null })).toBeNull();
    expect(separerParEmpreintes({ src: 's1', empreintes: [e], pistesSeparees: false, parole: parole([{ de: 1, a: 2 }], 10), neurales: null })).toBeNull();
  });

  it('empreinte seule (banc « --empreinte forcee ») sur 2 voix de niveaux différents : ≥ 95 %', { timeout: 60_000 }, () => {
    const vrai = toursAlternes(DUREE);
    const son = mixer(fabriquerVoix(VOIX_A, vrai.filter((t) => t.v === 0), DUREE, -40, 1), fabriquerVoix(VOIX_B, vrai.filter((t) => t.v === 1), DUREE, -25, 2), bruitDeJeu(DUREE, -52));
    const e0 = entree(empreintes(son), vrai);
    const plages = vrai.map((t) => ({ de: t.de, a: t.a }));
    const d = separerParEmpreintes({ ...e0, neurales: faussesNeurales(plages, vrai, [centreAuHasard(6), centreAuHasard(7)]) })!;
    expect(d.separation.par).toBe('empreinte');
    // p1 = la plus forte, même quand c'est l'empreinte qui sépare.
    expect(justesse(d, vrai, ['p2', 'p1']).juste).toBeGreaterThanOrEqual(0.95);
  });
});
