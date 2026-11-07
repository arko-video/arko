// B. « Insérer ici » (dev 2) : point d'insertion, insertion et décalage (ripple) de chaque genre de champ.
import { describe, expect, it } from 'vitest';
import { compiler } from '../../../recette/chronologie';
import { normaliserRecette } from '../../../recette/normaliser';
import { dureeFinale, estElementInsere, insererElement } from '../../../recette/operations';
import type { ElementInsere } from '../../../recette/types';
import { pointInsertion } from '../point';
import { b1, base, carton, v } from './donnees-insertion';

describe('pointInsertion', () => {
  const r = base();
  it("au milieu d'un plan : coupe", () =>
    expect(pointInsertion(r, 5)).toEqual({ i: 1, t: 5, coupe: true, ts: 5 }));
  it("à moins de 0,15 s d'une coupe : calé dessus", () => {
    expect(pointInsertion(r, 10.1)).toEqual({ i: 1, t: 10, coupe: false });
    expect(pointInsertion(r, 0.1)).toEqual({ i: 0, t: 0, coupe: false });
    expect(pointInsertion(r, 19.9)).toEqual({ i: 2, t: 20, coupe: false });
    expect(pointInsertion(r, 10.2).coupe).toBe(true);
  });
  it('dans un arrêt sur image ou dans un élément inséré : la coupe la plus proche', () => {
    const fige = normaliserRecette(
      {
        plans: [
          { de: 0, a: 10, fige: 2 },
          { de: 20, a: 30 },
        ],
      },
      { sources: [v] },
    );
    expect(pointInsertion(fige, 10.5)).toEqual({ i: 1, t: 12, coupe: false }); // arrêt de 10 à 12 s
    expect(pointInsertion(fige, 9.95)).toEqual({ i: 1, t: 12, coupe: false }); // bord du plan (< 0,10 s)
    const avec = insererElement(base(), 5, carton, { dur: 2 }).recette; // carton de 5 à 7
    expect(pointInsertion(avec, 6.2)).toEqual({ i: 2, t: 7, coupe: false });
  });
  it('vitesse : la coupe tombe sur le temps source arrondi', () => {
    const lent = normaliserRecette({ plans: [{ de: 0, a: 10, vit: 0.5 }] }, { sources: [v] });
    expect(pointInsertion(lent, 5)).toEqual({ i: 1, t: 5, coupe: true, ts: 2.5 });
  });
});

