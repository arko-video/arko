// Opérations « effets » (phase 3). Le catalogue des sons est simulé : ces tests ne dépendent pas des sons réels.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../sons/catalogue', () => {
  const CATALOGUE = [
    { id: 'impact.boom', nom: 'Boom', famille: 'impact', duree: 1.2, licence: 'CC0', version: 1 },
    { id: 'whoosh.rapide', nom: 'Whoosh', famille: 'whoosh', duree: 0.5, licence: 'CC0', version: 1 },
  ];
  return {
    CATALOGUE,
    FAMILLES: [],
    catalogueIds: () => CATALOGUE.map((s) => s.id),
    trouverSon: (id: string) => CATALOGUE.find((s) => s.id === id),
  };
});

import { normaliserRecette } from '../normaliser';
import {
  ajouterSon, ajouterSource, ajouterZoom, choisirTransition, definirGuide, modifierSon, modifierZoom, reperesEffets,
  supprimerSon, supprimerZoom, transitionPartout,
} from '../operations';
import type { Recette, Source } from '../types';

const v: Source = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video', l: 1920, h: 1080 };
const a1: Source = { id: 'a1', nom: 'rire.mp3', taille: 1, emp: '', duree: 2.5, type: 'audio' };
/** 3 plans : [0 ; 4] (4 s), [10 ; 14] (4 s), [10 ; 12] au ralenti ×0,5 (4 s) → coupes à 4 et 8 s. */
const base = (): Recette =>
  normaliserRecette({ plans: [{ de: 0, a: 4 }, { de: 10, a: 14 }, { de: 10, a: 12, vit: 0.5 }] }, { sources: [v] });
const copie = (r: Recette) => JSON.parse(JSON.stringify(r)) as Recette;

describe('sons', () => {
  it('ajouterSon : indice, volume par défaut, immuable', () => {
    const r0 = base();
    const avant = copie(r0);
    const { recette, i } = ajouterSon(r0, { id: 'impact.boom', ts: 11 });
    expect(i).toBe(0);
    expect(recette.sons[0]).toEqual({ id: 'impact.boom', ts: 11, vol: 0.8 });
    expect(r0).toEqual(avant);
  });
  it('ajouterSon : son inconnu → recette d\'origine et i = -1', () => {
    const r0 = base();
    const res = ajouterSon(r0, { id: 'vine.boom', t: 1 });
    expect(res.i).toBe(-1);
    expect(res.recette).toBe(r0);
  });
  it('son importé : la source audio est ajoutée une fois, le son garde son id', () => {
    const r1 = ajouterSource(base(), a1);
    expect(r1.sources.map((s) => s.id)).toEqual(['s1', 'a1']);
    expect(ajouterSource(r1, a1)).toBe(r1);
    const { recette, i } = ajouterSon(r1, { id: 'a1', ts: 2, vol: 1.2 });
    expect(recette.sons[i]).toEqual({ id: 'a1', ts: 2, vol: 1.2 });
    // Écrit avec src (comme une IA pourrait le faire) : rangé dans id.
    expect(ajouterSon(r1, { id: 'x', src: 'a1', t: 1 }).recette.sons[0]).toEqual({ id: 'a1', t: 1, vol: 0.8 });
  });
  it('modifierSon : volume borné, déplacement en t retire ts ; supprimerSon', () => {
    const { recette } = ajouterSon(base(), { id: 'impact.boom', ts: 11 });
    expect(modifierSon(recette, 0, { vol: 3 }).sons[0]!.vol).toBe(1.5);
    expect(modifierSon(recette, 0, { t: 2 }).sons[0]).toEqual({ id: 'impact.boom', t: 2, vol: 0.8 });
    expect(modifierSon(recette, 0, { ts: 11.1 }).sons[0]!.ts).toBe(11.1);
    expect(modifierSon(recette, 0, { vol: 0.8 })).toBe(recette);
    expect(modifierSon(recette, 5, { vol: 1 })).toBe(recette);
    expect(supprimerSon(recette, 0).sons).toEqual([]);
    expect(supprimerSon(recette, 3)).toBe(recette);
  });
});

