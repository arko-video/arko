// B. Rendu des éléments insérés (dev 2) : carton, chibi plein écran (faux contexte), image fixe en fond flou,
// et le crochet preparerInserts dans le scénario.
import { describe, expect, it, vi } from 'vitest';
import { compiler } from '../../../recette/chronologie';
import { normaliserRecette } from '../../../recette/normaliser';
import { insererElement } from '../../../recette/operations';
import type { DefinitionChibi, Recette, Source } from '../../../recette/types';
import { FauxContexte } from '../../../moteur/couches/faux-contexte';
import { CARTON, dessinerCarton, dessinerChibiPleinEcran } from '../../../moteur/inserts/carton';
import { chibiDe } from '../../../moteur/couches/avatars';
import { preparerInserts } from '../../../moteur/inserts/inserts';
import type { ImageSource } from '../../../moteur/canevas';
import { ErreurArko } from '../../../moteur/erreurs';

const dessinerChibi = vi.hoisted(() => vi.fn());
vi.mock('../../../chibis/dessin', () => ({ dessinerChibi, PROPORTIONS_CHIBI: { largeur: 0.8, tete: 0.6 } }));

/** Faux contexte qui note aussi les fonds (fillRect) et accepte les tracés d'arcs du chibi. */
class Contexte extends FauxContexte {
  fonds: { couleur: string; l: number; h: number }[] = [];
  override fillRect(..._a: number[]) {
    this.fonds.push({ couleur: this.fillStyle, l: _a[2]!, h: _a[3]! });
  }
  arc() {}
  ellipse() {}
  lineTo() {}
  rect() {}
  stroke() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
}

const v: Source = {
  id: 's1',
  nom: 'v.mp4',
  taille: 1,
  emp: 'e1',
  duree: 60,
  type: 'video',
  l: 1920,
  h: 1080,
};
const chibi: DefinitionChibi = {
  style: 'feutre',
  graine: 42,
  peau: '#F6C9A0',
  coiffure: 'herisses',
  cheveux: '#1E1A18',
  tenue: 'cowboy',
  accessoire: 'aucun',
  couleur: '#E74C3C',
  yeux: 'points',
};

describe('carton', () => {
  it('fond uni (défaut noir), texte centré en blanc au style accroche', () => {
    const f = new Contexte();
    dessinerCarton(f.ctx, { type: 'carton', txt: 'Plus tard' }, 1080, 1920, 1);
    expect(f.fonds[0]).toEqual({ couleur: CARTON.fond, l: 1080, h: 1920 });
    const textes = f.traces.filter((t) => t.op === 'fillText');
    expect(textes.map((t) => t.txt)).toEqual(['Plus tard']);
    expect(textes[0]!.fillStyle).toBe('#FFFFFF');
    expect(textes[0]!.x).toBeCloseTo(540, 0);
    expect(Math.abs(textes[0]!.y - 960)).toBeLessThan(80);
    expect(f.traces.some((t) => t.op === 'strokeText')).toBe(true); // contour noir du style
  });
  it('couleurs choisies, long texte en plusieurs lignes, échelle (aperçu 540 px)', () => {
    const f = new Contexte();
    dessinerCarton(
      f.ctx,
      {
        type: 'carton',
        txt: 'Trois heures plus tard dans la grotte maudite',
        fond: '#3498DB',
        couleur: '#FFE500',
      },
      540,
      960,
      0.5,
    );
    expect(f.fonds[0]!.couleur).toBe('#3498DB');
    const textes = f.traces.filter((t) => t.op === 'fillText');
    expect(textes.length).toBeGreaterThanOrEqual(2);
    expect(textes.every((t) => t.fillStyle === '#FFE500')).toBe(true);
    expect(textes.every((t) => t.x > 0 && t.x < 540 && t.y > 0 && t.y < 960)).toBe(true);
  });
  it('16:9 : centré', () => {
    const f = new Contexte();
    dessinerCarton(f.ctx, { type: 'carton', txt: 'GG' }, 1920, 1080, 1);
    const t = f.traces.find((x) => x.op === 'fillText')!;
    expect(t.x).toBeCloseTo(960, 0);
  });
});

