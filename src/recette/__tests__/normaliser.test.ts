import { describe, expect, it } from 'vitest';
import { normaliser } from '../normaliser';
import { lireTemps, arrondir } from '../temps';
import { dureeFinale } from '../operations';

import gaming from '../exemples/gaming-25s.json';
import iaMinimale from '../exemples/ia-minimale.json';

const exemples: Record<string, unknown> = { 'gaming-25s.json': gaming, 'ia-minimale.json': iaMinimale };
const ex = (nom: string) => structuredClone(exemples[nom]);

describe('temps', () => {
  it('lit les écritures courantes', () => {
    expect(lireTemps(12.5)).toBe(12.5);
    expect(lireTemps('12,5')).toBe(12.5);
    expect(lireTemps('12.5s')).toBe(12.5);
    expect(lireTemps('2:14.5')).toBe(134.5);
    expect(lireTemps('1:02:14,5')).toBe(3734.5);
    expect(lireTemps('abc')).toBeNull();
    expect(lireTemps('')).toBeNull();
    expect(lireTemps(NaN)).toBeNull();
  });
  it('arrondit au 1/100', () => {
    expect(arrondir(1.005)).toBe(1.01);
    expect(arrondir(2.344)).toBe(2.34);
    expect(Object.is(arrondir(-0.001), 0)).toBe(true);
  });
});

describe('normaliser', () => {
  it('remplit les valeurs par défaut', () => {
    const r = normaliser({ format: 'arko.recette/1', plans: [{ de: 0, a: 3 }] }).recette;
    expect(r).toEqual({
      format: 'arko.recette/1', sources: [], plans: [{ de: 0, a: 3 }], mise: { type: 'flou', y: 0.5 },
      textes: [], sousTitres: null, sons: [], zooms: [], guide: null, boucle: false,
      export: { h: 1920, ips: 30, qualite: 'normale' },
    });
  });

  it('garde le rôle des textes (accroche, top3) et ignore un rôle inconnu', () => {
    const r = normaliser({
      plans: [{ de: 0, a: 9 }],
      textes: [{ txt: 'Regarde', role: 'accroche' }, { txt: '#1', role: 'top3', t: 2 }, { txt: '#2', role: 'bidule', t: 3 }],
    });
    expect(r.recette.textes.map((x) => x.role)).toEqual(['accroche', 'top3', undefined]);
    expect(r.problemes.some((p) => p.chemin === 'textes[2].role' && p.niveau === 'ignore')).toBe(true);
  });

  it('accepte les deux exemples', () => {
    const g = normaliser(ex('gaming-25s.json'));
    expect(g.bloquant).toBe(false);
    expect(g.problemes.filter((p) => p.niveau === 'corrige')).toEqual([]);
    expect(dureeFinale(g.recette)).toBe(25);
    // Sans aucun son connu, le son est retiré avec un message.
    const m = normaliser(ex('ia-minimale.json'), undefined, { sonsConnus: [] });
    expect(m.bloquant).toBe(false);
    expect(m.recette.plans).toHaveLength(2);
    expect(m.recette.sons).toEqual([]);
    expect(m.problemes.some((p) => p.message.includes('"impact.boom" n\'existe pas'))).toBe(true);
    expect(m.recette.sousTitres?.mots).toBe('auto');
    // Ancien nom écrit par l'IA : « whoosh » devient « glisse », avec un message.
    expect(m.recette.plans[1]!.trans).toBe('glisse');
    expect(m.problemes.some((p) => p.niveau === 'corrige' && p.message.includes('"whoosh" s\'appelle maintenant "glisse"'))).toBe(true);
    // Avec le son connu, il est gardé.
    expect(normaliser(ex('ia-minimale.json'), undefined, { sonsConnus: ['impact.boom'] }).recette.sons).toEqual([{ id: 'impact.boom', ts: 857.1, vol: 0.8 }]);
  });

  it('les sources du moteur font foi et sont ajoutées si absentes', () => {
    const s = { id: 's1', nom: 'a.mp4', taille: 10, emp: 'e', duree: 8, type: 'video' as const, l: 1920, h: 1080 };
    const r = normaliser({ plans: [{ de: 0, a: 20 }] }, { sources: [s] }).recette;
    expect(r.sources).toEqual([s]);
    expect(r.plans).toEqual([{ de: 0, a: 8 }]);
  });

  it('plusieurs sources : un plan vers une source inconnue est supprimé', () => {
    const v = (id: string) => ({ id, nom: id, taille: 1, emp: '', duree: 50, type: 'video' as const });
    const r = normaliser({ plans: [{ src: 'x', de: 0, a: 3 }, { src: 's2', de: 1, a: 2 }] }, { sources: [v('s1'), v('s2')] });
    expect(r.recette.plans).toEqual([{ src: 's2', de: 1, a: 2 }]);
  });

  it('conseil au-delà de 180 s', () => {
    const r = normaliser({ format: 'arko.recette/1', plans: [{ de: 0, a: 200 }] });
    expect(r.bloquant).toBe(false);
    expect(r.problemes.some((p) => p.niveau === 'conseil')).toBe(true);
  });

  it('texte JSON invalide → bloquant', () => {
    const r = normaliser('{ pas du json');
    expect(r.bloquant).toBe(true);
  });

  it('ne modifie jamais l\'objet reçu', () => {
    const brut = { format: 'arko.recette/1', plans: [{ de: 9, a: 2 }] };
    const copie = JSON.parse(JSON.stringify(brut)) as unknown;
    normaliser(brut);
    expect(brut).toEqual(copie);
  });

  it('guide : volume borné, source inconnue retirée', () => {
    const s = { id: 'g1', nom: 'son.mp3', taille: 1, emp: '', duree: 30, type: 'audio' as const };
    const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 30, type: 'video' as const };
    const ok = normaliser({ plans: [{ de: 0, a: 3 }], guide: { src: 'g1', vol: 4 } }, { sources: [v, s] }).recette;
    expect(ok.guide).toEqual({ src: 'g1', t: 0, debut: 0, vol: 1 });
    const ko = normaliser({ plans: [{ de: 0, a: 3 }], guide: { src: 'g9' } }, { sources: [v, s] }).recette;
    expect(ko.guide).toBeNull();
  });
});
