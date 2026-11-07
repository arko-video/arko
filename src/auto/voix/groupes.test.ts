// Qui parle v4 (dev-voix) : morceaux de parole, niveau par morceau, groupes de niveau et d'empreintes (données fabriquées).
import { describe, expect, it } from 'vitest';
import type { EnveloppeDb } from '../types-v3';
import { cosinus, groupeDe, groupesDEmpreintes, groupesDeNiveau, kMoyennesCosinus, medianePonderee, meilleurPartage, normer } from './groupes';
import { decouperEnMorceaux, dureeMorceau } from './morceaux-parole';
import { centile, niveauxDesMorceaux } from './niveau-v4';

/** Petit générateur à graine fixe (−1…1). */
function hasard(graine: number): () => number {
  let s = graine;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/** Valeurs « gaussiennes » (somme de 4 tirages) autour de m, écart ≈ e. */
function autour(m: number, e: number, n: number, r: () => number): number[] {
  return Array.from({ length: n }, () => m + (e * (r() + r() + r() + r())) / 1.15);
}

describe('morceaux de parole', () => {
  // Énergie : parole à −30 dB avec un creux (−60 dB) à 1,91 s et un autre à 3,31 s.
  const pas = 0.02;
  const db = new Float32Array(400).fill(-30);
  db[95] = -60;
  db[165] = -60;
  const e: EnveloppeDb = { pas, db };

  it('un segment de 4 s : morceaux de 1,5 s au plus, coupés au creux le plus proche', () => {
    const m = decouperEnMorceaux([{ de: 0.5, a: 4.5 }], e);
    expect(m.length).toBe(3);
    for (const x of m) expect(x.a - x.de).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(m[0]!.de).toBe(0.5);
    expect(m[m.length - 1]!.a).toBe(4.5);
    // Les coupes tombent sur les creux (milieux des trames 95 et 165), pas aux points réguliers (1,83 et 3,2 s).
    expect(m[0]!.a).toBeCloseTo(1.91, 2);
    expect(m[1]!.a).toBeCloseTo(3.31, 2);
    for (let i = 1; i < m.length; i++) expect(m[i]!.de).toBe(m[i - 1]!.a);
  });

  it('un segment court (< 0,3 s) est collé au morceau voisin (à moins de 1 s), sinon gardé seul', () => {
    const m = decouperEnMorceaux([{ de: 1, a: 2 }, { de: 2.4, a: 2.6 }, { de: 6, a: 6.2 }], e);
    expect(m).toHaveLength(2);
    expect(m[0]!.parties).toEqual([{ de: 1, a: 2 }, { de: 2.4, a: 2.6 }]);
    expect(dureeMorceau(m[0]!)).toBeCloseTo(1.2, 6);
    expect(m[1]!.parties).toEqual([{ de: 6, a: 6.2 }]);
  });

  it('niveau d\'un morceau = 98ᵉ centile de ses trames (le creux ne compte presque pas)', () => {
    const m = decouperEnMorceaux([{ de: 0.5, a: 1.5 }], e);
    expect(niveauxDesMorceaux(m, e)[0]).toBe(-30);
    expect(centile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 0.95)).toBe(19);
    expect(centile([], 0.9)).toBe(-100);
  });
});

