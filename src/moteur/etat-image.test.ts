import { describe, expect, it } from 'vitest';
import { compiler } from '../recette/chronologie';
import { normaliserRecette } from '../recette/normaliser';
import { etatImage, planSuivant } from './etat-image';

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video' as const };
const s = compiler(
  normaliserRecette(
    {
      mise: { type: 'flou', y: 0.4 },
      plans: [{ de: 0, a: 2 }, { de: 5, a: 7, trans: { type: 'fondu', dur: 0.5 }, mise: { type: 'recadre', x: 0.3 } }],
      textes: [{ txt: 'Salut', t: 0, dur: 1 }],
      zooms: [{ ts: 5.5, dur: 1 }],
    },
    { sources: [v] },
  ),
);

describe('etatImage', () => {
  it('donne le plan, le temps source et la mise effective', () => {
    const e = etatImage(s, 0.5)!;
    expect(e.plan.i).toBe(0);
    expect(e.ts).toBe(0.5);
    expect(e.mise).toEqual({ type: 'flou', y: 0.4 });
    expect(e.textes.map((x) => x.texte.txt)).toEqual(['Salut']);
    expect(e.textes[0]).toMatchObject({ i: 0, age: 0.5, reste: 0.5 });
    const f = etatImage(s, 2.25)!;
    expect(f.plan.i).toBe(1);
    expect(f.ts).toBeCloseTo(5.25);
    expect(f.mise).toEqual({ type: 'recadre', x: 0.3 });
    expect(f.textes).toEqual([]);
    // « fondu » (ancien nom) est devenu « noir ». Durée 0,5 s : 0,25 s avant la coupe (t = 2), 0,25 s après.
    expect(f.transition).toBeNull(); // 2,25 s : la transition vient de finir
    expect(etatImage(s, 2.1)!.transition).toMatchObject({ type: 'noir', cote: 'apres' });
    expect(etatImage(s, 2.1)!.transition!.avancement).toBeCloseTo(0.4);
    expect(etatImage(s, 2.6)!.transition).toBeNull();
  });
  it('transition des deux côtés de la coupe, sans chevauchement', () => {
    const avant = etatImage(s, 1.8)!;
    expect(avant.plan.i).toBe(0); // on montre encore le plan précédent
    expect(avant.transition).toMatchObject({ type: 'noir', cote: 'avant' });
    expect(avant.transition!.avancement).toBeCloseTo(-0.8);
    expect(avant.transition!.depuis.i).toBe(0);
    expect(avant.transition!.vers.i).toBe(1);
    expect(etatImage(s, 1.74)!.transition).toBeNull();
    const coupe = etatImage(s, 2)!;
    expect(coupe.plan.i).toBe(1);
    expect(coupe.transition).toMatchObject({ cote: 'apres', avancement: 0 });
    // La durée totale ne change pas.
    expect(s.duree).toBe(4);
  });
  it('chaque moitié est limitée à la moitié du plan', () => {
    const court = compiler(
      normaliserRecette({ plans: [{ de: 0, a: 0.2 }, { de: 5, a: 5.3, trans: { type: 'flash', dur: 0.6 } }] }, { sources: [v] }),
    );
    expect(etatImage(court, 0.05)!.transition).toBeNull();
    expect(etatImage(court, 0.11)!.transition).toMatchObject({ type: 'flash', cote: 'avant' });
    expect(etatImage(court, 0.11)!.transition!.avancement).toBeCloseTo(-0.9);
    expect(etatImage(court, 0.34)!.transition).toMatchObject({ cote: 'apres' });
    expect(etatImage(court, 0.36)!.transition).toBeNull();
  });
  it('zoom actif au bon moment', () => {
    expect(etatImage(s, 2.5)!.zoom?.avancement).toBeCloseTo(0);
    expect(etatImage(s, 3)!.zoom?.avancement).toBeCloseTo(0.5);
    expect(etatImage(s, 1)!.zoom).toBeNull();
  });
  it('borne le temps et gère la fin', () => {
    expect(etatImage(s, 4)!.ts).toBe(7);
    expect(etatImage(s, 99)!.ts).toBe(7);
    expect(planSuivant(s, 1)!.i).toBe(1);
    expect(planSuivant(s, 3)).toBeNull();
  });
});