describe('chibi plein écran', () => {
  it('fond uni, chibi dessiné au centre (62 % de la hauteur), texte en haut', () => {
    const espion = dessinerChibi;
    espion.mockClear();
    const f = new Contexte();
    dessinerChibiPleinEcran(
      f.ctx,
      { type: 'chibi', emo: 'choque', chibi, txt: 'QUOI ?!', fond: '#3498DB' },
      [],
      1080,
      1920,
      1,
    );
    expect(f.fonds[0]!.couleur).toBe('#3498DB');
    expect(espion).toHaveBeenCalledWith(
      expect.anything(),
      chibi,
      { emo: 'choque', bouche: true },
      { x: 540, y: 1920 * 0.92, h: 1920 * 0.62 },
    );
    const t = f.traces.find((x) => x.op === 'fillText')!;
    expect(t.txt).toBe('QUOI ?!');
    expect(t.y).toBeLessThan(1920 * 0.3);
  });
  it('le chibi de la personne ; sans chibi : celui de son avatar ; personne inconnue : un carton (repli)', () => {
    const espion = dessinerChibi;
    espion.mockClear();
    const f = new Contexte();
    dessinerChibiPleinEcran(
      f.ctx,
      { type: 'chibi', emo: 'parle', p: 'p1' },
      [{ id: 'p1', nom: 'Guts', chibi }],
      1080,
      1920,
      1,
    );
    expect(espion.mock.calls[0]![1]).toBe(chibi);
    expect(espion.mock.calls[0]![2]).toEqual({ emo: 'parle', bouche: false });
    const g = new Contexte();
    dessinerChibiPleinEcran(
      g.ctx,
      { type: 'chibi', emo: 'rit', p: 'p2' },
      [{ id: 'p2', nom: 'Romain' }],
      1080,
      1920,
      1,
    );
    // Sans chibi : le chibi par défaut de son avatar (tiré de son id), pas un carton.
    expect(espion).toHaveBeenCalledTimes(2);
    expect(espion.mock.calls[1]![1]).toEqual(chibiDe({ id: 'p2', nom: 'Romain' }));
    const h = new Contexte();
    dessinerChibiPleinEcran(h.ctx, { type: 'chibi', emo: 'rit', p: 'p9' }, [], 1080, 1920, 1);
    expect(h.traces.find((x) => x.op === 'fillText')!.txt).toBe('Perso');
    expect(espion).toHaveBeenCalledTimes(2);
  });
  it("dessin du chibi pas prêt (pas encore fait) : carton avec le nom, jamais d'erreur", () => {
    dessinerChibi.mockImplementationOnce(() => {
      throw new ErreurArko('pas encore fait', 'pas_encore_fait');
    });
    const f = new Contexte();
    expect(() =>
      dessinerChibiPleinEcran(
        f.ctx,
        { type: 'chibi', emo: 'rit', p: 'p1' },
        [{ id: 'p1', nom: 'Guts', chibi }],
        1080,
        1920,
        1,
      ),
    ).not.toThrow();
    expect(f.traces.find((x) => x.op === 'fillText')!.txt).toBe('Guts');
  });
});

describe('crochet preparerInserts', () => {
  const base = (): Recette => normaliserRecette({ plans: [{ de: 0, a: 10 }] }, { sources: [v] });

  it('null sans élément inséré ; un clip inséré reste un plan vidéo', () => {
    expect(preparerInserts(base())).toBeNull();
    const clip = insererElement(
      base(),
      5,
      { type: 'clip' },
      { clip: { source: { ...v, id: 'b1', bib: 'x' }, de: 0, a: 2 } },
    ).recette;
    expect(preparerInserts(clip)).toBeNull();
  });

  it('carton : une image de la taille finale, fabriquée au premier dessin', () => {
    const r = insererElement(base(), 5, { type: 'carton', txt: 'Plus tard' }).recette;
    const sc = compiler(r);
    const ins = preparerInserts(r)!;
    const env = { l: 1080, h: 1920, echelle: 1 };
    expect(ins.image(sc.plans[0]!, env)).toBeNull();
    const img = ins.image(sc.plans[1]!, env)!;
    expect(img).toMatchObject({ largeur: 1080, hauteur: 1920 });
    expect(sc.plans[1]!.mise).toEqual({ type: 'recadre', x: 0.5 }); // plein écran
  });

  it("image fixe : l'image décodée (dessinée en fond flou par la mise en page du plan) ; pas encore ouverte : noire", () => {
    const fiche = { id: '', nom: 'carte.png', emp: 'img1', taille: 2000, l: 800, h: 600 };
    const r = insererElement(base(), 5, { type: 'image', img: '' }, { image: fiche }).recette;
    const sc = compiler(r);
    const decodee: ImageSource = { largeur: 800, hauteur: 600, dessiner: () => undefined };
    const env = { l: 1080, h: 1920, echelle: 1 };
    expect(preparerInserts(r, new Map([['i1', decodee]]))!.image(sc.plans[1]!, env)).toBe(decodee);
    expect(sc.plans[1]!.mise).toEqual({ type: 'flou', y: 0.5 });
    expect(preparerInserts(r)!.image(sc.plans[1]!, env)).toMatchObject({ largeur: 1080, hauteur: 1920 });
  });
});
