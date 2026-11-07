// Tests purs des mesures par étape (données fabriquées : ni ffmpeg, ni modèle, ni données privées).
//   npx vitest run --config tests/banc-reel/mesures/vitest.config.ts tests/banc-reel/mesures/etapes.test.ts
import { describe, expect, it } from 'vitest';
import { recetteVide } from '../../../src/recette/defauts';
import type { Recette } from '../../../src/recette/types';
import { baisseDuMontage, coupesEnPleineParole, hors, mesuresEtape } from './etapes';
import type { Verite } from './mesurer';
import { lireMontage } from './temps';

function verite(p: Partial<Verite> = {}): Verite {
  return {
    format: 'arko.banc-verite/1',
    duree: 20,
    accroche: null,
    sequences: [{ id: '00', plages: [[100, 120]], duree: 20, musique: null }],
    morceaux: [{ i: 0, sequence: '00', de: 100, a: 120, t0: 0, t1: 20, zoom: 1 }],
    parole: { R: [[102, 104]], G: [[110, 113]] },
    persoMontre: { R: [], G: [] },
    phrases: [
      { i: 0, p: 'R', emo: 'rit', sit: null, accroche: false, sequence: '00', sortie: [2, 4], montre: [], bouche: [[102, 104]] },
      { i: 1, p: 'G', emo: 'crie', sit: null, accroche: false, sequence: '00', sortie: [10, 13], montre: [], bouche: [[110, 113]] },
    ],
    punchlines: [],
    sousTitres: [],
    musique: { morceaux: [] },
    ...p,
  };
}

function recette(plans: { de: number; a: number }[], musique?: Recette['musique']): Recette {
  const r: Recette = { ...recetteVide(), sources: [{ id: 's1', nom: 'v.mp4', taille: 1, emp: 'e', duree: 200, type: 'video', l: 1280, h: 720 }], plans };
  if (musique) r.musique = musique;
  return r;
}

describe('mesures par étape', () => {
  it('hors : complément dans une liste d\'intervalles', () => {
    expect(hors([[0, 10]], [[2, 3], [5, 6]])).toEqual([[0, 2], [3, 5], [6, 10]]);
    expect(hors([[0, 4]], [[-1, 5]])).toEqual([]);
  });

  it('parole : couverture de chaque voix et non-parole couverte', () => {
    const r = mesuresEtape('parole', {
      verite: verite(),
      recette: null,
      analyse: { paroleDetectee: { methode: 'vad', part: 0.1, segments: [{ de: 102, a: 104 }, { de: 116, a: 118 }] } },
    });
    const l = Object.fromEntries(r.lignes.map((x) => [x.nom, x.valeur]));
    expect(l['Parole de Romain couverte']).toBeCloseTo(1, 5);
    expect(l['Parole de Guts couverte']).toBeCloseTo(0, 5);
    // non-parole connue : [100,120] moins [101.7,104.3] ∪ [109.7,113.3] = 1,7 + 5,4 + 6,7 = 13,8 s ; couverte 2 s.
    expect(l['Non-parole des morceaux gardés couverte']).toBeCloseTo(2 / 13.8, 3);
  });

  it('moments : un rire et un cri de la vérité retrouvés', () => {
    const r = mesuresEtape('moments', {
      verite: verite(),
      recette: null,
      analyse: { moments: [{ de: 104.2, a: 105, t: 104.5, genre: 'rire', force: 1 }] },
    });
    expect(r.lignes[0]!.texte).toBe('1 / 1');
    expect(r.lignes[1]!.texte).toBe('0 / 1');
  });

  it('coupes : un bord en pleine parole selon la VAD', () => {
    const p = new Uint8Array(1000);
    // parole (p = 1) de 3,2 s à 6,4 s
    p.fill(255, 100, 200);
    const m = lireMontage(recette([{ de: 0, a: 5 }, { de: 10, a: 12 }]));
    // bords : début 0 (pas de parole), fin 5 (en parole des deux côtés), début 10, fin 12
    expect(coupesEnPleineParole(m, { pas: 0.032, p })).toEqual({ n: 1, total: 4 });
  });

  it('musique : la parole baisse la musique de 8 dB avec baisseSur parole, même une voix faible', () => {
    const r = recette([{ de: 0, a: 4 }], { morceaux: [{ src: 'a1', t: 0 }], baisseSur: 'parole' });
    r.sources.push({ id: 'a1', nom: 'm.wav', taille: 1, emp: 'm', duree: 60, type: 'audio' });
    r.paroles = [{ ts: 1, fin: 2, p: 'p1' }];
    // voix très faible (−60 dBFS) : seule la commande fixe de la v4 baisse la musique
    const son = (de: number, a: number) => new Float32Array(Math.round((a - de) * 16000)).fill(0.001);
    const b = baisseDuMontage(r, son)!;
    expect(b).not.toBeNull();
    const k = (t: number) => b.db[Math.floor(t / b.pas)]!;
    expect(k(1.8)).toBeGreaterThan(6);
    expect(k(0.5)).toBeLessThan(1);
    expect(k(3.9)).toBeLessThan(3);
  });

  it('étape inconnue : un avertissement, aucune ligne', () => {
    const r = mesuresEtape('rien', { verite: verite(), recette: null, analyse: null });
    expect(r.lignes).toEqual([]);
    expect(r.avertissements[0]).toMatch(/inconnue/);
  });
});
