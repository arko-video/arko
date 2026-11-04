// Zooms qui se chevauchent (QA M-2) : l'échelle passe de l'un à l'autre sans saut.
import { describe, expect, it } from 'vitest';
import { compiler } from '../recette/chronologie';
import { normaliserRecette } from '../recette/normaliser';
import { echelleZoom } from './couches/zooms';
import { etatImage } from './etat-image';

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video' as const };
const scenario = (zooms: object[]) => compiler(normaliserRecette({ plans: [{ de: 0, a: 10 }], zooms }, { sources: [v] }));

describe('zooms qui se chevauchent', () => {
  it('aucun saut d\'échelle ni de centre, d\'image en image', () => {
    const s = scenario([
      { ts: 1, dur: 1, force: 2, x: 0.2, y: 0.2 },
      { ts: 1.5, dur: 1, force: 1.5, x: 0.8, y: 0.8, style: 'doux' },
    ]);
    let avant = { e: 1, x: 0.5 };
    for (let t = 0.9; t < 2.7; t += 0.0005) {
      const z = etatImage(s, t)!.zoom;
      const e = echelleZoom(z);
      const x = z?.zoom.x ?? 0.5;
      expect(Math.abs(e - avant.e)).toBeLessThan(0.02); // pas de 0,5 ms : le punch le plus rapide monte de ~0,013
      if (e > 1.01 && avant.e > 1.01) expect(Math.abs(x - avant.x)).toBeLessThan(0.02);
      avant = { e, x };
    }
  });

  it('un zoom seul garde sa durée par défaut (ZOOM.dur)', () => {
    const s = scenario([{ ts: 1 }]);
    expect(etatImage(s, 1.59)!.zoom).not.toBeNull();
    expect(etatImage(s, 1.61)!.zoom).toBeNull();
  });
});
