// B v4 : punchlines du Best-of v4 (répliques, notes, choix réparti, tenue de la DA). Données fabriquées.

import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliserRecette } from '../../recette/normaliser';
import { COULEURS_CLE, TENUE_PUNCHLINE } from '../../recette/sous-titres-places';
import type { Mot } from '../../recette/types';
import { habillerV4 } from './habillage-v4';
import { entreeTest, moment, montageTest, replique, signauxTest, SOURCE_TEST } from './montage-test';
import { candidatsPunchlines, choisirPunchlines, nombrePunchlines, PUNCHLINES_V4, punchlinesV4, type CandidatPunchline, type EntreePunchlinesV4 } from './punchlines-v4';

const recetteDe = (plans: { de: number; a: number }[]) => normaliserRecette({ plans, destination: 'youtube' }, { sources: [SOURCE_TEST] });
const entree = (mots: Mot[], o: Partial<EntreePunchlinesV4> = {}): EntreePunchlinesV4 => ({ src: 's1', mots, moments: [], signaux: signauxTest(), sequences: [{ de: 0, a: 100 }], ...o });

describe('candidates', () => {
  it('une réplique courte est une candidate entière ; une longue donne sa fin et son début (7 mots, 2,3 s au plus)', () => {
    const mots: Mot[] = [];
    replique(1, 4, 0, mots); // 1 → 2,5 s
    replique(5, 14, 4, mots); // 5 → 10,5 s : trop longue pour une ligne
    const c = candidatsPunchlines(recetteDe([{ de: 0, a: 20 }]), entree(mots));
    expect(c[0]).toMatchObject({ ts: 1, fin: 2.5, k0: 0, k1: 4 });
    const longues = c.filter((x) => x.k0 >= 4);
    expect(longues).toHaveLength(2);
    for (const x of c) {
      expect(x.k1 - x.k0).toBeLessThanOrEqual(PUNCHLINES_V4.motsMax);
      expect(x.fin - x.ts).toBeLessThanOrEqual(PUNCHLINES_V4.dureeMax + 1e-9);
    }
    expect(longues.some((x) => x.k1 === 18)).toBe(true); // la fin de la réplique
    expect(longues.some((x) => x.k0 === 4)).toBe(true); // son début
  });

  it('une réplique ne mélange jamais deux personnes', () => {
    const mots: Mot[] = [];
    replique(1, 2, 0, mots); // 1 → 1,7 (p1)
    replique(1.8, 3, 3, mots); // 1,8 → 2,9 (p2), sans trou
    const tours = [{ ts: 1, fin: 1.7, p: 'p1' }, { ts: 1.8, fin: 2.9, p: 'p2' }];
    const c = candidatsPunchlines(recetteDe([{ de: 0, a: 10 }]), entree(mots, { tours }));
    expect(c.map((x) => [x.k0, x.k1])).toEqual([[0, 2], [2, 5]]);
    // Sans les tours : une seule réplique.
    expect(candidatsPunchlines(recetteDe([{ de: 0, a: 10 }]), entree(mots)).map((x) => [x.k0, x.k1])).toEqual([[0, 5]]);
  });

  it('une pile de Whisper (mots au même instant) et un mot coupé hors des plans ne sont pas des candidates', () => {
    const pile: Mot[] = [['un', 3, 3.02], ['deux', 3.02, 3.04], ['trois', 3.04, 3.06], ['quatre', 3.06, 3.08], ['cinq', 3.08, 3.6]];
    expect(candidatsPunchlines(recetteDe([{ de: 0, a: 10 }]), entree(pile))).toEqual([]);
    const mots: Mot[] = [];
    replique(12, 3, 0, mots);
    expect(candidatsPunchlines(recetteDe([{ de: 0, a: 10 }]), entree(mots))).toEqual([]);
  });

  it('la note monte avec un cri pendant la phrase, un rire juste après, un son fort autour, un mot fort ; un seul mot baisse', () => {
    const mots: Mot[] = [];
    for (let i = 0; i < 6; i++) replique(1 + i * 4, 4, i, mots); // 6 répliques de 1,5 s, 2,5 s de trou
    const r = recetteDe([{ de: 0, a: 30 }]);
    const base = candidatsPunchlines(r, entree(mots)).map((c) => c.note);
    expect(new Set(base).size).toBe(1); // rien ne les distingue
    const avec = candidatsPunchlines(
      r,
      entree(mots, {
        moments: [moment('cri', 5, 6, 0.9), moment('rire', 11, 12, 0.8)],
        signaux: signauxTest(1200, { pics: [{ ts: 19.2, db: -6, z: 6 }] }),
      }),
    ).map((c) => c.note);
    expect(avec[1]).toBeGreaterThan(base[1]!); // cri pendant
    expect(avec[2]).toBeGreaterThan(base[2]!); // rire juste après
    expect(avec[3]).toBe(base[3]); // rien autour
    expect(avec[4]).toBeGreaterThan(base[4]!); // son fort 0,7 s après
    const fort: Mot[] = mots.map((m, k) => (k === 21 ? [m[0], m[1], m[2], 1] : m));
    expect(candidatsPunchlines(r, entree(fort))[5]!.note).toBeGreaterThan(base[5]!);
    const seul: Mot[] = [['bloc', 1, 1.5]];
    expect(candidatsPunchlines(r, entree(seul))[0]!.note).toBeLessThan(base[0]!);
  });
});

