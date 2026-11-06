// Couper APRÈS avoir habillé (étape Couper ou outil « Couper » de Habiller : mêmes opérations).
// Ce test fixe ce qui suit les coupes :
// - sons, zooms, sous-titres : attachés au temps SOURCE, ils suivent les images ; si leur passage est
//   supprimé, ils ne sont plus dans la vidéo (mais restent dans la recette : Annuler ou remettre le passage les ramène) ;
// - un son posé en temps de SORTIE (pendant un arrêt sur image) garde son moment s'il est encore dans la vidéo ;
// - textes (et accroche) : attachés au temps de SORTIE, ils gardent leur moment ; un texte qui commencerait
//   après la nouvelle fin est replacé au début par le normaliseur (règle déjà existante) ;
// - transitions : portées par le plan d'entrée, elles partent avec lui.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../sons/catalogue', () => {
  const CATALOGUE = [{ id: 'impact.boom', nom: 'Boom', famille: 'impact', duree: 1.2, licence: 'CC0', version: 1 }];
  return { CATALOGUE, FAMILLES: [], catalogueIds: () => ['impact.boom'], trouverSon: (id: string) => CATALOGUE.find((s) => s.id === id) };
});

import { compiler } from '../chronologie';
import { normaliserRecette } from '../normaliser';
import {
  annuler, bornesDesPlans, dureeFinale, lignesSousTitres, nouvelHistorique, pousser, reperesEffets, retablir, rognerDebut,
  scinder, supprimer,
} from '../operations';
import type { Recette, Source } from '../types';

const v: Source = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video', l: 1920, h: 1080 };

/** Un plan de 10 s, habillé : accroche, 2 textes, 3 sons (2 en temps source, 1 en temps de sortie), 1 zoom, sous-titres. */
const habillee = (): Recette =>
  normaliserRecette(
    {
      plans: [{ de: 0, a: 10 }],
      textes: [
        { txt: 'ACCROCHE', role: 'accroche', t: 0, dur: 2.5 },
        { txt: 'GG', t: 1, dur: 2 },
        { txt: 'Après', t: 8, dur: 1 },
      ],
      sons: [
        { id: 'impact.boom', ts: 3 },
        { id: 'impact.boom', ts: 7 },
        { id: 'impact.boom', t: 1.5 },
      ],
      zooms: [{ ts: 6, dur: 1 }],
      sousTitres: { mots: [['avant', 1, 1.5], ['milieu', 3.2, 3.6], ['fin', 6.5, 7]] },
    },
    { sources: [v] },
  );

/** Scinde à 2 s et 5 s, puis supprime le passage du milieu (source 2 → 5). Durée : 10 → 7 s. */
function couperMilieu(r: Recette): Recette {
  const a = scinder(scinder(r, 2), 5);
  expect(bornesDesPlans(a)).toEqual([0, 2, 5, 10]);
  return supprimer(a, 1);
}

describe('Couper après avoir habillé', () => {
  it('la vidéo raccourcit de la durée du passage supprimé', () => {
    const r = couperMilieu(habillee());
    expect(dureeFinale(r)).toBe(7);
    expect(r.plans).toEqual([{ de: 0, a: 2 }, { de: 5, a: 10 }]);
  });

  it('sons et zooms en temps source : suivent les images, disparaissent avec leur passage', () => {
    const r0 = habillee();
    const r = couperMilieu(r0);
    // Son à ts 3 (passage supprimé) : plus dans la vidéo. Son à ts 7 : passe de 7 s à 4 s. Son à t 1,5 : reste.
    expect(reperesEffets(r0).sons.map((s) => [s.i, s.t])).toEqual([[2, 1.5], [0, 3], [1, 7]]);
    expect(reperesEffets(r).sons.map((s) => [s.i, s.t])).toEqual([[2, 1.5], [1, 4]]);
    // Le zoom à ts 6 passe de 6 s à 3 s.
    expect(reperesEffets(r).zooms.map((z) => z.t)).toEqual([3]);
    // Les éléments restent dans la recette (rien n'est perdu) : remettre le passage les ramène.
    expect(r.sons).toHaveLength(3);
    expect(reperesEffets(rognerDebut(r, 1, 2.5)).sons.map((s) => s.i)).toEqual([2, 0, 1]);
  });

  it('sous-titres : les mots du passage supprimé ne sont plus affichés, les autres suivent', () => {
    const r = couperMilieu(habillee());
    const mots = lignesSousTitres(r).flatMap((l) => l.mots.map((m) => m[0]));
    expect(mots).toEqual(['avant', 'fin']);
    const fin = lignesSousTitres(r).find((l) => l.mots.some((m) => m[0] === 'fin'))!;
    expect(fin.t0).toBeCloseTo(3.5, 2); // 6,5 s source → 3,5 s dans la vidéo
  });

  it('textes : gardent leur moment de la vidéo ; après la nouvelle fin → replacés au début', () => {
    const r = couperMilieu(habillee());
    expect(r.textes.map((x) => [x.txt, x.t])).toEqual([['ACCROCHE', 0], ['GG', 1], ['Après', 0]]);
    // Un texte encore dans la vidéo ne bouge pas, même si son image a changé.
    const r2 = supprimer(scinder(habillee(), 9), 1);
    expect(r2.textes.map((x) => x.t)).toEqual([0, 1, 8]);
  });

  it('transitions : la transition d\'entrée part avec le plan supprimé', () => {
    const r0 = scinder(scinder(habillee(), 2), 5);
    const avec = { ...r0, plans: r0.plans.map((p, i) => (i === 1 ? { ...p, trans: 'flash' } : i === 2 ? { ...p, trans: 'zoom' } : p)) };
    const r = supprimer(normaliserRecette(avec, { sources: [v] }), 1);
    expect(compiler(r).plans.map((p) => p.trans?.type ?? null)).toEqual([null, 'zoom']);
  });

  it('Annuler / Rétablir : la recette habillée revient entière', () => {
    const r0 = habillee();
    let h = nouvelHistorique(r0);
    h = pousser(h, scinder(h.present, 2));
    h = pousser(h, scinder(h.present, 5));
    h = pousser(h, supprimer(h.present, 1));
    expect(dureeFinale(h.present)).toBe(7);
    h = annuler(annuler(annuler(h)));
    expect(h.present).toBe(r0);
    h = retablir(retablir(retablir(h)));
    expect(dureeFinale(h.present)).toBe(7);
    expect(reperesEffets(h.present).sons).toHaveLength(2);
  });
});
