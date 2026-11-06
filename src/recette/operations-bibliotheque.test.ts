// Ma bibliothèque dans la recette : mème « Coupure » (durées, placement), incrustations (normaliseur, opérations),
// retrait propre d'un clip disparu, et rétrocompatibilité (un ancien montage reste identique).

import { describe, expect, it } from 'vitest';
import { normaliser } from './normaliser';
import { ajouterIncrustation, couperMeme, estPlanMeme, idClip, insererMeme, modifierIncrustation, retirerClipsManquants, supprimerIncrustation } from './operations-bibliotheque';
import { choisirGenerique, dureeFinale, supprimer } from './operations';
import type { Incrustation, Recette, Source } from './types';

const s1: Source = { id: 's1', nom: 'jeu.mp4', taille: 1, emp: 'e1', duree: 60, type: 'video', l: 1920, h: 1080 };
const meme: Source = { id: 'b1', nom: 'bruh.mp4', taille: 1, emp: 'e2', duree: 3, type: 'video', l: 1280, h: 720, bib: 'vabc' };
const vert: Source = { id: 'b2', nom: 'abonne.mp4', taille: 1, emp: 'e3', duree: 5, type: 'video', l: 1920, h: 1080, bib: 'vdef' };

function base(brut: object = {}): Recette {
  return normaliser({ sources: [s1], plans: [{ de: 10, a: 20 }], ...brut }).recette;
}

const fondVert: Incrustation = { src: 'b2', t: 2, de: 0.5, a: 3.5, cle: { couleur: [40, 185, 70], tolerance: 0.42, douceur: 0.25, debordement: 0.7 } };

describe('mème « Coupure »', () => {
  it('inséré à la tête de lecture : le plan est coupé en deux, la vidéo s\'allonge de la durée gardée du mème', () => {
    const { recette: r, i } = insererMeme(base(), 4, meme, 0.5, 2);
    expect(i).toBe(1);
    expect(r.plans.map((p) => [p.src ?? 's1', p.de, p.a])).toEqual([['s1', 10, 14], ['b1', 0.5, 2], ['s1', 14, 20]]);
    expect(dureeFinale(r)).toBe(11.5);
    // Plein écran en fond flou (bandes floues si le format diffère), même si le montage est en plein écran recadré.
    expect(r.plans[1]!.mise).toEqual({ type: 'flou', y: 0.5 });
    expect(r.sources.map((s) => s.id)).toEqual(['s1', 'b1']);
    expect(r.sources[1]!.bib).toBe('vabc');
    expect(estPlanMeme(r, 1)).toBe(true);
    expect(estPlanMeme(r, 0)).toBe(false);
  });

  it('tout près d\'une coupe ou au tout début / à la fin : calé sur la coupe', () => {
    expect(insererMeme(base(), 0.02, meme, 0, 1).recette.plans[0]!.src).toBe('b1');
    const fin = insererMeme(base(), 9.98, meme, 0, 1).recette;
    expect(fin.plans[fin.plans.length - 1]!.src).toBe('b1');
    expect(dureeFinale(fin)).toBe(11);
  });

  it('début / fin du mème coupés ; bornés à la durée du clip', () => {
    const { recette: r } = insererMeme(base(), 4, meme, 0, 3);
    const c = couperMeme(r, 1, 1, 9);
    expect([c.plans[1]!.de, c.plans[1]!.a]).toEqual([1, 3]);
    expect(dureeFinale(c)).toBe(12);
  });

  it('supprimé comme un plan ordinaire (Couper) : la vidéo retrouve sa durée', () => {
    const { recette: r } = insererMeme(base(), 4, meme, 0, 2);
    expect(dureeFinale(supprimer(r, 1))).toBe(10);
  });
});

