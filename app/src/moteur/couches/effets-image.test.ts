// Zooms et transitions : courbes et transformations (fonctions pures, sans navigateur).
import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliserRecette } from '../../recette/normaliser';
import { etatImage } from '../etat-image';
import { decalageGlisse, hasard, intensite, mouvementsTransition } from './transitions';
import { courbeZoom, echelleZoom, zoneDuZoom } from './zooms';

const env = { l: 540, h: 960, echelle: 0.5 };
const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video' as const };

describe('zooms', () => {
  it('punch : entrée 0,08 s, maintien, sortie 0,12 s', () => {
    expect(courbeZoom('punch', 0, 0.6)).toBe(0);
    expect(courbeZoom('punch', 0.08, 0.6)).toBeCloseTo(1);
    expect(courbeZoom('punch', 0.3, 0.6)).toBe(1);
    expect(courbeZoom('punch', 0.48, 0.6)).toBeCloseTo(1);
    expect(courbeZoom('punch', 0.54, 0.6)).toBeCloseTo(0.5);
    expect(courbeZoom('punch', 0.6, 0.6)).toBeCloseTo(0);
  });
  it('doux : monte sans à-coup puis revient', () => {
    const vals = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => courbeZoom('doux', t, 3));
    expect(vals[0]).toBe(0);
    expect(vals[1]!).toBeLessThan(vals[2]!);
    expect(vals[2]!).toBeLessThan(vals[3]!);
    expect(vals[6]).toBeCloseTo(0);
  });
  it('échelle = 1 + (force − 1) × courbe ; zone limitée au Jeu + webcam (cam par défaut)', () => {
    const z = { zoom: { force: 2, dur: 0.6, style: 'punch' as const }, avancement: 0.5 };
    expect(echelleZoom(z)).toBeCloseTo(2);
    expect(echelleZoom(null)).toBe(1);
    expect(zoneDuZoom(z, { type: 'flou' })).toBe('tout');
    expect(zoneDuZoom(z, { type: 'jeuCam', cam: { x: 0, y: 0, l: 0.3, h: 0.3 } })).toBe('cam');
    expect(zoneDuZoom({ ...z, zoom: { ...z.zoom, zone: 'jeu' } }, { type: 'jeuCam', cam: { x: 0, y: 0, l: 0.3, h: 0.3 } })).toBe('jeu');
  });
  it('les zooms en temps source sont déjà convertis par la chronologie (passage réutilisé et ralenti)', () => {
    const s = compiler(normaliserRecette({ plans: [{ de: 10, a: 12 }, { de: 10, a: 12, vit: 0.5 }], zooms: [{ ts: 11, dur: 0.6 }] }, { sources: [v] }));
    expect(s.zooms.map((z) => z.t)).toEqual([1, 4]);
    expect(etatImage(s, 1.3)!.zoom?.avancement).toBeCloseTo(0.5);
    expect(etatImage(s, 4.3)!.zoom?.avancement).toBeCloseTo(0.5);
  });
});

describe('transitions', () => {
  const tr = (type: string, avancement: number) => ({ type, avancement, cote: avancement < 0 ? 'avant' : 'apres' } as never);
  it('intensité maximale à la coupe', () => {
    expect(intensite(0)).toBe(1);
    expect(intensite(-1)).toBe(0);
    expect(intensite(0.5)).toBe(0.5);
  });
  it('zoom : 1 → 1,4 à la coupe → 1', () => {
    expect(mouvementsTransition(tr('zoom', -1), env, 0)[0]!.echelle).toBeCloseTo(1);
    expect(mouvementsTransition(tr('zoom', 0), env, 0)[0]!.echelle).toBeCloseTo(1.4);
    expect(mouvementsTransition(tr('zoom', 1), env, 0)[0]!.echelle).toBeCloseTo(1);
  });
  it('glisse : l\'ancien plan part à gauche, le nouveau arrive de la droite (décalage fait après la mise en page)', () => {
    expect(decalageGlisse(-1)).toBeCloseTo(0);
    expect(decalageGlisse(-0.5)).toBeLessThan(0);
    expect(decalageGlisse(0)).toBeCloseTo(0.5);
    expect(decalageGlisse(0.5)).toBeGreaterThan(0);
    expect(decalageGlisse(1)).toBeCloseTo(0);
    expect(mouvementsTransition(tr('glisse', -0.2), env, 0)).toEqual([{ dx: 0, dy: 0, echelle: 1, rotation: 0 }]);
  });
  it('secousse : déterministe pour une même image, plus forte à la coupe', () => {
    const a = mouvementsTransition(tr('secousse', 0), env, 1.5)[0]!;
    expect(mouvementsTransition(tr('secousse', 0), env, 1.5)[0]).toEqual(a);
    expect(a.echelle).toBeCloseTo(1.1);
    expect(mouvementsTransition(tr('secousse', -0.9), env, 1.5)[0]!.echelle).toBeCloseTo(1.01);
    expect(hasard(3)()).toBe(hasard(3)());
  });
  it('flash, noir et glitch ne bougent pas l\'image (ce sont des calques)', () => {
    for (const t of ['flash', 'noir', 'glitch', 'glisse']) expect(mouvementsTransition(tr(t, 0), env, 0)).toEqual([{ dx: 0, dy: 0, echelle: 1, rotation: 0 }]);
  });
});
