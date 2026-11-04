import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliserRecette } from '../../recette/normaliser';
import { lignesSousTitres } from '../../recette/operations';
import type { Mot, Recette } from '../../recette/types';
import type { Env } from '../canevas';
import { etatImage } from '../etat-image';
import { FauxContexte, textesEcrits } from './faux-contexte';
import { dessinerSousTitres } from './sous-titres';
import { CITRON } from './styles-texte';

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 30, type: 'video' as const, l: 1920, h: 1080 };
const EXPORT: Env = { l: 1080, h: 1920, echelle: 1 };
const MOTS: Mot[] = [['attends', 1, 1.4], ['il', 1.4, 1.6], ['arrive', 1.6, 2], ['NON', 2.1, 2.5, 1], ['mdr', 2.5, 2.9]];

const recette = (style: string, mots: Mot[] = MOTS): Recette =>
  normaliserRecette({ plans: [{ de: 0, a: 10 }], sousTitres: { style, parLigne: 3, mots } }, { sources: [v] });

function dessiner(r: Recette, t: number, env: Env = EXPORT): FauxContexte {
  const f = new FauxContexte();
  dessinerSousTitres(f.ctx, etatImage(compiler(r), t)!.sousTitres, env);
  return f;
}

describe('les 3 styles de sous-titres', () => {
  it('karaoké : blanc avec contour, mot en cours en citron × 1,1', () => {
    const f = dessiner(recette('karaoke'), 1.5); // « il » est en cours
    const ecrits = textesEcrits(f);
    expect(ecrits.map((t) => t.txt).sort()).toEqual(['arrive', 'attends', 'il']);
    const il = ecrits.find((t) => t.txt === 'il')!;
    expect(il.fillStyle).toBe(CITRON);
    expect(il.echelle).toBeCloseTo(1.1);
    const autre = ecrits.find((t) => t.txt === 'attends')!;
    expect(autre.fillStyle).toBe('#FFFFFF');
    expect(autre.echelle).toBeCloseTo(1);
    expect(f.traces.filter((t) => t.op === 'strokeText')).toHaveLength(3);
    expect(f.traces.find((t) => t.op === 'strokeText')!.strokeStyle).toBe('#000000');
  });
  it('pop : un seul mot à la fois, en gros', () => {
    const ecrits = textesEcrits(dessiner(recette('pop'), 1.7));
    expect(ecrits.map((t) => t.txt)).toEqual(['ARRIVE']);
    expect(ecrits[0]!.font).toContain('112px');
  });
  it('boîte : fond noir à 80 %, texte blanc', () => {
    const f = dessiner(recette('boite'), 1.1);
    expect(f.traces[0]).toMatchObject({ op: 'fill', fillStyle: 'rgba(0, 0, 0, 0.8)' });
    expect(f.traces.filter((t) => t.op === 'strokeText')).toEqual([]);
    expect(textesEcrits(f).every((t) => t.fillStyle === '#FFFFFF')).toBe(true);
  });
  it('mots forts en citron, un peu plus gros', () => {
    const ecrits = textesEcrits(dessiner(recette('boite'), 2.7)); // ligne « NON mdr », « mdr » en cours
    const non = ecrits.find((t) => t.txt === 'NON')!;
    expect(non.fillStyle).toBe(CITRON);
    expect(non.font).toContain('64.8px'); // 60 × 1,08
    expect(ecrits.find((t) => t.txt === 'mdr')!.font).toContain('60px');
  });
  it('y : centre du bloc à y × hauteur', () => {
    const r = normaliserRecette({ plans: [{ de: 0, a: 10 }], sousTitres: { y: 0.5, mots: MOTS } }, { sources: [v] });
    const ecrits = textesEcrits(dessiner(r, 1.1));
    for (const t of ecrits) expect(Math.abs(t.y - 960)).toBeLessThan(60);
  });
});

describe('lignes = dessin', () => {
  it('chaque ligne de lignesSousTitres est celle dessinée pendant sa durée', () => {
    const r = recette('karaoke', [...MOTS, ['bien', 4, 4.3], ['joué', 4.3, 4.6]]);
    const lignes = lignesSousTitres(r);
    expect(lignes.map((l) => l.mots.map((m) => m[0]).join(' '))).toEqual(['attends il arrive', 'NON mdr', 'bien joué']);
    for (const l of lignes) {
      const ecrits = textesEcrits(dessiner(r, (l.t0 + l.t1) / 2));
      expect(ecrits.map((t) => t.txt).sort()).toEqual(l.mots.map((m) => m[0]).sort());
    }
    // Entre deux lignes séparées par un trou, rien n'est affiché.
    expect(textesEcrits(dessiner(r, 3.5))).toEqual([]);
  });
  it('mêmes positions dans l\'aperçu et dans l\'export', () => {
    const r = recette('karaoke');
    const a = textesEcrits(dessiner(r, 1.5, { l: 540, h: 960, echelle: 0.5 }));
    const e = textesEcrits(dessiner(r, 1.5));
    a.forEach((t, k) => {
      expect(t.x * 2).toBeCloseTo(e[k]!.x, 6);
      expect(t.y * 2).toBeCloseTo(e[k]!.y, 6);
    });
  });
});
