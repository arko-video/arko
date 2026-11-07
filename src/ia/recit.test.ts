// A. Monteur sans IA (dev 1) : mise en place, chute, durée tenue, doublons, signal fabriqué.
import { describe, expect, it } from 'vitest';
import { signauxDepuisEnveloppe } from '../auto/signaux-source';
import type { Mot, Source } from '../recette/types';
import { candidats, evenements, type Evenements } from './candidats';
import type { Moment } from './moments';
import { bornesRacontees, dedoublonner, finDeLAction, RECIT, recouvrement } from './recit';
import { clipsSansIA } from './sans-ia';
import { CONNUS, signalSynthetique } from './synthese-test';

const SOURCE: Source = { id: 's1', nom: 'live.mp4', taille: 1e9, emp: 'abc', duree: 7200, type: 'video', l: 1920, h: 1080 };
const moment = (pic: number, score = 50): Moment => ({ id: 'm01', debut: pic - 5, fin: pic + 5, score, etiquettes: ['pic'], pic });
const aucun: Evenements = { pics: [], cris: [], rires: [], scenes: [] };
/** Phrase de mots réguliers (0,3 s chacun, 0,1 s entre deux) de `de` à `a`. */
function phrase(de: number, a: number, txt = 'bla'): Mot[] {
  const res: Mot[] = [];
  for (let t = de; t + 0.3 <= a + 1e-9; t += 0.4) res.push([txt, Math.round(t * 100) / 100, Math.round((t + 0.3) * 100) / 100]);
  return res;
}

describe('bornesRacontees : mise en place', () => {
  it('commence au début de la phrase qui précède le pic (entre 5 et 15 s avant)', () => {
    // Silence de 3 s, puis une phrase de 991 à 1003 : la mise en place part de 991 (9 s avant le pic).
    const mots = [...phrase(980, 988), ...phrase(991, 1003)];
    const b = bornesRacontees(moment(1000), aucun, mots, 7200);
    expect(b.debut).toBe(991);
  });

  it('remonte de phrase en phrase tant que le trou est < 2,5 s, sans dépasser 15 s', () => {
    // Phrases à 970–980, 982–990, 992–1002 : trous de 2 s → on remonte jusqu'au mot le plus ancien à ≤ 15 s (985…).
    const mots = [...phrase(970, 980), ...phrase(982, 990), ...phrase(992, 1002)];
    const b = bornesRacontees(moment(1000), aucun, mots, 7200);
    expect(b.debut).toBeGreaterThanOrEqual(1000 - RECIT.miseEnPlaceMax);
    expect(b.debut).toBeLessThanOrEqual(986);
    expect(mots.some((m) => m[1] === b.debut)).toBe(true);
  });

  it('une pause > 2,5 s juste avant le pic : 5 s au moins quand même', () => {
    const mots = [...phrase(960, 996), ...phrase(999, 1002)];
    const b = bornesRacontees(moment(1000), aucun, mots, 7200);
    expect(1000 - b.debut).toBeGreaterThanOrEqual(5);
    expect(1000 - b.debut).toBeLessThanOrEqual(15);
  });

  it('sans mots : le dernier calme dans [pic − 15, pic − 5], sinon pic − 8 s', () => {
    const s = signalSynthetique();
    const signaux = signauxDepuisEnveloppe('s1', s.duree, s.pas, s.enveloppe);
    const b = bornesRacontees(moment(CONNUS.calmePic), evenements(s), null, s.duree, { signaux });
    expect(CONNUS.calmePic - b.debut).toBeGreaterThanOrEqual(5);
    expect(CONNUS.calmePic - b.debut).toBeLessThanOrEqual(15);
    expect(bornesRacontees(moment(1000), aucun, null, 7200).debut).toBe(992);
  });
});

