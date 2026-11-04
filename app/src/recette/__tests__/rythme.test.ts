// Phase 4 : durée d'un plan, arrêt sur image (fige), vitesse, combos, aimant, alerte de rythme.
import { describe, expect, it } from 'vitest';
import { morceauxDuBloc } from '../../moteur/audio/mixeur';
import { etatImage } from '../../moteur/etat-image';
import { compiler, sortiesDe, sourceA } from '../chronologie';
import { normaliser, normaliserRecette } from '../normaliser';
import {
  aimanter, alerteRythme, appliquerCombo, bornesDesPlans, changerVitesse, conseilAccroche, dureeFinale, dureePlan,
  figerFin, finirIci, MESSAGE_ACCROCHE, MESSAGE_RYTHME, rognerFin, scinder,
} from '../operations';
import type { Recette, Source } from '../types';

const v: Source = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video', l: 1920, h: 1080 };
const avec = (brut: Record<string, unknown>): Recette => normaliserRecette(brut, { sources: [v] });
/** 2 plans : [0 ; 4] figé 1 s (sortie 0 → 5), puis [10 ; 14] (sortie 5 → 9). */
const fige = () => avec({ plans: [{ de: 0, a: 4, fige: 1 }, { de: 10, a: 14 }] });

describe('dureePlan', () => {
  it('(a − de) / vit + fige, partout', () => {
    expect(dureePlan({ de: 2, a: 6, vit: 0.5, fige: 1 })).toBe(9);
    const r = fige();
    expect(dureeFinale(r)).toBe(9);
    expect(bornesDesPlans(r)).toEqual([0, 5, 9]);
    expect(compiler(r).duree).toBe(9);
  });
});

describe('arrêt sur image', () => {
  it('le normaliseur borne fige entre 0,3 et 5 s, avec un message en français', () => {
    const r = normaliser({ plans: [{ de: 0, a: 4, fige: 9 }, { de: 5, a: 6, freeze: 0.1 }] }, { sources: [v] });
    expect(r.recette.plans[0]!.fige).toBe(5);
    expect(r.recette.plans[1]!.fige).toBe(0.3);
    expect(r.problemes.some((p) => p.message.includes('doit durer de 0,30 s à 5,00 s'))).toBe(true);
  });

  it('pendant l\'arrêt, ts = a − 0,001 (jamais l\'image d\'après la coupe)', () => {
    const sc = compiler(fige());
    expect(sc.plans[0]!.tFige).toBe(4);
    expect(sourceA(sc, 4.5)!.ts).toBeCloseTo(3.999, 6);
    expect(sourceA(sc, 4.999)!.plan.i).toBe(0);
    expect(sourceA(sc, 5)!.ts).toBe(10);
    expect(etatImage(sc, 4.7)!.ts).toBeCloseTo(3.999, 6);
  });

  it('le mixeur ne joue aucun son du plan pendant l\'arrêt', () => {
    const sc = compiler(fige());
    const m = morceauxDuBloc(sc, 3.5, 48000 * 2);
    // Bloc [3,5 ; 5,5[ : 0,5 s du plan 0, silence de 4 à 5, puis 0,5 s du plan 1.
    expect(m.map((x) => [x.plan.i, x.k0, x.n])).toEqual([[0, 0, 24000], [1, 72000, 24000]]);
    const m2 = morceauxDuBloc(sc, 3, 48000);
    expect(m2[0]!.n).toBe(48000); // [3 ; 4[ joué en entier, rien après 4
    expect(morceauxDuBloc(sc, 4.2, 4800)).toEqual([]);
  });

  it('les effets en temps source ne se dupliquent pas pendant l\'arrêt', () => {
    expect(sortiesDe(compiler(fige()), 's1', 3.99)).toEqual([3.99]);
    const r = avec({ plans: [{ de: 0, a: 4, fige: 1 }, { de: 10, a: 14 }], zooms: [{ ts: 3.9 }], sons: [{ id: 'impact.boom', ts: 3.95 }] });
    const sc = compiler(r);
    expect(sc.zooms.map((z) => z.t)).toEqual([3.9]);
    expect(sc.sons.map((s) => s.t)).toEqual([3.95]);
  });

  it('les sous-titres restent sur la dernière ligne pendant l\'arrêt', () => {
    const r = avec({
      plans: [{ de: 0, a: 4, fige: 2 }, { de: 10, a: 14 }],
      sousTitres: { mots: [['un', 3, 3.3], ['deux', 3.3, 3.9], ['après', 10.2, 10.5]] },
    });
    const sc = compiler(r);
    const e = etatImage(sc, 5.5)!;
    expect(e.sousTitres?.ligne.mots.map((m) => m.mot[0])).toEqual(['un', 'deux']);
    expect(e.sousTitres?.actif).toBe(1);
  });

  it('scinder dans l\'arrêt ne fait rien ; ailleurs, fige reste sur le 2ᵉ morceau', () => {
    const r = fige();
    expect(scinder(r, 4.5)).toBe(r);
    const s = scinder(r, 2);
    expect(s.plans.map((p) => [p.de, p.a, p.fige])).toEqual([[0, 2, undefined], [2, 4, 1], [10, 14, undefined]]);
    expect(dureeFinale(s)).toBe(9);
  });

  it('rogner garde l\'arrêt ; finir dans l\'arrêt le raccourcit', () => {
    expect(rognerFin(fige(), 0, 3).plans[0]!.fige).toBe(1);
    expect(finirIci(fige(), 4.6).plans).toEqual([{ de: 0, a: 4, fige: 0.6 }]);
    expect(finirIci(fige(), 2).plans).toEqual([{ de: 0, a: 2 }]);
  });

  it('les transitions tombent pendant l\'arrêt, sur l\'image figée', () => {
    const r = avec({ plans: [{ de: 0, a: 4, fige: 1 }, { de: 10, a: 14, trans: 'flash' }] });
    const e = etatImage(compiler(r), 4.9)!;
    expect(e.transition?.cote).toBe('avant');
    expect(e.ts).toBeCloseTo(3.999, 6);
  });

  it('figerFin et changerVitesse', () => {
    const r = avec({ plans: [{ de: 0, a: 4 }] });
    expect(figerFin(r, 0, 2).plans[0]!.fige).toBe(2);
    expect(figerFin(figerFin(r, 0, 2), 0, null).plans[0]!.fige).toBeUndefined();
    expect(figerFin(r, 0, 9).plans[0]!.fige).toBe(5);
    expect(changerVitesse(r, 0, 0.5).plans[0]!.vit).toBe(0.5);
    expect(dureeFinale(changerVitesse(r, 0, 2))).toBe(2);
    expect(changerVitesse(r, 0, 1)).toBe(r);
  });
});

