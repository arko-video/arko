// C. Opérations « Qui parle » (dev 1) : définir, garder chibi et place, renommer, corriger une phrase, retirer.
import { describe, expect, it } from 'vitest';
import type { VoixDetectees } from '../auto/types-v3';
import { annuler, nouvelHistorique, pousser } from './historique';
import { normaliser } from './normaliser';
import { attribuerPhrase, definirQuiParle, personneSuivante, renommerPersonne, retirerQuiParle } from './operations-voix';
import type { DefinitionChibi, Recette, Source } from './types';

const s1: Source = { id: 's1', nom: 'live.mp4', taille: 1e9, emp: 'e1', duree: 3600, type: 'video', l: 1920, h: 1080 };
const base = (): Recette => normaliser({ format: 'arko.recette/1', sources: [s1], plans: [{ de: 0, a: 60 }] }, { sources: [s1] }).recette;
const d: VoixDetectees = {
  src: 's1',
  methode: 'niveau+timbre',
  voix: [{ id: 'p1', niveauDb: -40.04, part: 0.4 }, { id: 'p2', niveauDb: -25, part: 0.6 }],
  tours: [{ ts: 1, fin: 4, p: 'p1' }, { ts: 4.2, fin: 9, p: 'p2', sur: false }, { ts: 10, fin: 14, p: 'p1' }],
  sure: 0.9,
};
const chibi: DefinitionChibi = { style: 'feutre', graine: 42, peau: '#F2C9A0', coiffure: 'courts', cheveux: '#3B2A1A', tenue: 'sweat', accessoire: 'aucun', couleur: '#4060C0' };

describe('definirQuiParle', () => {
  it('écrit personnes (noms, couleurs, niveau) et tours (temps source, incertains gardés)', () => {
    const r = definirQuiParle(base(), d, { noms: { p1: 'Romain' } });
    expect(r.personnes).toEqual([
      expect.objectContaining({ id: 'p1', nom: 'Romain', niveauDb: -40 }),
      expect.objectContaining({ id: 'p2', nom: 'Voix 2', niveauDb: -25 }),
    ]);
    expect(r.personnes![0]!.couleur).not.toBe(r.personnes![1]!.couleur);
    expect(r.paroles!.map((t) => [t.ts, t.fin, t.p, t.sur])).toEqual([[1, 4, 'p1', undefined], [4.2, 9, 'p2', false], [10, 14, 'p1', undefined]]);
    expect(r.paroles![0]!.src).toBeUndefined(); // la 1re vidéo : pas besoin de la nommer
  });

  it('garde le chibi, la place, l\'avatar et le nom d\'une personne qui garde le même id', () => {
    const avant = normaliser({ ...base(), personnes: [{ id: 'p1', nom: 'Guts', chibi, place: { x: 0.1, y: 0.9, taille: 0.3 }, avatar: false }] }, { sources: [s1] }).recette;
    const r = definirQuiParle(avant, d);
    expect(r.personnes![0]).toMatchObject({ id: 'p1', nom: 'Guts', chibi, place: { x: 0.1, y: 0.9, taille: 0.3 }, avatar: false });
  });

  it('pistes séparées : chaque personne garde sa piste', () => {
    const r = definirQuiParle(base(), { ...d, methode: 'pistes', voix: [{ id: 'p1', niveauDb: -40, part: 0.5, piste: 0 }, { id: 'p2', niveauDb: -25, part: 0.5, piste: 1 }] });
    expect(r.personnes!.map((p) => p.piste)).toEqual([0, 1]);
  });

  it('aucune voix : tout est retiré ; un seul Annuler revient en arrière', () => {
    const r0 = base();
    const r = definirQuiParle(r0, d);
    expect(definirQuiParle(r, { ...d, voix: [], tours: [] }).personnes).toBeUndefined();
    let h = nouvelHistorique(r0);
    h = pousser(h, r);
    expect(annuler(h).present).toBe(r0);
  });
});

describe('corriger qui parle', () => {
  const r = definirQuiParle(base(), d);

  it('renommerPersonne', () => {
    expect(renommerPersonne(r, 'p2', '  Guts ').personnes![1]!.nom).toBe('Guts');
    expect(renommerPersonne(r, 'p9', 'X')).toBe(r);
    expect(renommerPersonne(r, 'p1', '   ')).toBe(r);
  });

  it('attribuerPhrase : les tours sont découpés aux bords de la phrase', () => {
    const a = attribuerPhrase(r, 3, 6, 'p1');
    expect(a.paroles!.map((t) => [t.ts, t.fin, t.p])).toEqual([[1, 3, 'p1'], [3, 6, 'p1'], [6, 9, 'p2'], [10, 14, 'p1']]);
  });

  it('personneSuivante : p2 → p1 → p2 d\'un toucher', () => {
    const a = personneSuivante(r, 5, 8);
    expect(a.paroles!.find((t) => t.ts === 5)!.p).toBe('p1');
    const b = personneSuivante(a, 5, 8);
    expect(b.paroles!.find((t) => t.ts === 5)!.p).toBe('p2');
    expect(personneSuivante(base(), 5, 8)).toEqual(base());
  });

  it('retirerQuiParle : personnes, tours et avatars', () => {
    const avec = normaliser({ ...r, avatars: { mode: 'parle' } }, { sources: [s1] }).recette;
    const sans = retirerQuiParle(avec);
    expect(sans.personnes).toBeUndefined();
    expect(sans.paroles).toBeUndefined();
    expect(sans.avatars).toBeUndefined();
    expect(retirerQuiParle(sans)).toBe(sans);
  });
});
