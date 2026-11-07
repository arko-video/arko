// Séquences dans Habiller (intégrateur, Best-of v4) : retirer, déplacer, allonger / raccourcir une séquence entière.
// Montage FABRIQUÉ : accroche (2 plans copiés + « glitch »), 3 séquences de 2 plans, un chapitre par séquence, un titre
// et une musique en temps de sortie. Un geste = une nouvelle recette = un seul Annuler.

import { describe, expect, it } from 'vitest';
import { compiler } from './chronologie';
import { annuler, nouvelHistorique, pousser } from './historique';
import { MEILLEUR } from './modeles';
import { normaliser } from './normaliser';
import { deplacerSequence, etendreSequence, RAISON_RETIREE, retirerSequence, sequencesDeLaVideo, vientDUnBestOf } from './operations-sequences';
import type { Recette, Source } from './types';

const VIDEO: Source = { id: 's1', nom: 'session.mp4', taille: 1, emp: 'e1', duree: 3600, type: 'video', l: 1920, h: 1080 };
const MUSIQUE: Source = { id: 'a1', nom: 'morceau.m4a', taille: 1, emp: 'm1', duree: 200, type: 'audio' };

/** Accroche 6 s (2 plans), puis A [100–110, 112–120], B [300–305, 306–316], C [500–508, 510–520]. */
function montage(): Recette {
  const brut = {
    format: 'arko.recette/1',
    sources: [VIDEO, MUSIQUE],
    plans: [
      { de: 503, a: 506 },
      { de: 512, a: 515 },
      { de: 100, a: 110, trans: { type: MEILLEUR.transition, dur: 0.3 } },
      { de: 112, a: 120 },
      { de: 300, a: 305 },
      { de: 306, a: 316 },
      { de: 500, a: 508 },
      { de: 510, a: 520 },
    ],
    chapitres: [
      { t: 0, nom: 'Le château' },
      { t: 24, nom: 'Le creeper' },
      { t: 39, nom: 'La fin' },
    ],
    textes: [{ txt: 'LE CREEPER', role: 'section', style: 'bandeau', t: 24 }],
    musique: { morceaux: [{ src: 'a1', t: 6 }, { src: 'a1', t: 39 }] },
  };
  return normaliser(brut, { sources: [VIDEO, MUSIQUE] }).recette;
}

const plages = (r: Recette) => r.plans.map((p) => [p.de, p.a]);

