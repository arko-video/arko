import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import type { Mot, Recette } from '../../recette/types';
import type { AnalyseExpress, ReglagesExpress } from '../express/express';
import type { SignauxSource } from '../types';
import { appliquerPlan, scenesDuPlan } from './appliquer';
import type { PlanMonteur } from './plan';

const D = 900;
const phrase = (t: number, x: string[]): Mot[] => x.map((w, i) => [w, Math.round((t + i * 0.4) * 100) / 100, Math.round((t + i * 0.4 + 0.3) * 100) / 100]);
const MOTS: Mot[] = [...phrase(10, ['bon', 'on', 'commence', 'la', 'partie']), ...phrase(100, ['je', 'cherche', 'du', 'bois']), ...phrase(200, ['non!', 'le', 'creeper', 'arrive']), ...phrase(210, ['mdr', 'il', 'a', 'tout', 'explosé'])];
const S: SignauxSource = { src: 's1', duree: D, pas: 0.02, rms: new Float32Array(D * 50).fill(0.01), pics: [], cris: [], rires: [], muets: [] };
const A: AnalyseExpress = { transcription: { src: 's1', mots: MOTS, plages: [{ de: 0, a: D }], complete: true }, parole: 'mots', signaux: S, scenes: [], cadreBords: null, avertissements: [] } as unknown as AnalyseExpress;
const REG: ReglagesExpress = { dureeVisee: { min: 60, max: 120 }, garder: 'parole+forts', niveauBlancs: 'normal', transcrire: true, punchlines: true, bruitages: false, musique: [], bords: false, zooms: null, sections: false, accroche: false, avecIA: false } as ReglagesExpress;
const RES = { sourcesAudio: [], bruitages: [], musique: null };
const recette = (): Recette =>
  normaliser({ format: 'arko.recette/1', destination: 'youtube', sources: [{ id: 's1', nom: 'obs.mp4', taille: 1, emp: 'e1', duree: D, type: 'video', l: 1280, h: 720 }], plans: [{ de: 0, a: 600 }], textes: [], sons: [], zooms: [], guide: null, boucle: false, export: {} }).recette;
const plan = (o: Partial<PlanMonteur> = {}): PlanMonteur => ({ accroche: null, intro: null, sequences: [], effets: [], titres: [], miniature: null, ...o });

describe('monteur IA : appliquer un plan (A6)', () => {
  it('les séquences du plan deviennent les scènes gardées, dans l\'ordre', () => {
    const sc = scenesDuPlan(plan({ sequences: [{ de: 9, a: 13, titre: '', pourquoi: 'le début' }, { de: 199, a: 213, titre: 'Le creeper', pourquoi: 'explosion' }] }), A);
    expect(sc.map((s) => [s.de, s.titre, s.garde])).toEqual([[9, 'Partie 1', true], [199, 'Le creeper', true]]);
    const { recette: r } = appliquerPlan(recette(), A, plan({ sequences: [{ de: 9, a: 13, titre: '', pourquoi: '' }, { de: 199, a: 213, titre: '', pourquoi: '' }] }), REG, RES);
    const plans = compiler(r).plans;
    expect(plans.every((p) => (p.de >= 9 && p.a <= 13.01) || (p.de >= 199 && p.a <= 213.01))).toBe(true);
    expect(plans[0]!.de).toBeLessThan(13);
  });

  it('l\'accroche au temps choisi par le monteur, en tête du montage', () => {
    const seqs = [{ de: 9, a: 13, titre: '', pourquoi: '' }, { de: 199, a: 213, titre: '', pourquoi: '' }];
    const { recette: r, journal } = appliquerPlan(recette(), A, plan({ sequences: seqs, accroche: { de: 210, a: 213, texte: 'ATTENDS…' } }), REG, RES);
    expect(journal).toEqual([]);
    const p0 = compiler(r).plans[0]!;
    expect(p0.de).toBeGreaterThan(205);
    expect(p0.de).toBeLessThan(213);
    const hors = appliquerPlan(recette(), A, plan({ sequences: seqs, accroche: { de: 500, a: 503, texte: '' } }), REG, RES);
    expect(hors.journal[0]).toMatch(/aucune séquence/);
  });

  it('un plan sans séquence ne touche à rien', () => {
    const r0 = recette();
    expect(appliquerPlan(r0, A, plan(), REG, RES).recette).toBe(r0);
  });
});

describe('monteur IA : zooms, textes, transitions (A7)', () => {
  it('posés au bon moment ; un effet sur un moment coupé est sauté et noté', () => {
    const seqs = [{ de: 9, a: 13, titre: '', pourquoi: '' }, { de: 199, a: 213, titre: '', pourquoi: '' }];
    const effets = [
      { t: 200.5, type: 'zoom' as const, quoi: '1.4', pourquoi: 'cri' },
      { t: 211, type: 'texte' as const, quoi: 'il a tout explosé', pourquoi: 'punch' },
      { t: 199.5, type: 'transition' as const, quoi: 'flash', pourquoi: 'nouvelle séquence' },
      { t: 500, type: 'zoom' as const, quoi: '1.3', pourquoi: 'coupé' },
    ];
    const { recette: r, journal } = appliquerPlan(recette(), A, plan({ sequences: seqs, effets }), REG, RES);
    expect(r.zooms.some((z) => z.ts === 200.5 && z.force === 1.4)).toBe(true);
    expect(r.textes.some((t) => t.txt === 'IL A TOUT EXPLOSÉ')).toBe(true);
    expect(r.plans.some((p) => p.trans && (typeof p.trans === 'string' ? p.trans : p.trans.type) === 'flash')).toBe(true);
    expect(journal.join(' ')).toMatch(/1 effet sur un moment coupé/);
  });
});

describe('le plan du monteur IA ne remplace plus le montage d\'Arko : ses séquences sont des suggestions', () => {
  it('à ajouter : hors du montage ; à retirer : morceaux d\'Arko que le plan ne couvre pas', async () => {
    const { suggestionsSequences } = await import('./appliquer');
    const montage = [{ de: 100, a: 110 }, { de: 111, a: 130 }, { de: 300, a: 340 }];
    const plan = { sequences: [{ de: 105, a: 125, titre: '', pourquoi: '' }, { de: 600, a: 640, titre: 'ajout', pourquoi: 'fort' }] };
    const s = suggestionsSequences(plan, montage);
    expect(s.ajouter.map((x) => x.de)).toEqual([600]);
    expect(s.retirer).toEqual([{ de: 300, a: 340 }]);
  });
});