describe('groupes de niveau', () => {
  it('deux bosses (−32 ±2, −20 ±3,5, poids 60 / 40 %) : 2 groupes, seuil entre les deux, plus près de la voix faible que le creux', () => {
    const r = hasard(1);
    const x = [...autour(-32, 2, 600, r), ...autour(-20, 3.5, 400, r)];
    const w = x.map(() => 1);
    const g = groupesDeNiveau(x, w);
    expect(g.seuils).toHaveLength(1);
    expect(g.seuils[0]!).toBeGreaterThan(-29.5);
    expect(g.seuils[0]!).toBeLessThan(-24);
    expect(g.medianes[0]!).toBeCloseTo(-32, 0);
    expect(g.medianes[1]!).toBeCloseTo(-20, 0);
    expect(g.premier!.seuil).toBeLessThanOrEqual(g.premier!.creux);
    expect(groupeDe(-35, g.seuils)).toBe(0);
    expect(groupeDe(-15, g.seuils)).toBe(1);
  });

  it('une seule bosse (même large, avec une traîne) : 1 groupe', () => {
    const r = hasard(2);
    const x = [...autour(-30, 3, 800, r), ...autour(-42, 6, 60, r)];
    expect(groupesDeNiveau(x, x.map(() => 1)).seuils).toEqual([]);
  });

  it('les queues presque vides ne font pas un creux (chaque côté pèse 5 % au moins)', () => {
    const r = hasard(3);
    const x = [...autour(-30, 2.5, 500, r), -70, -71, -72];
    const p = meilleurPartage(x, x.map(() => 1), x.map((_, i) => i))!;
    expect(p.creux).toBeGreaterThan(-60);
  });

  it('trois bosses (−42, −31, −20) : 3 groupes', () => {
    const r = hasard(4);
    const x = [...autour(-42, 2, 300, r), ...autour(-31, 2, 300, r), ...autour(-20, 2, 300, r)];
    const g = groupesDeNiveau(x, x.map(() => 1));
    expect(g.seuils).toHaveLength(2);
    expect(g.medianes.map((m) => Math.round(m))).toEqual([-42, -31, -20]);
  });

  it('poids = durée ; « forcer » 1 → un groupe, 2 → deux même sans creux', () => {
    expect(medianePonderee([1, 2, 3], [1, 1, 10])).toBe(3);
    const r = hasard(5);
    const x = autour(-30, 3, 500, r);
    expect(groupesDeNiveau(x, x.map(() => 1), { forcer: 2 }).seuils).toHaveLength(1);
    const r2 = hasard(1);
    const y = [...autour(-32, 2, 600, r2), ...autour(-20, 3.5, 400, r2)];
    expect(groupesDeNiveau(y, y.map(() => 1), { forcer: 1 }).seuils).toEqual([]);
  });
});

describe('groupes d\'empreintes (cosinus)', () => {
  const dim = 32;
  const centre = (g: number) => normer(Array.from({ length: dim }, hasard(100 + g)));
  const autourDe = (c: Float32Array, n: number, bruit: number, g: number) => {
    const r = hasard(g);
    return Array.from({ length: n }, () => normer(Array.from(c, (x) => x + bruit * r())));
  };

  it('deux centres éloignés : 2 groupes, cosinus des centres < 0,68 ; une voix : 1 groupe (cosinus ≥ 0,68)', () => {
    const a = autourDe(centre(1), 40, 0.15, 1);
    const b = autourDe(centre(2), 30, 0.15, 2);
    const g = groupesDEmpreintes([...a, ...b]);
    expect(g.centres).toHaveLength(2);
    expect(g.cosinusCentres!).toBeLessThan(0.68);
    const ga = Array.from(g.groupes.slice(0, 40));
    const gb = Array.from(g.groupes.slice(40));
    expect(new Set(ga).size).toBe(1);
    expect(new Set(gb).size).toBe(1);
    expect(ga[0]).not.toBe(gb[0]);
    const u = groupesDEmpreintes(autourDe(centre(3), 60, 0.15, 3));
    expect(u.centres).toHaveLength(1);
    expect(u.cosinusCentres!).toBeGreaterThanOrEqual(0.68);
  });

  it('trois centres : 3 groupes ; k-moyennes déterministes', () => {
    const v = [...autourDe(centre(4), 30, 0.12, 4), ...autourDe(centre(5), 30, 0.12, 5), ...autourDe(centre(6), 30, 0.12, 6)];
    expect(groupesDEmpreintes(v).centres).toHaveLength(3);
    const k1 = kMoyennesCosinus(v, 2)!;
    const k2 = kMoyennesCosinus(v, 2)!;
    expect(Array.from(k1.groupes)).toEqual(Array.from(k2.groupes));
    expect(cosinus(normer([1, 0]), normer([0, 2]))).toBe(0);
    expect(cosinus([1, 1], [2, 2])).toBeCloseTo(1, 9);
  });
});