const cand = (t0: number, note: number, sequence = 0, d = 1.5): CandidatPunchline => ({ ts: t0, fin: t0 + d, t0, t1: t0 + d, k0: 0, k1: 3, note, raison: 'replique', cle: null, sequence });

describe('choix', () => {
  it('≈ 3,3 par minute de montage, 4 au plus', () => {
    expect(nombrePunchlines(600)).toEqual({ vise: 33, max: 40 });
    expect(nombrePunchlines(60)).toEqual({ vise: 3, max: 4 });
    expect(nombrePunchlines(10).vise).toBe(1);
    const beaucoup = Array.from({ length: 300 }, (_, i) => cand(i * 2, 1 + (i % 5) / 10));
    expect(choisirPunchlines(beaucoup, 600)).toHaveLength(33);
  });

  it('au moins une par séquence (même mal notée), puis les mieux notées ; jamais deux qui se touchent', () => {
    const c = [cand(0, 3, 0), cand(1, 2.9, 0), cand(3, 2.8, 0), cand(10, 2.7, 0), cand(200, 0.9, 1), cand(400, 0.8, 2)];
    const ch = choisirPunchlines(c, 120); // 7 visées (4 au plus par 60 s) : toutes les possibles
    expect(ch.map((x) => x.t0)).toEqual([0, 3, 10, 200, 400]); // 1 (à 1 s) touche 0 → sautée
    const peu = choisirPunchlines(c, 60); // 3 visées : les 3 séquences d'abord
    expect(peu.map((x) => x.sequence).sort()).toEqual([0, 1, 2]);
  });

  it('au plus 6 qui commencent dans une fenêtre de 60 s ; rien sous la note minimale', () => {
    const serrees = Array.from({ length: 20 }, (_, i) => cand(i * 2, 2));
    const ch = choisirPunchlines(serrees, 900);
    expect(ch.length).toBe(6);
    expect(choisirPunchlines([cand(0, PUNCHLINES_V4.noteMin - 0.1)], 600)).toEqual([]);
  });

  it('rien sans vrais mots (mode voix)', () => {
    expect(punchlinesV4(recetteDe([{ de: 0, a: 10 }]), entree([['', 1, 2]]))).toEqual([]);
  });
});

describe('dans le montage', () => {
  it('taux de la DA, une par séquence, réparties ; tenue : du 1er mot à la fin du dernier + 0,2 s, 2,5 s au plus', () => {
    const m = montageTest(5);
    const res = habillerV4(m.recette, entreeTest(m, { zooms: null, accroche: false }));
    const r = res.recette;
    const sc = compiler(r);
    const parMinute = res.bilan.punchlines / (sc.duree / 60);
    expect(parMinute).toBeGreaterThanOrEqual(3);
    expect(parMinute).toBeLessThanOrEqual(4);
    for (const s of m.sequences) expect(r.sousTitres!.punchlines!.some((p) => p.ts >= s.de && p.fin <= s.a)).toBe(true);
    expect(r.sousTitres!.mode).toBe('punchlines');
    const lignes = sc.sousTitres!.lignes;
    expect(lignes.length).toBe(res.bilan.punchlines);
    for (const l of lignes) {
      const premier = l.mots[0]!;
      const dernier = l.mots[l.mots.length - 1]!;
      expect(l.t0).toBeCloseTo(premier.t0, 6);
      expect(l.t1).toBeLessThanOrEqual(dernier.t1 + TENUE_PUNCHLINE.apres + 1e-6);
      expect(l.t1 - l.t0).toBeLessThanOrEqual(TENUE_PUNCHLINE.max + 1e-6);
      expect(l.mots.length).toBeLessThanOrEqual(7);
    }
    // Dessin de la DA : mot clé en jaune, jurons masqués (le moteur s'en charge en mode punchlines).
    expect(sc.sousTitres!.couleurCle).toBe(COULEURS_CLE.jaune);
    expect(sc.sousTitres!.masquer).toBe(true);
  });

  it('punchlines décochées ou mode voix : aucune', () => {
    const m = montageTest(2);
    expect(habillerV4(m.recette, entreeTest(m, { punchlines: false })).bilan.punchlines).toBe(0);
    const voix = montageTest(2, { mots: false });
    const e = entreeTest(voix, { mots: voix.mots.map((x): Mot => ['', x[1], x[2]]) });
    expect(habillerV4(voix.recette, e).bilan.punchlines).toBe(0);
  });
});
