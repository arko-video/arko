// C. Zooms automatiques : moments forts, répartition sur les plans, forces, opérations et dessin (faux contexte).

import { describe, expect, it } from 'vitest';
import type { ImageSource } from '../../moteur/canevas';
import { dessinerImage } from '../../moteur/compositeur';
import { FauxContexte, textesEcrits } from '../../moteur/couches/faux-contexte';
import { appliquerZoomFixe } from '../../moteur/couches/zoom-fixe';
import { etatImage } from '../../moteur/etat-image';
import { compiler } from '../../recette/chronologie';
import { normaliser, normaliserRecette } from '../../recette/normaliser';
import { compterZoomsAuto, retirerZoomsAuto, zoomsAutomatiques } from '../../recette/operations';
import type { Plan, Recette } from '../../recette/types';
import type { SignauxSource } from '../types';
import { FORCES_ZOOMS_AUTO, momentsForts, planifierZoomsAuto, sonsForts } from './zooms-auto';

const signaux = (o: Partial<SignauxSource> = {}): SignauxSource => ({
  src: 's1', duree: 100, pas: 0.02, rms: new Float32Array(5000).fill(0.01), pics: [], cris: [], rires: [], muets: [], ...o,
});

/** 9 plans de 10 s : [0,10], [10,20]… */
const PLANS: Plan[] = Array.from({ length: 9 }, (_, i) => ({ de: i * 10, a: i * 10 + 9 }));

describe('répartition sur 9 plans', () => {
  it('×1,32 sur les plans à moment fort, ×1,12 un plan sur trois sans fort, sinon rien', () => {
    const moments = [{ src: 's1', ts: 4 }, { src: 's1', ts: 25 }, { src: 's1', ts: 26 }, { src: 's1', ts: 51 }];
    const z = planifierZoomsAuto(PLANS, moments, 'normal', 's1');
    expect(z.map((x) => x?.force ?? 1)).toEqual([1.32, 1, 1.32, 1, 1, 1.32, 1, 1, 1.12]);
    expect(z[0]).toEqual({ force: 1.32, y: 0.45 });
  });
  it('un moment hors des plans (coupé) ou d\'une autre source ne compte pas', () => {
    const z = planifierZoomsAuto(PLANS, [{ src: 's1', ts: 9.5 }, { src: 's2', ts: 15 }], 'normal', 's1');
    expect(z.slice(0, 3).map((x) => x?.force ?? 1)).toEqual([1, 1, 1.12]);
  });
  it('forces Doux / Normal / Fort', () => {
    const moments = [{ src: 's1', ts: 1 }];
    for (const f of ['doux', 'normal', 'fort'] as const) {
      const z = planifierZoomsAuto(PLANS, moments, f, 's1');
      expect([z[0]!.force, z[2]!.force]).toEqual([FORCES_ZOOMS_AUTO[f].fort, FORCES_ZOOMS_AUTO[f].leger]);
    }
    expect(FORCES_ZOOMS_AUTO.doux.fort).toBeLessThan(FORCES_ZOOMS_AUTO.normal.fort);
    expect(FORCES_ZOOMS_AUTO.fort.fort).toBeGreaterThan(FORCES_ZOOMS_AUTO.normal.fort);
  });
});

describe('moments forts', () => {
  it('pics, cris, rires, sons > −16 dBFS sur 100 ms, et bruitages posés', () => {
    const rms = new Float32Array(5000).fill(0.01);
    rms.fill(0.3, 3000, 3010); // 60,0 à 60,2 s : −10 dBFS
    rms.fill(0.12, 4000, 4010); // −18 dBFS : pas assez fort
    const s = signaux({ rms, pics: [{ ts: 12, db: -8, z: 4 }], cris: [{ de: 20, a: 21, t: 20.4, force: 1 }], rires: [{ de: 30, a: 32, t: 31, force: 0.7 }] });
    const forts = sonsForts(s); // la 1re fenêtre de 100 ms déjà au-dessus de −16 dBFS
    expect(forts).toHaveLength(1);
    expect(Math.abs(forts[0]! - 60)).toBeLessThanOrEqual(0.1);
    const r = { sources: [], sons: [{ id: 'impact.boom', ts: 44 }, { id: 'whoosh.rapide', t: 5, role: 'section' }] } as unknown as Recette;
    expect(momentsForts(r, s).map((m) => m.ts)).toEqual([12, 20.4, 31, 44, forts[0]]);
    expect(momentsForts(r, null).map((m) => m.ts)).toEqual([44]);
  });
});

const s1 = { id: 's1', nom: 'v.mp4', taille: 1, emp: 'e', duree: 100, type: 'video' as const, l: 1920, h: 1080 };
const recette = (mise: object = { type: 'recadre' }): Recette => normaliserRecette({ plans: PLANS, mise, sons: [{ id: 'impact.boom', ts: 33 }] }, { sources: [s1] });

