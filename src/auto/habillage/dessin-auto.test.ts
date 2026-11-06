// Dessin du Montage auto « Habillage » (faux contexte) : style Punchline (majuscules, mot clé coloré, jurons masqués,
// contour, ombre, « pop » image par image, taille en 720p, place en 16:9), bandeau des titres de section,
// et aperçu = export (le même dessin, seulement mis à l'échelle).

import { describe, expect, it } from 'vitest';
import type { Env } from '../../moteur/canevas';
import { FauxContexte, textesEcrits, type Trace } from '../../moteur/couches/faux-contexte';
import { dessinerSousTitres, echellePop } from '../../moteur/couches/sous-titres';
import { dessinerTextes } from '../../moteur/couches/textes';
import { etatImage } from '../../moteur/etat-image';
import { compiler } from '../../recette/chronologie';
import { normaliserRecette } from '../../recette/normaliser';
import { choisirModeSousTitres, definirPunchlines, titresDeSection } from '../../recette/operations';
import type { Mot, Recette } from '../../recette/types';
import { trouverPunchlines } from './punchlines';

const s1 = { id: 's1', nom: 'v.mp4', taille: 1, emp: 'e', duree: 60, type: 'video' as const, l: 1920, h: 1080 };
// « putain le creeper » (juron) de 2 à 2,9 s ; « bon on avance » (rien) avant.
const MOTS: Mot[] = [['bon', 0, 0.3], ['on', 0.3, 0.5], ['avance', 0.5, 1], ['putain', 2, 2.3], ['le', 2.3, 2.45], ['creeper', 2.45, 2.9]];

function punch(destination: 'tiktok' | 'youtube', o: object = {}): Recette {
  const r = normaliserRecette({ destination, plans: [{ de: 0, a: 20 }], sousTitres: { mots: MOTS, ...o } }, { sources: [s1] });
  return choisirModeSousTitres(definirPunchlines(r, trouverPunchlines(MOTS, null)), 'punchlines');
}

function dessinerST(r: Recette, t: number, env: Env): FauxContexte {
  const f = new FauxContexte();
  const sc = compiler(r);
  dessinerSousTitres(f.ctx, etatImage(sc, t)!.sousTitres, env, sc.gab);
  return f;
}

const TIKTOK_EXPORT: Env = { l: 1080, h: 1920, echelle: 1 };
const TIKTOK_APERCU: Env = { l: 540, h: 960, echelle: 0.5 };
const YT_720: Env = { l: 1280, h: 720, echelle: 720 / 1080 };
const YT_1080: Env = { l: 1920, h: 1080, echelle: 1 };

