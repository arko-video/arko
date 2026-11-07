// Accroche du Best-of v4 : le meilleur moment DES séquences gardées, 1 ou 2 morceaux sur des bords de mots, ~6 s,
// copiés au début (accrocheDesMorceaux), sans texte si les titres sont décochés, ni chapitre ni musique dedans.

import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { accrocheDesMorceaux, MEILLEUR, modeleMeilleurDAbord } from '../../recette/modeles';
import { normaliserRecette } from '../../recette/normaliser';
import type { Mot, Recette } from '../../recette/types';
import { ACCROCHE_V4, choisirAccroche, type EntreeAccrocheV4 } from './accroche-v4';
import { habillerV4 } from './habillage-v4';
import { entreeTest, moment, montageTest, replique, signauxTest, SOURCE_TEST } from './montage-test';

const recetteDe = (plans: { de: number; a: number }[], o: Record<string, unknown> = {}): Recette =>
  normaliserRecette({ plans, destination: 'youtube', ...o }, { sources: [SOURCE_TEST] });
const duree = (p: readonly { de: number; a: number }[]) => p.reduce((t, x) => t + x.a - x.de, 0);
const dansUnMot = (t: number, mots: readonly Mot[]) => mots.some((m) => t > m[1] + 1e-6 && t < m[2] - 1e-6);

describe('choisirAccroche', () => {
  const m = montageTest(5);
  const e = (o: Partial<EntreeAccrocheV4> = {}): EntreeAccrocheV4 => ({ src: 's1', mots: m.mots, moments: [], sequences: m.sequences, punchlines: [], signaux: signauxTest(), ...o });

  it('le moment le plus fort des séquences gardées, jamais un pic de son hors séquence', () => {
    const horsSequence = moment('cri', 85, 86, 1); // entre deux séquences (70–110 n'en fait pas partie)
    const signaux = signauxTest(1200, { pics: [{ ts: 90, db: -2, z: 20 }] });
    const a = choisirAccroche(m.recette, e({ moments: [horsSequence, moment('rire', 225, 226, 0.5), moment('cri', 333, 334, 0.8)], signaux }))!;
    expect(a.raison).toBe('cri');
    expect(a.t).toBeCloseTo(333.5);
    expect(a.plages.every((p) => p.de >= 310 && p.a <= 370)).toBe(true);
  });

  it('~6 s, du début de la phrase (0,25 s avant son 1er mot) à un bord de mot', () => {
    const a = choisirAccroche(m.recette, e({ moments: [moment('phraseForte', 333, 334, 0.8)] }))!;
    expect(duree(a.plages)).toBeGreaterThanOrEqual(ACCROCHE_V4.min - 1e-6);
    expect(duree(a.plages)).toBeLessThanOrEqual(ACCROCHE_V4.max + 1e-6);
    const premier = m.mots.find((x) => x[2] > a.plages[0]!.de)!;
    expect(premier[1] - a.plages[0]!.de).toBeLessThanOrEqual(ACCROCHE_V4.avant + 1e-6);
    for (const p of a.plages) {
      expect(dansUnMot(p.de, m.mots)).toBe(false);
      expect(dansUnMot(p.a, m.mots)).toBe(false);
    }
  });

  it('2 morceaux quand le morceau du moment est trop court : la phrase, puis la réaction', () => {
    const mots: Mot[] = [];
    replique(10.25, 5, 0, mots); // 10,25 → 12,15 : la phrase
    replique(14.25, 8, 5, mots); // 14,25 → 17,35 : la réaction
    const r = recetteDe([{ de: 10, a: 12.5 }, { de: 14, a: 17.7 }, { de: 40, a: 45 }]);
    const seq = { ...m.sequences[0]!, de: 5, a: 50 };
    const a = choisirAccroche(r, { src: 's1', mots, moments: [moment('cri', 10.5, 12, 0.9)], sequences: [seq], punchlines: [], signaux: signauxTest() })!;
    expect(a.plages).toHaveLength(2);
    expect(a.plages[0]).toEqual({ de: 10, a: 12.5 });
    expect(a.plages[1]!.de).toBe(14);
    expect(duree(a.plages)).toBeGreaterThanOrEqual(ACCROCHE_V4.min - 1e-6);
    expect(dansUnMot(a.plages[1]!.a, mots)).toBe(false);
  });

  it('mode voix (aucun mot) : coupé dans un silence ; aucune séquence : pas d’accroche', () => {
    const rms = new Float32Array(60000).fill(0.2);
    for (let k = 0; k < rms.length; k += 50) rms[k] = 0.001; // une trame calme par seconde
    const a = choisirAccroche(m.recette, e({ mots: [], moments: [moment('rire', 33, 34, 0.7)], signaux: signauxTest(1200, { rms }) }))!;
    expect(duree(a.plages)).toBeGreaterThanOrEqual(ACCROCHE_V4.min - 1e-6);
    expect(duree(a.plages)).toBeLessThanOrEqual(ACCROCHE_V4.max + 1e-6);
    expect(choisirAccroche(m.recette, e({ sequences: [] }))).toBeNull();
  });

  it('sans moment : la meilleure punchline des séquences', () => {
    const a = choisirAccroche(m.recette, e({ punchlines: [{ ts: 231.6, fin: 233.5 }] }))!;
    expect(a.raison).toBe('phraseForte');
    expect(a.plages[0]!.de).toBeLessThanOrEqual(231.6);
    expect(a.plages[0]!.de).toBeGreaterThanOrEqual(231.6 - ACCROCHE_V4.avant - 1e-6);
  });
});

