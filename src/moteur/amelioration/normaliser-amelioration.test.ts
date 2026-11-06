// Améliorer l'image — normaliseur du champ facultatif `recette.amelioration` et opération choisirAmelioration.

import { describe, expect, it } from 'vitest';
import { normaliser, normaliserRecette } from '../../recette/normaliser';
import { Journal } from '../../recette/normaliser-outils';
import type { Recette } from '../../recette/types';
import { normaliserAmelioration } from './normaliser-amelioration';
import { choisirAmelioration } from './operation-amelioration';

const s1 = { id: 's1', nom: 'obs.mp4', taille: 1, emp: 'e', duree: 60, type: 'video' as const, l: 1280, h: 720 };
const base = (o: object = {}): Recette => normaliserRecette({ destination: 'youtube', plans: [{ de: 0, a: 20 }], ...o }, { sources: [s1] });
const lire = (v: unknown) => {
  const j = new Journal();
  return { r: normaliserAmelioration(v, j), problemes: j.problemes };
};

describe('normaliserAmelioration', () => {
  it('absent, null, false, « non » : pas de champ', () => {
    for (const v of [undefined, null, false, 'non', 'Non', { niveau: 'non' }]) expect(lire(v).r).toBeUndefined();
  });

  it('true, « léger », « Fort » : réglage complet', () => {
    expect(lire(true).r).toEqual({ niveau: 'leger', nettoyer: true, agrandir: true });
    expect(lire('Léger').r).toEqual({ niveau: 'leger', nettoyer: true, agrandir: true });
    expect(lire('Fort').r).toEqual({ niveau: 'fort', nettoyer: true, agrandir: true });
  });

  it('objet : garde les choix, corrige ce qui est faux (avec un message)', () => {
    expect(lire({ niveau: 'fort', nettoyer: false, agrandir: true }).r).toEqual({ niveau: 'fort', nettoyer: false, agrandir: true });
    const faux = lire({ niveau: 'ultra', agrandir: 'oui', couleur: 2 });
    expect(faux.r).toEqual({ niveau: 'leger', nettoyer: true, agrandir: true });
    expect(faux.problemes.map((p) => p.chemin)).toEqual(expect.arrayContaining(['amelioration.niveau', 'amelioration.agrandir']));
    expect(faux.problemes.some((p) => p.message.includes('couleur'))).toBe(true);
  });

  it('niveau inconnu en texte → Léger ; valeur illisible → ignorée', () => {
    expect(lire('max+').r).toEqual({ niveau: 'leger', nettoyer: true, agrandir: true });
    expect(lire(12).r).toBeUndefined();
    expect(lire(12).problemes).toHaveLength(1);
  });
});

describe('dans la recette', () => {
  it('rétrocompatible : une recette sans le champ ne le reçoit jamais', () => {
    const r = base();
    expect('amelioration' in r).toBe(false);
    expect(Object.keys(normaliser(JSON.parse(JSON.stringify(r)), { sources: r.sources }).recette)).not.toContain('amelioration');
  });

  it('le normaliseur garde le réglage (idempotent), sans problème signalé', () => {
    const r = base({ amelioration: { niveau: 'fort', nettoyer: true, agrandir: false } });
    expect(r.amelioration).toEqual({ niveau: 'fort', nettoyer: true, agrandir: false });
    const n = normaliser(JSON.parse(JSON.stringify(r)), { sources: r.sources });
    expect(n.recette).toEqual(r);
    expect(n.problemes.filter((p) => p.chemin.startsWith('amelioration'))).toEqual([]);
  });

  it('choisirAmelioration : pose, change, retire ; sans effet → même recette', () => {
    const r = base();
    const a = choisirAmelioration(r, { niveau: 'leger', nettoyer: true, agrandir: true });
    expect(a.amelioration).toEqual({ niveau: 'leger', nettoyer: true, agrandir: true });
    expect(choisirAmelioration(a, { niveau: 'leger', nettoyer: true, agrandir: true })).toBe(a);
    const b = choisirAmelioration(a, { niveau: 'fort', nettoyer: false, agrandir: true });
    expect(b.amelioration).toEqual({ niveau: 'fort', nettoyer: false, agrandir: true });
    const c = choisirAmelioration(b, null);
    expect('amelioration' in c).toBe(false);
    expect(choisirAmelioration(c, null)).toBe(c);
    expect(c.plans).toEqual(r.plans);
  });
});