describe('combos', () => {
  const base = () => avec({ plans: [{ de: 0, a: 10 }, { de: 20, a: 30 }] });

  it('boom : zoom punch 1,5 × 0,5 s + impact.meme, attachés au temps source', () => {
    const r = appliquerCombo(base(), 'boom', 12);
    expect(r.zooms).toEqual([{ ts: 22, src: 's1', dur: 0.5, force: 1.5, style: 'punch', x: 0.5, y: 0.5, zone: 'tout' }]);
    expect(r.sons).toEqual([{ id: 'impact.meme', ts: 22, src: 's1', vol: 0.8 }]);
    const jc = avec({ plans: [{ de: 0, a: 10 }], mise: { type: 'jeuCam', cam: { x: 0, y: 0, l: 0.3, h: 0.3 } } });
    expect(appliquerCombo(jc, 'boom', 3).zooms[0]!.zone).toBe('cam');
  });

  it('fige : coupe à t, fige 1 s sur le 1er morceau, disque rayé au début de l\'arrêt', () => {
    const r = appliquerCombo(base(), 'fige', 4);
    expect(r.plans.map((p) => [p.de, p.a, p.fige])).toEqual([[0, 4, 1], [4, 10, undefined], [20, 30, undefined]]);
    const sc = compiler(r);
    expect(sc.duree).toBe(21);
    expect(sc.sons.map((s) => [s.element.id, s.t])).toEqual([['meme.disque-raye', 3.99]]);
    // Sur une coupe : on fige le plan qui finit là.
    expect(appliquerCombo(base(), 'fige', 10).plans.map((p) => p.fige)).toEqual([1, undefined]);
  });

  it('rate : 1,5 s au ralenti 0,5 avant t, trombone triste à la fin du ralenti', () => {
    const r = appliquerCombo(base(), 'rate', 6);
    expect(r.plans.map((p) => [p.de, p.a, p.vit])).toEqual([[0, 4.5, undefined], [4.5, 6, 0.5], [6, 10, undefined], [20, 30, undefined]]);
    const sc = compiler(r);
    expect(sc.duree).toBe(21.5);
    expect(sc.sons.map((s) => [s.element.id, s.t])).toEqual([['comedie.trombone-triste', 7.5]]);
  });

  it('chaque combo est UNE nouvelle recette (annulable d\'un coup), l\'original intact', () => {
    const r = base();
    const avant = JSON.stringify(r);
    for (const c of ['boom', 'fige', 'rate'] as const) expect(appliquerCombo(r, c, 5)).not.toBe(r);
    expect(JSON.stringify(r)).toBe(avant);
  });

  it('aimanter : pic le plus proche à ±0,3 s', () => {
    expect(aimanter(5, [4.6, 5.2, 5.25])).toBe(5.2);
    expect(aimanter(5, [4, 6])).toBe(5);
  });
});

describe('alerte de rythme', () => {
  it('renvoie le pire passage de plus de 4 s', () => {
    const r = avec({ plans: [{ de: 0, a: 6 }, { de: 10, a: 25 }], textes: [{ txt: 'a', t: 0 }], sons: [{ id: 'impact.boom', t: 12 }] });
    expect(alerteRythme(r)).toEqual({ t0: 12, t1: 21, message: MESSAGE_RYTHME });
    expect(alerteRythme(r, [16])).toEqual({ t0: 0, t1: 6, message: MESSAGE_RYTHME });
    expect(alerteRythme(r, [3, 9, 16, 19])).toBeNull();
  });

  it('conseille d\'animer une accroche calme', () => {
    const r = avec({ plans: [{ de: 0, a: 10 }] });
    expect(conseilAccroche(r)).toBe(MESSAGE_ACCROCHE);
    expect(conseilAccroche(appliquerCombo(r, 'boom', 2))).toBeNull();
  });
});