describe('accrocheDesMorceaux', () => {
  const r = recetteDe([{ de: 0, a: 4 }, { de: 10, a: 14 }, { de: 20, a: 30 }], {
    textes: [{ txt: 'Salut', t: 5, dur: 1 }],
    sousTitres: { style: 'karaoke', mots: [['bloc', 21, 21.4]], src: 's1' },
  });

  it('copie les morceaux au début, glitch vers la suite, décale les textes, rien d’autre ne bouge', () => {
    const a = accrocheDesMorceaux(r, [{ de: 21, a: 23 }, { de: 25, a: 29, zoomFixe: { force: 1.32, y: 0.45 } }]);
    expect(a.plans.map((p) => [p.de, p.a])).toEqual([[21, 23], [25, 29], [0, 4], [10, 14], [20, 30]]);
    expect(a.plans[2]!.trans).toBe(MEILLEUR.transition);
    expect(a.plans[1]!.zoomFixe?.force).toBe(1.32);
    expect(a.plans[0]!.zoomFixe).toBeUndefined();
    expect(a.textes).toEqual([{ ...r.textes[0]!, t: 11 }]); // aucun « ATTENDS… » d'office
    // La phrase réapparaît dans la copie (sous-titres en temps source) et reste dans sa séquence.
    expect(compiler(a).sousTitres!.lignes.map((l) => Math.round(l.t0 * 100) / 100)).toEqual([0, 15]); // 6 s copiés + 4 + 4 + 1
    expect(a.sousTitres).toEqual(r.sousTitres);
  });

  it('texte seulement si on le donne ; rien à copier : la recette d’origine ; modeleMeilleurDAbord inchangé', () => {
    const a = accrocheDesMorceaux(r, [{ de: 21, a: 27 }], { texte: MEILLEUR.texte });
    expect(a.textes[0]).toMatchObject({ txt: MEILLEUR.texte, t: 0, dur: 6, role: 'accroche' });
    expect(accrocheDesMorceaux(r, [])).toBe(r);
    expect(accrocheDesMorceaux(r, [{ de: 5, a: 5 }])).toBe(r);
    const ancien = modeleMeilleurDAbord(r, 21, MEILLEUR.dureeExpress);
    expect(ancien.textes[0]).toMatchObject({ txt: MEILLEUR.texte, role: 'accroche' });
    expect(ancien.plans).toHaveLength(4);
  });
});

describe('dans le montage', () => {
  it('accroche de ~6 s prise dans une séquence ; titres décochés : aucun texte ; aucun chapitre dans l’accroche', () => {
    const m = montageTest(5);
    const res = habillerV4(m.recette, entreeTest(m, { momentsV4: [moment('fouRire', 236, 237.5, 0.9), moment('cri', 40, 41, 0.6)] }));
    const a = res.bilan.accroche!;
    expect(a.raison).toBe('fouRire');
    expect(a.plages.every((p) => p.de >= 210 && p.a <= 270)).toBe(true);
    const sc = compiler(res.recette);
    const n = a.plages.length;
    const fin = sc.plans[n - 1]!.t1;
    expect(fin).toBeGreaterThanOrEqual(ACCROCHE_V4.min - 1e-6);
    expect(fin).toBeLessThanOrEqual(ACCROCHE_V4.max + 1e-6);
    expect(sc.plans[n]!.trans?.type).toBe(MEILLEUR.transition);
    expect(res.recette.textes).toEqual([]);
    expect(res.recette.musique ?? null).toBeNull();
    // La phrase de l'accroche s'affiche en punchline (dans la copie comme dans sa séquence).
    expect(res.recette.sousTitres!.punchlines!.some((p) => a.plages.some((x) => p.ts >= x.de - 1e-6 && p.fin <= x.a + 1e-6))).toBe(true);
    expect(sc.sousTitres!.lignes.some((l) => l.t0 < fin)).toBe(true);
    const chapitres = res.recette.chapitres!;
    expect(chapitres[0]!.t).toBe(0);
    expect(chapitres.slice(1).every((c) => c.t >= fin - 1e-6)).toBe(true);
    // La réaction est en punch-in, la séquence d'origine garde son passage.
    expect(res.recette.plans[n - 1]!.zoomFixe?.force).toBe(1.32);
    expect(res.recette.plans.slice(n).some((p) => p.de <= a.plages[0]!.de && p.a >= a.plages[0]!.a)).toBe(true);
  });

  it('titres cochés : « ATTENDS… » sur l’accroche et des titres de section ≈ toutes les 2 min, sans whoosh', () => {
    const m = montageTest(8);
    const res = habillerV4(m.recette, entreeTest(m, { titres: true, momentsV4: [moment('cri', 333, 334, 0.8)] }));
    expect(res.recette.textes.find((x) => x.role === 'accroche')).toMatchObject({ txt: MEILLEUR.texte, t: 0 });
    const titres = res.recette.textes.filter((x) => x.role === 'section');
    expect(titres.length).toBe(res.bilan.titres);
    expect(titres.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < titres.length; i++) expect(titres[i]!.t - titres[i - 1]!.t).toBeGreaterThanOrEqual(110);
    expect(res.recette.sons).toEqual([]);
  });

  it('accroche décochée : rien de copié', () => {
    const m = montageTest(3);
    const res = habillerV4(m.recette, entreeTest(m, { accroche: false, momentsV4: [moment('cri', 40, 41, 0.6)] }));
    expect(res.bilan.accroche).toBeNull();
    expect(res.recette.plans.some((p) => p.trans === MEILLEUR.transition)).toBe(false);
  });
});
