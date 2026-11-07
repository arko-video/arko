// « Rythme des coupes » passe par une opération de la recette (intégrateur, relecture point 17) : même résultat que
// le calcul de dev-coupes, même niveau = même recette, un seul Annuler. Données fabriquées.

import { describe, expect, it } from 'vitest';
import { energieFabriquee, entree, vadFabriquee } from '../auto/coupes/coupes-test';
import { couperV4 } from '../auto/coupes/coupes-v4';
import { recouperMontage } from '../auto/coupes/recouper';
import type { MesuresGardees } from '../auto/types-v4';
import { paroleDepuisProbas } from '../auto/vad/segments';
import { normaliser } from './normaliser';
import { annuler, couperLesBlancs, nouvelHistorique, pousser, recouperLeMontage } from './operations';
import type { Mot, Recette } from './types';

const DUREE = 300;
const s1 = { id: 's1', nom: 'live.mp4', taille: 1, emp: 'e1', duree: DUREE, type: 'video' as const, l: 1280, h: 720 };
const phrases: [number, number][] = [];
for (let t = 12; t < 80; t += 4.6) phrases.push([t, t + 2.2]);
const mots: Mot[] = phrases.map(([de, a]) => ['mot', de + 0.05, a - 0.05]);
const vad = vadFabriquee(DUREE, phrases.map(([de, a]) => [de, a, 0.9]));
const energie = energieFabriquee(DUREE, -60, phrases.map(([de, a]) => [de, a, -28]));
const mesures: MesuresGardees = { v: 1, vad: { pas: vad.pas, p: vad.p, plages: vad.plages, modele: vad.modele }, energie, hauteur: null };

function bestOf(): Recette {
  const r = normaliser({ format: 'arko.recette/1', sources: [s1], plans: [{ de: 10, a: 85 }], sousTitres: { mots } }, { sources: [s1] }).recette;
  return couperLesBlancs(r, couperV4(entree({ mots, parole: paroleDepuisProbas(vad, DUREE), energie, niveau: 'normal' })), 'normal');
}

describe('opération « Rythme des coupes »', () => {
  it('= le calcul de dev-coupes ; même niveau = même recette ; un seul Annuler', () => {
    const r = bestOf();
    const serre = recouperLeMontage(r, { mesures, mots }, 'serre');
    expect(serre).toEqual(recouperMontage(r, { mesures, mots }, 'serre'));
    expect(serre.blancs?.niveau).toBe('serre');
    expect(recouperLeMontage(r, { mesures, mots }, 'normal')).toBe(r);
    const h = pousser(nouvelHistorique(r), serre);
    expect(annuler(h).present).toBe(r);
  });
});
