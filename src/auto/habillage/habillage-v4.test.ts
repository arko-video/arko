// Étape « habillage » v4 (habillerV4) : l'ensemble, le mode voix, les cas vides, le bilan. Données fabriquées.

import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import type { Mot } from '../../recette/types';
import { bilanHabillage, habillerV4 } from './habillage-v4';
import { entreeTest, moment, montageTest, signauxTest } from './montage-test';

describe('habillerV4', () => {
  it('mode mots : punchlines, zooms, accroche, chapitres ; le bilan dit ce qui est posé ; la recette reste normalisée', () => {
    const m = montageTest(6);
    const res = habillerV4(m.recette, entreeTest(m, { momentsV4: [moment('cri', 433, 434, 0.9), moment('rire', 135, 136, 0.5)] }));
    const b = res.bilan;
    expect(b).toEqual(bilanHabillage(res.recette, b.accroche));
    expect(b.punchlines).toBeGreaterThan(0);
    expect(b.zoomsForts).toBeGreaterThan(0);
    expect(b.zoomsLegers).toBeGreaterThan(0);
    expect(b.accroche?.raison).toBe('cri');
    expect(b.chapitres).toBeGreaterThanOrEqual(3);
    expect(b.titres).toBe(0);
    expect(b.plans).toBe(m.recette.plans.length + b.accroche!.plages.length);
    expect(normaliser(JSON.parse(JSON.stringify(res.recette)), { sources: res.recette.sources }).recette).toEqual(res.recette);
    // Aucun bruitage dans un Best-of.
    expect(res.recette.sons).toEqual([]);
  });

  it('mode voix (mots vides) : pas de punchlines, mais zooms et accroche (coupée dans un silence)', () => {
    const m = montageTest(4, { mots: false });
    const vides = m.mots.map((x): Mot => ['', x[1], x[2]]);
    const res = habillerV4(m.recette, entreeTest(m, { mots: vides, momentsV4: [moment('rire', 233, 234, 0.7)] }));
    expect(res.bilan.punchlines).toBe(0);
    expect(res.recette.sousTitres ?? null).toBeNull();
    expect(res.bilan.zoomsForts).toBeGreaterThan(0);
    expect(res.bilan.accroche?.raison).toBe('rire');
  });

  it('sans séquence ni moment : rien d’inventé hors des séquences, et rien ne lève', () => {
    const m = montageTest(3);
    const res = habillerV4(m.recette, entreeTest(m, { sequences: [], signaux: signauxTest(1200, { pics: [{ ts: 15, db: -3, z: 12 }] }) }));
    expect(res.bilan.accroche).toBeNull();
    expect(res.bilan.chapitres).toBe(0);
    expect(compiler(res.recette).duree).toBeCloseTo(compiler(m.recette).duree, 6);
  });

  it('tout décoché : la recette d’origine', () => {
    const m = montageTest(2);
    const res = habillerV4(m.recette, entreeTest(m, { punchlines: false, zooms: null, accroche: false, sequences: [] }));
    expect(res.recette).toBe(m.recette);
  });
});
