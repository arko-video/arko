// Phase 4 : modèles « Top 3 » et « Le meilleur d'abord ».
import { describe, expect, it } from 'vitest';
import { compiler } from '../chronologie';
import { normaliserRecette } from '../normaliser';
import { modeleMeilleurDAbord, modeleTop3 } from '../operations';
import type { Recette, Source } from '../types';

const v: Source = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 60, type: 'video', l: 1920, h: 1080 };
const avec = (brut: Record<string, unknown>): Recette => normaliserRecette(brut, { sources: [v] });

describe('Top 3', () => {
  it('null s\'il y a moins de 3 plans', () => {
    expect(modeleTop3(avec({ plans: [{ de: 0, a: 4 }, { de: 5, a: 9 }] }))).toBeNull();
  });

  it('#3 #2 #1 sur les 3 derniers plans, zoom entre eux, boom à chaque début, accroche TOP 3', () => {
    const r = avec({ plans: [{ de: 0, a: 2 }, { de: 10, a: 13 }, { de: 20, a: 24 }, { de: 30, a: 35 }] });
    const t = modeleTop3(r)!;
    expect(t.plans.length).toBe(4); // aucun plan supprimé
    expect(t.plans.map((p) => p.trans)).toEqual([undefined, undefined, 'zoom', 'zoom']);
    const nums = t.textes.filter((x) => x.txt.startsWith('#'));
    expect(nums.map((x) => [x.txt, x.t, x.dur, x.style])).toEqual([['#3', 2, 1.2, 'alerte'], ['#2', 5, 1.2, 'alerte'], ['#1', 9, 1.2, 'alerte']]);
    expect(t.textes.find((x) => x.role === 'accroche')).toMatchObject({ txt: 'TOP 3', t: 0, dur: 1.5 });
    expect(compiler(t).sons.filter((s) => s.element.id === 'impact.boom').map((s) => s.t)).toEqual([2, 5, 9]);
  });

  it('garde une accroche existante et ne double pas les numéros', () => {
    const r = avec({ plans: [{ de: 0, a: 2 }, { de: 10, a: 13 }, { de: 20, a: 24 }], textes: [{ txt: 'Regarde', role: 'accroche', t: 0 }] });
    const t = modeleTop3(modeleTop3(r)!)!;
    expect(t.textes.filter((x) => x.role === 'accroche').map((x) => x.txt)).toEqual(['Regarde']);
    expect(t.textes.filter((x) => x.txt.startsWith('#')).length).toBe(3);
  });

  it('ne retire jamais un texte « #1 » de l\'utilisateur, seulement ses propres numéros (rôle top3)', () => {
    const r = avec({ plans: [{ de: 0, a: 2 }, { de: 10, a: 13 }, { de: 20, a: 24 }], textes: [{ txt: '#1', t: 0.5 }] });
    const t = modeleTop3(modeleTop3(r)!)!;
    expect(t.textes.filter((x) => x.txt === '#1' && x.role === undefined)).toHaveLength(1);
    expect(t.textes.filter((x) => x.role === 'top3').map((x) => x.txt)).toEqual(['#3', '#2', '#1']);
  });
});

describe('Le meilleur d\'abord', () => {
  const r = () =>
    avec({
      plans: [{ de: 0, a: 10 }, { de: 20, a: 30 }],
      textes: [{ txt: 'Salut', role: 'accroche', t: 0, dur: 2 }],
      sons: [{ id: 'impact.boom', t: 3 }, { id: 'impact.meme', ts: 25 }],
      zooms: [{ t: 4 }, { ts: 22 }],
      sousTitres: { mots: [['oh', 24.9, 25.2]] },
    });

  it('copie 1,5 s autour de t en tête, ATTENDS… et glitch', () => {
    const m = modeleMeilleurDAbord(r(), 15); // t = 15 → source 25
    expect(m.plans.map((p) => [p.de, p.a, p.trans])).toEqual([[24.25, 25.75, undefined], [0, 10, 'glitch'], [20, 30, undefined]]);
    expect(m.textes[0]).toEqual({ txt: 'ATTENDS…', style: 'accroche', t: 0, dur: 1.5, x: 0.5, y: 0.2 });
    expect(m.textes[1]).toMatchObject({ txt: 'Salut', role: 'accroche', t: 1.5 });
  });

  it('décale ce qui est en temps de sortie ; le temps source suit tout seul', () => {
    const avant = compiler(r());
    const apres = compiler(modeleMeilleurDAbord(r(), 15));
    expect(apres.duree).toBe(avant.duree + 1.5);
    // Son en t : 3 → 4,5. Son en ts 25 : 15 → 16,5, ET dans la copie (0,75).
    expect(apres.sons.map((s) => [s.element.id, s.t])).toEqual([['impact.meme', 0.75], ['impact.boom', 4.5], ['impact.meme', 16.5]]);
    expect(apres.zooms.map((z) => z.t)).toEqual([5.5, 13.5]);
    // Sous-titres (temps source) : dans la copie et à leur place d'origine décalée.
    expect(apres.sousTitres!.lignes.map((l) => Math.round(l.t0 * 100) / 100)).toEqual([0.65, 16.4]);
    expect(avant.sousTitres!.lignes[0]!.t0).toBeCloseTo(14.9, 6);
  });

  it('ajoute l\'accroche ATTENDS… s\'il n\'y en a pas', () => {
    const m = modeleMeilleurDAbord(avec({ plans: [{ de: 0, a: 10 }] }), 0);
    expect(m.plans[0]).toEqual({ de: 0, a: 1.5 });
    expect(m.textes[0]!.role).toBe('accroche');
  });
});