describe('insererElement', () => {
  it('scinde le plan, place le carton entre les deux parties, un seul changement', () => {
    const r = base();
    const { recette, i } = insererElement(r, 5, carton, { dur: 2 });
    expect(i).toBe(1);
    expect(recette.plans.map((p) => [p.src ?? '', p.de, p.a])).toEqual([
      ['', 0, 5],
      ['', 0, 2],
      ['', 5, 10],
      ['', 20, 30],
    ]);
    expect(recette.plans[1]!.ins).toEqual({ type: 'carton', txt: 'Plus tard…' });
    expect(recette.plans[1]!.mise).toEqual({ type: 'recadre', x: 0.5 });
    expect(dureeFinale(recette)).toBe(22);
    expect(estElementInsere(recette, 1)).toBe(true);
    expect(estElementInsere(recette, 0)).toBe(false);
  });

  it('décale tout ce qui est en temps de sortie à partir du point (textes, sons et zooms en t, incrustations, chapitres, musique)', () => {
    const r = insererElement(base(), 5, carton, { dur: 2 }).recette;
    expect(r.textes.map((x) => x.t)).toEqual([1, 8, 17]); // « Avant » commencé avant le point garde son début
    expect(
      r.sons
        .filter((s) => s.t !== undefined)
        .map((s) => s.t)
        .sort((a, b) => a! - b!),
    ).toEqual([2, 9]);
    expect(r.zooms.find((z) => z.t !== undefined)!.t).toBe(10);
    expect(r.incrustations![0]!.t).toBe(11);
    expect(r.chapitres!.map((c) => c.t)).toEqual([0, 8, 14]); // 0:00 reste à 0:00
    expect(r.musique!.morceaux[0]).toMatchObject({ t: 0, fin: 20 });
    expect(r.guide).toEqual(base().guide); // le son guide ne bouge pas
  });

  it('temps source intacts : sons et zooms en ts, sous-titres suivent tout seuls (décalés à la sortie)', () => {
    const r0 = base();
    const r = insererElement(r0, 5, carton, { dur: 2 }).recette;
    expect(r.sons.find((s) => s.ts !== undefined)).toEqual(r0.sons.find((s) => s.ts !== undefined));
    expect(r.zooms.find((z) => z.ts !== undefined)).toEqual(r0.zooms.find((z) => z.ts !== undefined));
    expect(r.sousTitres).toEqual(r0.sousTitres);
    const avant = compiler(r0);
    const apres = compiler(r);
    expect(apres.sons.find((p) => p.element.ts === 25)!.t).toBeCloseTo(
      avant.sons.find((p) => p.element.ts === 25)!.t + 2,
      6,
    );
    const mots = (sc: typeof avant) => sc.sousTitres!.lignes.flatMap((l) => l.mots.map((m) => m.t0));
    expect(mots(apres)).toEqual([4, 13, 18]); // « salut » avant le point ; « ça », « va » + 2 s
    expect(mots(avant)).toEqual([4, 11, 16]);
    // Rien ne s'attache au carton (plan sans source).
    expect(apres.plans[1]!.src).toBe('');
  });

  it('image fixe : fiche ajoutée avec un id, fond flou ; même fichier réutilisé', () => {
    const fiche = { id: '', nom: 'carte.png', emp: 'img1', taille: 2000, l: 800, h: 600 };
    const { recette, i } = insererElement(base(), 5, { type: 'image', img: '' }, { image: fiche });
    expect(recette.images).toEqual([{ ...fiche, id: 'i1' }]);
    expect(recette.plans[i]).toMatchObject({
      de: 0,
      a: 2,
      ins: { type: 'image', img: 'i1' },
      mise: { type: 'flou', y: 0.5 },
    });
    const deux = insererElement(recette, 15, { type: 'image', img: '' }, { image: fiche, dur: 4 }).recette;
    expect(deux.images).toHaveLength(1);
    expect(dureeFinale(deux)).toBe(26);
    expect(insererElement(base(), 5, { type: 'image', img: 'zz' }).i).toBe(-1); // image inconnue
  });

  it('clip : source ajoutée, plan vidéo marqué, son du clip, fond flou ; bornes du clip respectées', () => {
    const { recette, i } = insererElement(
      base(),
      10,
      { type: 'clip' },
      { clip: { source: b1, de: 1, a: 9 } },
    );
    expect(i).toBe(1);
    expect(recette.plans[1]).toEqual({
      src: 'b1',
      de: 1,
      a: 6,
      mise: { type: 'flou', y: 0.5 },
      ins: { type: 'clip' },
    });
    expect(recette.plans[2]!.trans).toBe('flash'); // la transition reste à l'entrée du plan suivant
    expect(recette.textes.map((x) => x.t)).toEqual([1, 6, 20]);
    expect(insererElement(base(), 10, { type: 'clip' }).i).toBe(-1); // clip sans source
  });

  it('chibi plein écran : 1,5 s par défaut ; durée bornée 0,3 à 30 s', () => {
    const chibi: ElementInsere = { type: 'chibi', emo: 'choque', txt: 'QUOI ?!' };
    expect(dureeFinale(insererElement(base(), 5, chibi).recette)).toBe(21.5);
    expect(dureeFinale(insererElement(base(), 5, carton, { dur: 99 }).recette)).toBe(50);
    expect(dureeFinale(insererElement(base(), 5, carton, { dur: 0.1 }).recette)).toBe(20.3);
  });

  it('au tout début et à la toute fin', () => {
    const debut = insererElement(base(), 0, carton, { dur: 2 }).recette;
    expect(debut.plans[0]!.ins?.type).toBe('carton');
    expect(debut.plans[0]!.trans).toBeUndefined();
    expect(debut.chapitres!.map((c) => c.t)).toEqual([0, 8, 14]);
    const fin = insererElement(base(), 20, carton, { dur: 2 }).recette;
    expect(fin.plans.at(-1)!.ins?.type).toBe('carton');
    expect(fin.musique!.morceaux[0]!.fin).toBe(18);
  });
});