describe('style Punchline', () => {
  it('MAJUSCULES, juron masqué, mot clé en jaune, les autres en blanc', () => {
    const ecrits = textesEcrits(dessinerST(punch('tiktok'), 2.5, TIKTOK_EXPORT));
    expect(ecrits.map((t) => t.txt)).toEqual(['P*TAIN', 'LE', 'CREEPER']);
    const cle = ecrits.find((t) => t.txt === 'P*TAIN')!;
    expect(cle.fillStyle).toBe('#FFE500');
    expect(ecrits.filter((t) => t.txt !== 'P*TAIN').every((t) => t.fillStyle === '#FFFFFF')).toBe(true);
  });
  it('mot clé en rouge ; jurons visibles si on le demande', () => {
    const ecrits = textesEcrits(dessinerST(punch('tiktok', { couleurCle: 'rouge', jurons: 'visibles' }), 2.5, TIKTOK_EXPORT));
    expect(ecrits.find((t) => t.txt === 'PUTAIN')!.fillStyle).toBe('#FF3030');
  });
  it('rien hors des punchlines (« bon on avance » n\'est pas dessiné)', () => {
    expect(textesEcrits(dessinerST(punch('tiktok'), 0.6, TIKTOK_EXPORT))).toEqual([]);
  });
  it('Inter 800, 105 px de référence (70 px en 720p), contour noir 7,5 (5 px en 720p), ombre', () => {
    const f = dessinerST(punch('youtube'), 2.5, YT_720);
    const le = textesEcrits(f).find((t) => t.txt === 'LE')!;
    expect(le.font).toContain('800 105px');
    expect(le.echelle * 105).toBeCloseTo(70);
    const contour = f.traces.find((t) => t.op === 'strokeText')!;
    expect(contour.strokeStyle).toBe('#000000');
    expect((contour.lineWidth / 2) * contour.echelle).toBeCloseTo(5);
    expect(contour.shadowBlur).toBeGreaterThan(0);
    expect(le.shadowBlur).toBe(0); // l'ombre est sous le contour seulement
    expect(textesEcrits(f).find((t) => t.txt === 'P*TAIN')!.font).toContain('113.4px'); // mot clé × 1,08
  });
  it('16:9 : tiers bas (y ≈ 0,74), au-dessus de la barre d\'objets', () => {
    const ecrits = textesEcrits(dessinerST(punch('youtube'), 2.5, YT_1080));
    for (const t of ecrits) {
      expect(t.y / 1080).toBeGreaterThan(0.7);
      expect(t.y / 1080).toBeLessThan(0.8);
    }
  });
  it('« pop » image par image : 70 % → 108 % à 90 ms → 100 % à 160 ms', () => {
    expect(echellePop(0)).toBeCloseTo(0.7);
    expect(echellePop(0.09)).toBeCloseTo(1.08);
    expect(echellePop(0.16)).toBe(1);
    expect(echellePop(0.045)).toBeGreaterThan(0.7);
    expect(echellePop(0.045)).toBeLessThan(1.08);
    expect(echellePop(0.125)).toBeLessThan(1.08);
    expect(echellePop(0.125)).toBeGreaterThan(1);
    // Images à 30 i/s dans le dessin : la ligne commence à 2 s.
    const echelles = [0, 1, 2, 3, 4, 5].map((n) => textesEcrits(dessinerST(punch('tiktok'), 2 + n / 30, TIKTOK_EXPORT))[0]!.echelle);
    expect(echelles[0]).toBeCloseTo(0.7);
    expect(echelles[5]).toBe(1);
    expect(Math.max(...echelles)).toBeGreaterThan(1.03);
    expect(Math.max(...echelles)).toBeLessThanOrEqual(1.08);
  });
});

/** Les traces de l'aperçu sont celles de l'export, à l'échelle k. */
function memeDessin(a: Trace[], b: Trace[], k: number) {
  expect(a.length).toBe(b.length);
  expect(a.length).toBeGreaterThan(0);
  a.forEach((x, i) => {
    const y = b[i]!;
    expect([x.op, x.txt, x.font, x.fillStyle]).toEqual([y.op, y.txt, y.font, y.fillStyle]);
    expect(x.x * k).toBeCloseTo(y.x, 6);
    expect(x.y * k).toBeCloseTo(y.y, 6);
    expect(x.echelle * k).toBeCloseTo(y.echelle, 6);
  });
}

describe('aperçu = export', () => {
  it('punchline : même dessin à la moitié de la taille', () => {
    for (const t of [2.03, 2.5]) memeDessin(dessinerST(punch('tiktok'), t, TIKTOK_EXPORT).traces, dessinerST(punch('tiktok'), t, TIKTOK_APERCU).traces, 0.5);
  });
  it('titre de section : même dessin en 720p et en 1080p', () => {
    const r = titresDeSection(
      normaliserRecette({ destination: 'youtube', plans: [{ de: 0, a: 30 }], chapitres: [{ t: 0, nom: 'Intro' }, { t: 10, nom: 'Le château' }] }, { sources: [s1] }),
      { source: 'chapitres' },
    );
    const dessiner = (t: number, env: Env) => {
      const f = new FauxContexte();
      const sc = compiler(r);
      dessinerTextes(f.ctx, etatImage(sc, t)!.textes, env, sc.gab);
      return f;
    };
    memeDessin(dessiner(10.1, YT_1080).traces, dessiner(10.1, YT_720).traces, 720 / 1080);
    // Bandeau : fond jaune, texte noir en MAJUSCULES, penché, entrée « pop » puis taille normale.
    const f = dessiner(11, YT_1080);
    expect(f.traces[0]).toMatchObject({ op: 'fill', fillStyle: '#FFE500' });
    const txt = textesEcrits(f)[0]!;
    expect(txt).toMatchObject({ txt: 'LE CHÂTEAU', fillStyle: '#0F1115' });
    expect(txt.rotation).toBeCloseTo(-2);
    expect(txt.echelle).toBeCloseTo(1);
    expect(textesEcrits(dessiner(10.05, YT_1080))[0]!.echelle).toBeLessThan(1);
    expect(textesEcrits(dessiner(12.5, YT_1080))).toEqual([]); // fini après 2,2 s
  });
});
