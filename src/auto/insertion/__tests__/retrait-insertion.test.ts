// B. « Insérer ici » (dev 2) : retirer (aller-retour exact), déplacer, modifier ; E : opérations pistes et bips.
import { describe, expect, it } from 'vitest';
import {
  bornesDesPlans,
  choisirBips,
  choisirPistes,
  decalerApres,
  deplacerElement,
  insererElement,
  modifierElement,
  supprimer,
  supprimerElement,
} from '../../../recette/operations';
import type { ElementInsere, Recette } from '../../../recette/types';
import { b1, base, carton } from './donnees-insertion';

describe('retirer, déplacer, modifier', () => {
  const nettoye = (r: Recette) => JSON.parse(JSON.stringify(r));

  it("insérer puis retirer redonne EXACTEMENT la recette d'origine (carton, image, clip, chibi, début, fin)", () => {
    const fiche = { id: '', nom: 'carte.png', emp: 'img1', taille: 2000, l: 800, h: 600 };
    const cas: [number, ElementInsere, object][] = [
      [5, carton, { dur: 2 }],
      [5.37, { type: 'image', img: '' }, { image: fiche }],
      [10, { type: 'clip' }, { clip: { source: { ...b1, id: 'b2', bib: 'v9' }, de: 0, a: 3 } }],
      [12.5, { type: 'chibi', emo: 'rit' }, {}],
      [0, carton, {}],
      [20, carton, { dur: 30 }],
      [3.333, carton, { dur: 0.7 }],
    ];
    for (const [t, el, d] of cas) {
      const r0 = base();
      const { recette, i } = insererElement(r0, t, el, d);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(nettoye(supprimerElement(recette, i))).toEqual(nettoye(r0));
    }
  });

  it("retirer : seulement un élément inséré ; le clip et l'image inutilisés partent", () => {
    const r = base();
    expect(supprimerElement(r, 0)).toBe(r);
    const avecClip = insererElement(
      r,
      10,
      { type: 'clip' },
      { clip: { source: { ...b1, id: 'b2', bib: 'v9' }, de: 0, a: 3 } },
    ).recette;
    expect(avecClip.sources.map((s) => s.id)).toContain('b2');
    expect(supprimerElement(avecClip, 1).sources.map((s) => s.id)).not.toContain('b2');
  });

  it("« Supprimer » ordinaire d'un élément = supprimer le plan (sans décalage) ; supprimerElement recolle", () => {
    const r = insererElement(base(), 5, carton, { dur: 2 }).recette;
    expect(supprimer(r, 1).plans).toHaveLength(3);
    expect(supprimerElement(r, 1).plans).toHaveLength(2);
  });

  it('déplacer : retiré puis reposé à la tête (temps de la recette actuelle), un seul changement', () => {
    const r = insererElement(base(), 5, carton, { dur: 2 }).recette; // carton [5 ; 7], « Fin » à 17
    const { recette, i } = deplacerElement(r, 1, 17); // 17 s actuel = 15 s sans le carton
    expect(i).toBe(2); // le 1er plan est recollé : [0 ; 10], [20 ; 25], carton, [25 ; 30]
    expect(bornesDesPlans(recette)).toEqual([0, 10, 15, 17, 22]);
    expect(recette.textes.map((x) => x.t)).toEqual([1, 6, 17]); // « Fin » (15 s sans le carton) décalé de 2 s
    expect(recette.plans[2]!.ins).toEqual(carton);
    expect(deplacerElement(r, 1, 6).recette).toBe(r); // dans l'élément lui-même : rien
    expect(deplacerElement(r, 0, 12).i).toBe(-1); // pas un élément inséré
  });

  it("modifier : contenu et durée (la suite est décalée d'autant, dans les deux sens)", () => {
    const r = insererElement(base(), 5, carton, { dur: 2 }).recette;
    const plusLong = modifierElement(r, 1, { txt: 'Bien plus tard', fond: '#3498DB' }, 4);
    expect(plusLong.plans[1]).toMatchObject({
      de: 0,
      a: 4,
      ins: { type: 'carton', txt: 'Bien plus tard', fond: '#3498DB' },
    });
    expect(plusLong.textes.map((x) => x.t)).toEqual([1, 10, 19]);
    expect(plusLong.chapitres!.map((c) => c.t)).toEqual([0, 10, 16]);
    const retour = modifierElement(plusLong, 1, { txt: 'Plus tard…', fond: undefined }, 2);
    expect(nettoye(retour)).toEqual(nettoye(r));
    expect(modifierElement(r, 0, { txt: 'x' })).toBe(r);
  });

  it("decalerApres seul : ± d, le trou d'un retrait ramène au point", () => {
    const r = base();
    expect(decalerApres(r, 5, 0)).toBe(r);
    const plus = decalerApres(r, 5, 3);
    expect(plus.textes.map((x) => x.t)).toEqual([1, 9, 18]);
    const moins = decalerApres(r, 8, -3); // trou [5 ; 8[ : le texte de 6 s revient à 5 s
    expect(moins.textes.map((x) => x.t)).toEqual([1, 5, 12]);
  });
});

describe('pistes et bips (opérations)', () => {
  it('choisirPistes : un réglage par vidéo ; null le retire', () => {
    const r = base();
    const deux = choisirPistes(r, 's1', [
      { n: 0, nom: 'Micro' },
      { n: 1, vol: 0.8, nom: 'Discord' },
    ]);
    expect(deux.pistesAudio).toEqual([
      {
        src: 's1',
        pistes: [
          { n: 0, nom: 'Micro' },
          { n: 1, vol: 0.8, nom: 'Discord' },
        ],
      },
    ]);
    expect(choisirPistes(deux, 's1', [{ n: 1 }]).pistesAudio).toEqual([{ src: 's1', pistes: [{ n: 1 }] }]);
    expect(choisirPistes(deux, 's1', null).pistesAudio).toBeUndefined();
    expect(choisirPistes(r, 'zz', [{ n: 0 }])).toBe(r);
    expect(choisirPistes(r, 's1', [{ n: 5 }]).pistesAudio).toBeUndefined(); // piste 6 sur 2 : retirée
  });
  it('choisirBips : bip / muet / rien', () => {
    const r = base();
    expect(choisirBips(r, { son: 'muet' }).bips).toEqual({ son: 'muet' });
    expect(choisirBips(choisirBips(r, { son: 'bip' }), null).bips).toBeUndefined();
    expect(choisirBips(r, null)).toBe(r);
  });
});
