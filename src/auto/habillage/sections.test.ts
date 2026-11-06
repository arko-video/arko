// G. Titres de section : un titre par chapitre, remplacement sans doublon, retrait complet, accroche respectée.

import { describe, expect, it } from 'vitest';
import { normaliser, normaliserRecette } from '../../recette/normaliser';
import { ajouterTitreDeSection, compterTitresDeSection, retirerTitresDeSection, titresDeSection } from '../../recette/operations';
import type { Recette } from '../../recette/types';
import { finAccroche, SON_SECTION, titresDesChapitres } from './sections';

const s1 = { id: 's1', nom: 'v.mp4', taille: 1, emp: 'e', duree: 300, type: 'video' as const, l: 1920, h: 1080 };

function base(o: object = {}): Recette {
  return normaliserRecette(
    {
      destination: 'youtube',
      plans: [{ de: 0, a: 120 }],
      chapitres: [{ t: 0, nom: 'Intro' }, { t: 40, nom: 'Le château' }, { t: 80, nom: 'La fin  ' }, { t: 100, nom: '  ' }],
      textes: [{ txt: 'GG', t: 50, dur: 3 }],
      sons: [{ id: 'impact.boom', ts: 10 }],
      ...o,
    },
    { sources: [s1] },
  );
}

const sections = (r: Recette) => r.textes.filter((x) => x.role === 'section');

describe('titres des chapitres', () => {
  it('un titre par chapitre nommé, triés', () => {
    expect(titresDesChapitres(base())).toEqual([{ t: 0, nom: 'Intro' }, { t: 40, nom: 'Le château' }, { t: 80, nom: 'La fin' }]);
  });

  it('un texte « bandeau » de 2,2 s + un whoosh par section ; celle de 0:00 est sautée (accroche)', () => {
    const r = titresDeSection(base(), { source: 'chapitres' });
    expect(sections(r)).toEqual([
      { txt: 'Le château', role: 'section', style: 'bandeau', t: 40, dur: 2.2, x: 0.5, y: 0.2 },
      { txt: 'La fin', role: 'section', style: 'bandeau', t: 80, dur: 2.2, x: 0.5, y: 0.2 },
    ]);
    expect(r.sons.filter((s) => s.role === 'section')).toEqual([
      { id: SON_SECTION, t: 40, role: 'section', vol: 0.7 },
      { id: SON_SECTION, t: 80, role: 'section', vol: 0.7 },
    ]);
    expect(r.sections).toEqual({ source: 'chapitres', son: true, dur: 2.2 });
    expect(r.textes[0]).toMatchObject({ txt: 'GG' }); // le reste ne bouge pas
    expect(r.sons[0]).toMatchObject({ id: 'impact.boom' });
  });

  it('remplace les anciens titres, sans doublon ; sans whoosh si demandé ; durée réglable', () => {
    const une = titresDeSection(base(), { source: 'chapitres' });
    const deux = titresDeSection(une, { source: 'chapitres' });
    expect(deux).toBe(une); // rien de changé
    const sansSon = titresDeSection(une, { source: 'chapitres', son: false, dur: 3 });
    expect(sections(sansSon)).toHaveLength(2);
    expect(sections(sansSon).every((x) => x.dur === 3)).toBe(true);
    expect(sansSon.sons.filter((s) => s.role === 'section')).toEqual([]);
  });

  it('accroche respectée : rien entre 0 et la fin de l\'accroche (2,5 s, ou plus si elle dure plus)', () => {
    const r = base({ chapitres: [{ t: 0, nom: 'A' }, { t: 2, nom: 'B' }, { t: 3, nom: 'C' }, { t: 20, nom: 'D' }] });
    expect(sections(titresDeSection(r, { source: 'chapitres' })).map((x) => x.txt)).toEqual(['C', 'D']);
    const longue = base({ chapitres: [{ t: 0, nom: 'A' }, { t: 3, nom: 'C' }, { t: 20, nom: 'D' }], textes: [{ txt: 'Attends…', role: 'accroche', t: 0, dur: 4 }] });
    expect(finAccroche(longue)).toBe(4);
    expect(sections(titresDeSection(longue, { source: 'chapitres' })).map((x) => x.txt)).toEqual(['D']);
  });

  it('retrait complet : textes, sons et réglage', () => {
    const r = retirerTitresDeSection(titresDeSection(base(), { source: 'chapitres' }));
    expect(r).toEqual(base());
    expect(r).not.toHaveProperty('sections');
    expect(retirerTitresDeSection(r)).toBe(r);
  });

  it('le normaliseur garde tout (idempotent)', () => {
    const r = titresDeSection(base(), { source: 'chapitres' });
    expect(normaliser(JSON.parse(JSON.stringify(r)), { sources: r.sources }).recette).toEqual(r);
  });
});

describe('titre posé à la main', () => {
  it('à la tête de lecture, avec whoosh ; réglage « main »', () => {
    const { recette: r, i } = ajouterTitreDeSection(base({ chapitres: [] }), 12.345, 'Le boss');
    expect(r.textes[i]).toEqual({ txt: 'Le boss', role: 'section', style: 'bandeau', t: 12.35, dur: 2.2, x: 0.5, y: 0.2 });
    expect(r.sons.at(-1)).toEqual({ id: SON_SECTION, t: 12.35, role: 'section', vol: 0.7 });
    expect(r.sections).toEqual({ source: 'main' });
    expect(compterTitresDeSection(r)).toBe(1);
    expect(ajouterTitreDeSection(r, 5, '   ')).toEqual({ recette: r, i: -1 });
  });
  it('source « main » : les titres posés à la main sont gardés, réglages appliqués', () => {
    const { recette: r } = ajouterTitreDeSection(base({ chapitres: [] }), 30, 'Partie 2');
    const regle = titresDeSection(r, { source: 'main', son: false });
    expect(sections(regle).map((x) => [x.txt, x.t])).toEqual([['Partie 2', 30]]);
    expect(regle.sons.some((s) => s.role === 'section')).toBe(false);
  });
});