describe('opérations', () => {
  it('zoomsAutomatiques pose, retirerZoomsAuto retire ; le normaliseur garde les zooms', () => {
    const r = zoomsAutomatiques(recette(), signaux({ pics: [{ ts: 5, db: -6, z: 4 }] }), 'normal');
    expect(r.plans.map((p) => p.zoomFixe?.force ?? 1)).toEqual([1.32, 1, 1.12, 1.32, 1, 1.12, 1, 1, 1.12]);
    expect(compterZoomsAuto(r)).toBe(5);
    expect(compiler(r).plans[0]!.zoomFixe).toEqual({ force: 1.32, y: 0.45 });
    expect(normaliser(JSON.parse(JSON.stringify(r)), { sources: r.sources }).recette).toEqual(r);
    const sans = retirerZoomsAuto(r);
    expect(sans.plans.some((p) => p.zoomFixe)).toBe(false);
    expect(sans).toEqual(recette());
    expect(retirerZoomsAuto(sans)).toBe(sans);
  });
  it('sans signaux : les bruitages posés suffisent', () => {
    expect(zoomsAutomatiques(recette(), null, 'fort').plans[3]!.zoomFixe?.force).toBe(1.45);
  });
});

/** Image fabriquée : chaque dessin écrit un « texte » au coin haut-gauche de sa destination (agrandissement noté). */
const IMAGE: ImageSource = { largeur: 1920, hauteur: 1080, dessiner: (ctx, _sx, _sy, _sl, _sh, dx, dy) => ctx.fillText('img', dx, dy) };
const ENV = { l: 1080, h: 1920, echelle: 1 };
const FOND = {} as never; // recadre et jeu + webcam n'utilisent pas le fond flou

function dessiner(r: Recette, t: number): FauxContexte {
  const f = new FauxContexte();
  (f as unknown as { rect(): void; clip(): void }).rect = () => undefined;
  (f as unknown as { clip(): void }).clip = () => undefined;
  dessinerImage(f.ctx, etatImage(compiler(r), t), IMAGE, ENV, FOND);
  return f;
}

describe('dessin du zoom fixe', () => {
  it('transformation centrée en x 0,5 ; y 0,45', () => {
    const f = new FauxContexte();
    appliquerZoomFixe(f.ctx, { force: 1.32 }, { l: 1000, h: 2000, echelle: 1 });
    f.ctx.fillText('p', 500, 900); // le centre reste en place
    f.ctx.fillText('q', 0, 0);
    const [p, q] = textesEcrits(f);
    expect([p!.x, p!.y, p!.echelle]).toEqual([500, 900, 1.32]);
    expect(q!.x).toBeCloseTo(500 - 500 * 1.32);
    expect(q!.y).toBeCloseTo(900 - 900 * 1.32);
  });
  it('sans zoom ou force 1 : rien ne change', () => {
    const f = new FauxContexte();
    appliquerZoomFixe(f.ctx, undefined, ENV);
    appliquerZoomFixe(f.ctx, { force: 1 }, ENV);
    f.ctx.fillText('p', 10, 10);
    expect(textesEcrits(f)[0]).toMatchObject({ x: 10, y: 10, echelle: 1 });
  });
  it('compositeur : l\'image du plan zoomé est agrandie × 1,32, combinée avec un zoom posé', () => {
    const r = zoomsAutomatiques(recette(), null, 'normal'); // plan 3 (30–39) : fort
    const zoomee = textesEcrits(dessiner(r, 35)).map((t) => t.echelle);
    expect(Math.max(...zoomee)).toBeCloseTo(1.32);
    expect(Math.max(...textesEcrits(dessiner(r, 15)).map((t) => t.echelle))).toBeCloseTo(1);
    // Le zoom posé à 33 s (source) tombe à 30 s dans la vidéo finale (plans de 9 s) : en plein maintien à 31 s.
    const avecZoom = normaliserRecette({ ...r, zooms: [{ ts: 33, dur: 2, force: 1.5, style: 'punch' }] }, { sources: [s1] });
    expect(Math.max(...textesEcrits(dessiner(avecZoom, 31)).map((t) => t.echelle))).toBeCloseTo(1.32 * 1.5);
  });
  it('Jeu + webcam : seule la bande du jeu est agrandie', () => {
    const r = zoomsAutomatiques(recette({ type: 'jeuCam', cam: { x: 0.02, y: 0.62, l: 0.26, h: 0.34 } }), null, 'normal');
    const traces = textesEcrits(dessiner(r, 35));
    expect(traces.map((t) => Math.round(t.echelle * 100) / 100).sort()).toEqual([1, 1.32]);
    // Zoom posé sur la webcam + zoom fixe : webcam agrandie par son zoom, jeu par le zoom fixe.
    const deux = normaliserRecette({ ...r, zooms: [{ ts: 33, dur: 2, force: 1.5, style: 'punch', zone: 'cam' }] }, { sources: [s1] });
    const e = textesEcrits(dessiner(deux, 31)).map((t) => Math.round(t.echelle * 100) / 100);
    expect(e).toContain(1.5);
    expect(e).toContain(1.32);
  });
});