describe('fonds verts et mèmes en incrustation', () => {
  it('posé, réglé, retiré ; la source part avec la dernière incrustation', () => {
    const a = ajouterIncrustation(base(), fondVert, vert);
    expect(a.i).toBe(0);
    expect(a.recette.incrustations).toEqual([fondVert]);
    const m = modifierIncrustation(a.recette, 0, { x: 0.3, y: 0.8, taille: 0.5, vol: 0.4, son: false });
    expect(m.incrustations![0]).toMatchObject({ x: 0.3, y: 0.8, taille: 0.5, vol: 0.4, son: false });
    const plein = modifierIncrustation(m, 0, { plein: true });
    expect(plein.incrustations![0]!.plein).toBe(true);
    const s = supprimerIncrustation(plein, 0);
    expect(s.incrustations).toBeUndefined();
    expect(s.sources.map((x) => x.id)).toEqual(['s1']);
  });

  it('plusieurs fonds verts dans un montage, triés par temps', () => {
    let r = ajouterIncrustation(base(), { ...fondVert, t: 6 }, vert).recette;
    r = ajouterIncrustation(r, { ...fondVert, t: 1 }).recette;
    r = ajouterIncrustation(r, { src: 'b2', t: 3, de: 0, a: 1, genre: 'meme', taille: 0.4, x: 0.75, y: 0.25 }).recette;
    expect(r.incrustations!.map((x) => x.t)).toEqual([1, 3, 6]);
  });

  it('le normaliseur corrige : bornes, clip inconnu retiré, temps après la fin replacé, détourage complété', () => {
    const { recette: r, problemes } = normaliser({
      sources: [s1, vert],
      plans: [{ de: 0, a: 10 }],
      incrustations: [
        { src: 'b2', t: 50, de: 4, a: 99, x: 3, taille: 9, vol: 7, cle: { couleur: [300, 180, -5] } },
        { src: 'zz', t: 1, de: 0, a: 1 },
        { src: 'b2', t: 1, de: 2, a: 2.05 },
      ],
    });
    expect(r.incrustations).toEqual([{ src: 'b2', t: 9, de: 4, a: 5, x: 1, taille: 1.5, vol: 1.5, cle: { couleur: [255, 180, 0], tolerance: 0.42, douceur: 0.25, debordement: 0.7 } }]);
    expect(problemes.length).toBeGreaterThanOrEqual(4);
    // Idempotent.
    expect(normaliser(r).recette).toEqual(r);
  });

  it('une intro / outro ne retire pas la source d\'un fond vert', () => {
    const r = ajouterIncrustation(base({ destination: 'youtube' }), fondVert, vert).recette;
    const avecIntro = choisirGenerique(r, 'intro', { modele: 'neon', dur: 3 });
    expect(avecIntro.sources.map((s) => s.id)).toContain('b2');
  });

  it('id libre « bN »', () => {
    expect(idClip(base())).toBe('b1');
    expect(idClip(base(), ['b1'])).toBe('b2');
  });
});

describe('reprise : un clip qui n\'est plus dans Ma bibliothèque', () => {
  it('retiré proprement (plans de mème, incrustations, source) ; le reste ne bouge pas', () => {
    let r = insererMeme(base(), 4, meme, 0, 2).recette;
    r = ajouterIncrustation(r, fondVert, vert).recette;
    const sansMeme = retirerClipsManquants(r, ['b1']);
    expect(sansMeme.plans.map((p) => p.src ?? 's1')).toEqual(['s1', 's1']);
    expect(dureeFinale(sansMeme)).toBe(10);
    expect(sansMeme.incrustations).toHaveLength(1);
    const sansRien = retirerClipsManquants(sansMeme, ['b2']);
    expect(sansRien.incrustations).toBeUndefined();
    expect(sansRien.sources.map((s) => s.id)).toEqual(['s1']);
    expect(retirerClipsManquants(r, [])).toBe(r);
  });
});

describe('rétrocompatibilité', () => {
  it('un ancien montage ne reçoit aucun champ, et une source sans « bib » reste identique', () => {
    const r = base();
    expect('incrustations' in r).toBe(false);
    expect(r.sources[0]).toEqual(s1);
    expect(normaliser(JSON.parse(JSON.stringify(r))).recette).toEqual(r);
  });
});
