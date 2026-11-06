// Punchlines calées sur les mots (retour de Romain, 6/11/2026, sur le vrai montage : certaines arrivaient trop tôt
// ou trop tard et duraient trop longtemps). Règle : début = début du 1er mot (jamais avant), fin = fin du dernier
// mot + 0,2 s, 2,5 s au plus à l'écran (une phrase plus longue est coupée en deux lignes).

import { describe, expect, it } from 'vitest';
import { trouverPunchlines } from '../auto/habillage/punchlines';
import { compiler } from './chronologie';
import { normaliser } from './normaliser';
import { choisirModeSousTitres, definirPunchlines } from './operations';
import { TENUE_PUNCHLINE } from './sous-titres-places';
import type { Mot, Recette } from './types';

function recette(mots: Mot[], plans = [{ de: 0, a: 60 }]): Recette {
  const r = normaliser({
    format: 'arko.recette/1',
    destination: 'youtube',
    sources: [{ id: 's1', nom: 'v.mp4', taille: 1, emp: 'e', duree: 60, type: 'video', l: 1920, h: 1080 }],
    plans,
    sousTitres: { mots },
  }).recette;
  return choisirModeSousTitres(definirPunchlines(r, trouverPunchlines(mots, null)), 'punchlines');
}

describe('punchlines calées sur les mots', () => {
  it('début = début du 1er mot, fin = fin du dernier + 0,2 s', () => {
    const mots: Mot[] = [['bon', 1, 1.3], ['on', 1.4, 1.6], ['y', 1.7, 1.8], ['va.', 1.9, 2.2], ['gg', 10, 10.3, 1], ['les', 10.4, 10.6], ['gars', 10.7, 11.1]];
    const [l] = compiler(recette(mots)).sousTitres!.lignes;
    expect(l!.t0).toBeCloseTo(10, 5);
    expect(l!.t1).toBeCloseTo(11.3, 5);
    expect(TENUE_PUNCHLINE).toEqual({ apres: 0.2, max: 2.5 });
  });

  it('jamais affichée avant que la phrase commence, même après une coupe ou une accroche', () => {
    const mots: Mot[] = [['non!', 20, 20.4]];
    const sc = compiler(recette(mots, [{ de: 0, a: 5 }, { de: 19, a: 25 }]));
    const [l] = sc.sousTitres!.lignes;
    expect(l!.t0).toBeCloseTo(5 + 1, 5); // 1 s après le début du 2ᵉ plan, là où le mot commence
    expect(l!.t1 - l!.t0).toBeCloseTo(0.6, 5);
  });

  it('2,5 s au plus : une phrase plus longue est coupée en deux lignes', () => {
    // 6 mots sur 3,5 s, « ! » à la fin : une punchline (≤ 7 mots), trop longue à l'écran.
    const mots: Mot[] = [['attends', 30, 30.5], ['attends', 30.6, 31.1], ['il', 31.2, 31.5], ['arrive', 31.6, 32.2], ['derrière', 32.4, 33], ['toi!', 33.1, 33.5]];
    const lignes = compiler(recette(mots)).sousTitres!.lignes;
    expect(lignes.length).toBe(2);
    for (const l of lignes) {
      expect(l.t1 - l.t0).toBeLessThanOrEqual(TENUE_PUNCHLINE.max + 1e-9);
      expect(l.t0).toBeCloseTo(l.mots[0]!.t0, 5);
      expect(l.t1).toBeCloseTo(Math.min(l.mots[l.mots.length - 1]!.t1 + 0.2, l.t0 + 2.5), 5);
    }
    expect(lignes[1]!.t0).toBeGreaterThanOrEqual(lignes[0]!.t1 - 1e-9);
    expect(lignes.flatMap((l) => l.mots.map((m) => m.mot[0]))).toEqual(mots.map((m) => m[0]));
  });

  it('ne chevauche jamais la punchline suivante', () => {
    const mots: Mot[] = [['non!', 5, 5.4], ['gg!', 5.5, 5.8]];
    const [a, b] = compiler(recette(mots)).sousTitres!.lignes;
    expect(a!.t1).toBeLessThanOrEqual(b!.t0 + 1e-9);
  });
});