describe('séquences du montage (Habiller)', () => {
  it('une séquence par chapitre, sans les plans de l\'accroche', () => {
    const r = montage();
    const s = sequencesDeLaVideo(r);
    expect(s.map((x) => x.nom)).toEqual(['Le château', 'Le creeper', 'La fin']);
    expect(s.map((x) => x.plans)).toEqual([[2, 3], [4, 5], [6, 7]]);
    expect(s[1]).toMatchObject({ src: 's1', de: 300, a: 316, t0: 24, t1: 39 });
    expect(sequencesDeLaVideo({ ...r, chapitres: [] })).toEqual([]);
  });

  it('retirer : ses plans partent, elle va dans « Passages pas retenus », les chapitres et le reste suivent', () => {
    const r = montage();
    const sans = retirerSequence(r, 1);
    expect(plages(sans)).toEqual([[503, 506], [512, 515], [100, 110], [112, 120], [500, 508], [510, 520]]);
    expect(sans.chapitres).toEqual([{ t: 0, nom: 'Le château' }, { t: 24, nom: 'La fin' }]);
    expect(sans.derush?.passages[0]).toMatchObject({ src: 's1', de: 300, a: 316, raison: RAISON_RETIREE, titre: 'Le creeper' });
    // La musique qui commençait sur « La fin » la suit ; le titre de la séquence retirée va au début de la suivante.
    expect(sans.musique?.morceaux.map((m) => m.t)).toEqual([6, 24]);
    expect(sans.textes[0]!.t).toBe(24);
    expect(compiler(sans).duree).toBeCloseTo(compiler(r).duree - 15, 5);
    // Retirer la 1ʳᵉ : le « glitch » d'après l'accroche reste à sa place, le 1er chapitre reste à 0.
    const sans0 = retirerSequence(r, 0);
    expect(sans0.plans[2]).toMatchObject({ de: 300, a: 305 });
    expect(sans0.plans[2]!.trans).toMatchObject({ type: MEILLEUR.transition });
    expect(sans0.chapitres?.[0]).toEqual({ t: 0, nom: 'Le creeper' });
    // La dernière qui reste ne se retire pas.
    const une = retirerSequence(retirerSequence(sans0, 1), 0);
    expect(retirerSequence(une, 0)).toBe(une);
  });

  it('déplacer : échange avec la voisine ; chapitres, titre et musique suivent leur image ; sans effet au bord', () => {
    const r = montage();
    const d = deplacerSequence(r, 1, 1);
    expect(plages(d).slice(2)).toEqual([[100, 110], [112, 120], [500, 508], [510, 520], [300, 305], [306, 316]]);
    expect(d.chapitres).toEqual([{ t: 0, nom: 'Le château' }, { t: 24, nom: 'La fin' }, { t: 42, nom: 'Le creeper' }]);
    expect(d.textes[0]!.t).toBe(42);
    expect(d.musique?.morceaux.map((m) => m.t)).toEqual([6, 24]);
    expect(compiler(d).duree).toBeCloseTo(compiler(r).duree, 5);
    // La 1ʳᵉ vers le bas : le « glitch » reste juste après l'accroche.
    const d0 = deplacerSequence(r, 0, 1);
    expect(d0.plans[2]).toMatchObject({ de: 300, a: 305 });
    expect(d0.plans[2]!.trans).toMatchObject({ type: MEILLEUR.transition });
    expect(d0.plans[4]!.trans).toBeUndefined();
    expect(deplacerSequence(r, 0, -1)).toBe(r);
    expect(deplacerSequence(r, 2, 1)).toBe(r);
  });

  it('allonger (morceaux donnés, rognés à la séquence) ou raccourcir d\'un morceau, au début ou à la fin', () => {
    const r = montage();
    const plus = etendreSequence(r, 1, 'debut', 1, [{ de: 290, a: 301 }]);
    expect(plages(plus).slice(4, 7)).toEqual([[290, 300], [300, 305], [306, 316]]);
    expect(plus.chapitres?.[1]).toEqual({ t: 24, nom: 'Le creeper' });
    expect(plus.chapitres?.[2]!.t).toBe(49);
    const fin = etendreSequence(r, 2, 'fin', 1, [{ de: 521, a: 525 }]);
    expect(plages(fin).slice(-1)).toEqual([[521, 525]]);
    const moins = etendreSequence(r, 1, 'fin', -1);
    expect(plages(moins).slice(4)).toEqual([[300, 305], [500, 508], [510, 520]]);
    expect(moins.chapitres?.[2]!.t).toBe(29);
    // Au début de la 1ʳᵉ : le « glitch » passe au plan qui devient le 1er.
    const moins0 = etendreSequence(r, 0, 'debut', -1);
    expect(moins0.plans[2]).toMatchObject({ de: 112, a: 120 });
    expect(moins0.plans[2]!.trans).toMatchObject({ type: MEILLEUR.transition });
    // Rien à ajouter, ou un seul plan à retirer : sans effet.
    expect(etendreSequence(r, 1, 'debut', 1, [])).toBe(r);
    expect(etendreSequence(moins, 1, 'fin', -1)).toBe(moins);
  });

  it('les panneaux du Best-of ne visent que les montages d\'un Best-of (relecture point 5)', () => {
    const r = montage();
    expect(vientDUnBestOf(r)).toBe(false); // fait à la main (musique sans « baisse sur la parole »)
    expect(vientDUnBestOf({ ...r, musique: { ...r.musique!, baisseSur: 'parole' } })).toBe(true);
    expect(vientDUnBestOf({ ...r, avatars: { mode: 'parle', rebond: true, tenue: 0.35 } })).toBe(true);
    expect(vientDUnBestOf({ ...r, derush: { passages: [{ de: 1, a: 2, note: 50, raison: 'x' }] } })).toBe(true);
    // Le panneau Séquences, lui, demande des chapitres (au moins 2 séquences).
    expect(sequencesDeLaVideo({ ...r, chapitres: [] })).toEqual([]);
  });

  it('un geste = un seul Annuler', () => {
    const r = montage();
    let h = nouvelHistorique(r);
    h = pousser(h, retirerSequence(r, 1));
    h = pousser(h, deplacerSequence(h.present, 0, 1));
    expect(annuler(annuler(h)).present).toBe(r);
  });
});