describe('transitions', () => {
  it('choisirTransition : à l\'entrée du plan i, jamais sur le premier ; coupe = pas de champ', () => {
    const r0 = base();
    const r1 = choisirTransition(r0, 1, 'flash');
    expect(r1.plans[1]!.trans).toBe('flash');
    expect(r0.plans[1]!.trans).toBeUndefined();
    expect(choisirTransition(r0, 0, 'flash')).toBe(r0);
    expect(choisirTransition(r0, 9, 'flash')).toBe(r0);
    expect(choisirTransition(r1, 1, null).plans[1]!.trans).toBeUndefined();
    expect(choisirTransition(r1, 1, 'coupe').plans[1]!.trans).toBeUndefined();
    expect(choisirTransition(r1, 1, 'flash')).toBe(r1);
  });
  it('choisirTransition : normalisée (alias, durée bornée, son coupé)', () => {
    const r = choisirTransition(base(), 2, { type: 'whoosh', dur: 2, son: false });
    expect(r.plans[2]!.trans).toEqual({ type: 'glisse', dur: 0.6, son: false });
    expect(choisirTransition(base(), 1, 'explosion').plans[1]!.trans).toBeUndefined();
  });
  it('transitionPartout : toutes les coupes, la durée totale ne change pas', () => {
    const r = transitionPartout(base(), { type: 'glitch', dur: 0.4 });
    expect(r.plans.map((p) => p.trans)).toEqual([undefined, { type: 'glitch', dur: 0.4 }, { type: 'glitch', dur: 0.4 }]);
    expect(reperesEffets(r).coupes).toEqual([4, 8]);
    expect(transitionPartout(r, null).plans.every((p) => p.trans === undefined)).toBe(true);
  });
});

describe('zooms', () => {
  it('ajouterZoom : valeurs par défaut, zone selon la mise en page', () => {
    const { recette, i } = ajouterZoom(base(), { ts: 1, force: 1.6 });
    expect(recette.zooms[i]).toEqual({ ts: 1, dur: 0.6, x: 0.5, y: 0.5, force: 1.6, style: 'punch', zone: 'tout' });
    const jeuCam = normaliserRecette({ plans: [{ de: 0, a: 4 }], mise: { type: 'jeuCam' } }, { sources: [v] });
    expect(ajouterZoom(jeuCam, { ts: 1 }).recette.zooms[0]!.zone).toBe('cam');
    expect(ajouterZoom(jeuCam, { ts: 1, zone: 'jeu' }).recette.zooms[0]!.zone).toBe('jeu');
  });
  it('modifierZoom / supprimerZoom', () => {
    const { recette } = ajouterZoom(base(), { ts: 1 });
    expect(modifierZoom(recette, 0, { force: 9, style: 'doux' }).zooms[0]).toMatchObject({ force: 2.5, style: 'doux' });
    expect(modifierZoom(recette, 0, { t: 3 }).zooms[0]).toMatchObject({ t: 3 });
    expect(modifierZoom(recette, 0, { t: 3 }).zooms[0]!.ts).toBeUndefined();
    expect(modifierZoom(recette, 1, { force: 2 })).toBe(recette);
    expect(supprimerZoom(recette, 0).zooms).toEqual([]);
  });
});

describe('son guide', () => {
  it('definirGuide : posé, normalisé, retiré', () => {
    const r1 = ajouterSource(base(), a1);
    const r2 = definirGuide(r1, { src: 'a1', debut: 12, vol: 4 });
    expect(r2.guide).toEqual({ src: 'a1', t: 0, debut: 12, vol: 1 });
    expect(definirGuide(r2, null).guide).toBeNull();
    expect(definirGuide(r1, null)).toBe(r1);
    expect(definirGuide(r1, { src: 'inconnu' })).toBe(r1);
  });
});

describe('reperesEffets', () => {
  it('sons et zooms en temps de sortie (un passage réutilisé les fait réapparaître), et les coupes', () => {
    let r = ajouterSource(base(), a1);
    r = ajouterSon(r, { id: 'impact.boom', ts: 11 }).recette; // dans les plans 2 (→ 5 s) et 3 (au ralenti → 10 s)
    r = ajouterSon(r, { id: 'a1', t: 1 }).recette;
    r = ajouterSon(r, { id: 'whoosh.rapide', ts: 30 }).recette; // hors des plans : jamais entendu
    r = ajouterZoom(r, { ts: 2, dur: 1 }).recette;
    const rep = reperesEffets(r);
    expect(rep.sons).toEqual([
      { i: 1, t: 1, dur: 2.5 },
      { i: 0, t: 5, dur: 1.2 },
      { i: 0, t: 10, dur: 1.2 },
    ]);
    expect(rep.zooms).toEqual([{ i: 0, t: 2, dur: 1 }]);
    expect(rep.coupes).toEqual([4, 8]);
  });
});