describe('bornesRacontees : chute et durée', () => {
  const ev: Evenements = { ...aucun, rires: [{ debut: 1001, fin: 1004, t: 1002, force: 0.8 }] };

  it('chute = fin de la réaction (rire ≤ 3 s après) + 1 s, prolongée jusqu\'à la fin de la phrase (6 s au plus)', () => {
    expect(finDeLAction(1000, ev)).toBe(1004);
    expect(bornesRacontees(moment(1000), ev, null, 7200).fin).toBe(1005);
    const mots = [...phrase(990, 1000), ...phrase(1004.5, 1007.2)];
    expect(bornesRacontees(moment(1000), ev, mots, 7200).fin).toBeCloseTo(1007.2, 5);
    const longue = [...phrase(990, 1000), ...phrase(1004.5, 1030)];
    expect(bornesRacontees(moment(1000), ev, longue, 7200).fin).toBeLessThanOrEqual(1004 + RECIT.chuteMax);
  });

  it('maximum tenu en raccourcissant la chute puis la mise en place, jamais la réaction', () => {
    const mots = [...phrase(985, 1000), ...phrase(1004.5, 1010)];
    const b = bornesRacontees(moment(1000), ev, mots, 7200, { dureeMax: 12 });
    expect(b.fin - b.debut).toBeLessThanOrEqual(12 + 1e-9);
    expect(b.fin).toBeGreaterThanOrEqual(1004);
    expect(b.debut).toBeLessThanOrEqual(995);
    // Impossible de tenir 6 s sans couper la réaction : on garde pic − 5 → fin du rire.
    const c = bornesRacontees(moment(1000), ev, mots, 7200, { dureeMax: 6 });
    expect(c.debut).toBe(995);
    expect(c.fin).toBe(1004);
  });

  it('minimum tenu (la chute jusqu\'à 6 s d\'abord, puis le contexte au début d\'une phrase), dans la source', () => {
    const b = bornesRacontees(moment(1000), aucun, null, 7200, { dureeMin: 20 });
    expect(b).toEqual({ debut: 986, fin: 1006 });
    const mots = [...phrase(970, 984), ...phrase(989, 1000.5)];
    expect(bornesRacontees(moment(1000), aucun, mots, 7200, { dureeMin: 20 })).toEqual({ debut: 986, fin: 1006 }); // 986 : dans le silence après la phrase 970–984
    expect(bornesRacontees(moment(1000), aucun, mots, 7200, { dureeMin: 24 }).debut).toBe(985);
    const debut = bornesRacontees(moment(3), aucun, null, 7200, { dureeMin: 12 });
    expect(debut.debut).toBe(0);
    expect(debut.fin).toBe(12);
  });
});

describe('dedoublonner', () => {
  it('garde le mieux noté quand deux clips se recouvrent de plus de 30 % du plus court', () => {
    const a = { ...moment(100, 40), debut: 90, fin: 110 };
    const b = { ...moment(105, 70), debut: 96, fin: 112 };
    const c = { ...moment(200, 10), debut: 190, fin: 210 };
    const d = { ...moment(118, 90), debut: 108, fin: 125 }; // 2 s de b (12 %) et 2 s de a : gardé
    expect(recouvrement(a, b)).toBeCloseTo(14 / 16, 5);
    expect(dedoublonner([a, b, c, d])).toEqual([b, c, d]);
  });
});

describe('signal fabriqué (mesure de la passation)', () => {
  const s = signalSynthetique();
  const source = { ...SOURCE, duree: s.duree };
  const signaux = signauxDepuisEnveloppe('s1', s.duree, s.pas, s.enveloppe);
  const ev = evenements(s);
  /** [moment − 5 s, fin de l'action + 1 s] pour chaque moment connu (bip 0,3 s, rire 2 s, cri 1,5 s, pic 0,3 s). */
  const fins = { [CONNUS.calmePic]: 80.3, [CONNUS.rire]: 202, [CONNUS.cri]: 301.5, [CONNUS.picSansCalme]: 500.3 };
  const attendus = Object.entries(fins).map(([t, fin]) => ({ t: Number(t), de: Number(t) - 5, a: Math.max(fin, finDeLAction(Number(t), ev)) + 1 }));

  it('chaque moment connu est dans un clip ENTIER (mise en place + chute), sans doublon', () => {
    const clips = clipsSansIA(candidats(s), source, 10, { signaux, dureeMin: 15, dureeMax: 25 }).map((p) => p.recette.plans[0]!);
    for (const x of attendus) expect(clips.some((p) => p.de <= x.de + 1e-6 && p.a >= x.a - 1e-6), `moment ${x.t}`).toBe(true);
    for (let i = 0; i < clips.length; i++)
      for (let j = i + 1; j < clips.length; j++)
        expect(recouvrement({ debut: clips[i]!.de, fin: clips[i]!.a }, { debut: clips[j]!.de, fin: clips[j]!.a })).toBeLessThanOrEqual(0.3);
  });

  it('titre : false → aucun texte ; par défaut, l\'accroche ; plus de bruitage automatique', () => {
    const avec = clipsSansIA(candidats(s), source, 3, { signaux })[0]!.recette;
    expect(avec.textes).toHaveLength(1);
    expect(avec.textes[0]!.role).toBe('accroche');
    expect(avec.sons).toEqual([]);
    const sans = clipsSansIA(candidats(s), source, 3, { signaux, titre: false });
    for (const p of sans) expect(p.recette.textes).toEqual([]);
    expect(clipsSansIA(candidats(s), source, 1, { signaux, bruitage: true })[0]!.recette.sons).toHaveLength(1);
  });
});
