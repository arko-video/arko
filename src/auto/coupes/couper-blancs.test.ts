// A. L'opération couperLesBlancs (transition, arrêt sur image, plage, un seul Annuler, `blancs` écrit), l'aperçu
// (= résultat réel), les fondus du son aux coupes et le mixeur (pas de marche > −40 dB à une coupe).

import { describe, expect, it } from 'vitest';
import { fondusDesCoupes, FONDUS_HABITUELS } from '../../moteur/audio/fondus-coupes';
import { mixerBloc } from '../../moteur/audio/mixeur';
import { compiler } from '../../recette/chronologie';
import { gabaritDe } from '../../recette/destination';
import { normaliser } from '../../recette/normaliser';
import { annuler, couperLesBlancs, dureeFinale, nouvelHistorique, pousser } from '../../recette/operations';
import type { Recette } from '../../recette/types';
import type { Morceau } from '../types';
import { apercuBlancs } from './blancs';

const s1 = { id: 's1', nom: 'live.mp4', taille: 1, emp: 'e1', duree: 7200, type: 'video' as const, l: 1280, h: 720 };

function recette(plans: unknown[], extra: Record<string, unknown> = {}): Recette {
  return normaliser({ sources: [s1], plans, ...extra }).recette;
}

const m = (de: number, a: number): Morceau => ({ de, a, raison: 'parole' });

describe('couperLesBlancs sans plage (les plans actuels)', () => {
  const r = recette([
    { de: 0, a: 10 },
    { de: 20, a: 30, trans: { type: 'flash' }, fige: 1, vit: 1.5, mise: { type: 'recadre', x: 0.3 } },
  ]);
  const morceaux = [m(1, 2), m(4, 5), m(21, 23), m(25, 26), m(28, 29)];
  const res = couperLesBlancs(r, morceaux, 'normal');

  it('un plan devient plusieurs plans, avec les mêmes réglages', () => {
    expect(res.plans.map((p) => [p.de, p.a])).toEqual([[1, 2], [4, 5], [21, 23], [25, 26], [28, 29]]);
    for (const p of res.plans.slice(2)) expect(p).toMatchObject({ vit: 1.5, mise: { type: 'recadre', x: 0.3 } });
  });

  it('la transition reste sur le 1er morceau, l\'arrêt sur image sur le dernier', () => {
    expect(res.plans[2]!.trans).toBeTruthy();
    expect(res.plans[3]).not.toHaveProperty('trans');
    expect(res.plans[4]).not.toHaveProperty('trans');
    expect(res.plans[4]!.fige).toBe(1);
    expect(res.plans[2]).not.toHaveProperty('fige');
    expect(res.plans[3]).not.toHaveProperty('fige');
  });

  it('écrit recette.blancs (réglage et fondus 20 / 40 ms)', () => {
    expect(res.blancs).toEqual({ niveau: 'normal', fonduEntree: 0.02, fonduSortie: 0.04 });
    expect(couperLesBlancs(r, morceaux, 'serre').blancs?.niveau).toBe('serre');
  });

  it('un seul Annuler revient à la recette d\'avant', () => {
    const h = pousser(nouvelHistorique(r), res);
    expect(annuler(h).present).toEqual(r);
  });

  it('jamais tous les plans : sans aucun morceau, sans effet (même objet)', () => {
    expect(couperLesBlancs(r, [], 'normal')).toBe(r);
    expect(couperLesBlancs(r, [m(50, 60)], 'normal')).toBe(r);
  });

  it('les morceaux sont triés et fusionnés s\'ils se chevauchent', () => {
    const x = couperLesBlancs(r, [m(4, 5), m(1, 2), m(1.5, 3)], 'normal');
    expect(x.plans.map((p) => [p.de, p.a])).toEqual([[1, 3], [4, 5]]);
  });

  it('un bout trop court au bord d\'un plan (< 0,35 s) est retiré', () => {
    const x = couperLesBlancs(r, [m(9.8, 12), m(4, 5)], 'normal');
    expect(x.plans.map((p) => [p.de, p.a])).toEqual([[4, 5]]);
  });
});

describe('couperLesBlancs avec une plage (la vidéo d\'origine)', () => {
  // Une longue vidéo importée ne garde que ses 60 premières secondes.
  const r = recette([{ de: 0, a: 60 }]);

  it('les plans deviennent les morceaux de la plage', () => {
    const x = couperLesBlancs(r, [m(100, 110), m(1200, 1205), m(5000, 5010)], 'normal', { plage: { de: 0, a: 1800 } });
    expect(x.plans.map((p) => [p.de, p.a])).toEqual([[100, 110], [1200, 1205]]);
    expect(x.blancs?.niveau).toBe('normal');
  });

  it('un morceau à cheval sur la plage est coupé à la plage', () => {
    const x = couperLesBlancs(r, [m(1795, 1810)], 'normal', { plage: { de: 1200, a: 1800 } });
    expect(x.plans.map((p) => [p.de, p.a])).toEqual([[1795, 1800]]);
  });
});

describe('apercuBlancs', () => {
  it('« avant → après · coupes » = le résultat réel de l\'opération', () => {
    const r = recette([{ de: 0, a: 10 }, { de: 20, a: 30, fige: 1 }]);
    const morceaux = [m(1, 2), m(4, 5), m(21, 23), m(25, 26), m(28, 29)];
    const a = apercuBlancs(r, morceaux);
    expect(a.avant).toBe(dureeFinale(r));
    expect(a.apres).toBe(dureeFinale(couperLesBlancs(r, morceaux, 'normal')));
    expect(a.apres).toBe(7); // 1 + 1 + 2 + 1 + 1 + arrêt sur image 1
    // Plan 1 : avant 1, entre 2 et 4, après 5 → 3 ; plan 2 : avant 21, 23-25, 26-28, après 29 → 4.
    expect(a.coupes).toBe(7);
  });

  it('avec une plage : « avant » = durée de la plage', () => {
    const r = recette([{ de: 0, a: 60 }]);
    const a = apercuBlancs(r, [m(10, 20), m(30, 40)], { de: 0, a: 7200 });
    expect(a).toEqual({ avant: 7200, apres: 20, coupes: 3 });
  });

  it('annonce AVANT d\'appliquer un résultat trop long pour la destination (bloquant au normaliseur)', () => {
    const r = recette([{ de: 0, a: 60 }]); // TikTok : 10 min au plus
    const morceaux = Array.from({ length: 70 }, (_, i) => m(i * 20, i * 20 + 10)); // 11 min 40 s de parole
    const a = apercuBlancs(r, morceaux, { de: 0, a: 7200 });
    expect(a.apres).toBeGreaterThan(gabaritDe(r).dureeMax);
    expect(normaliser(couperLesBlancs(r, morceaux, 'normal', { plage: { de: 0, a: 7200 } })).bloquant).toBe(true);
  });

  it('sans aucun morceau : 0 coupe, durée inchangée', () => {
    const r = recette([{ de: 0, a: 60 }]);
    expect(apercuBlancs(r, [])).toEqual({ avant: 60, apres: 60, coupes: 0 });
  });
});

describe('fondus du son aux coupes', () => {
  it('fondusDesCoupes : ceux de recette.blancs, sinon les 5 ms habituels', () => {
    expect(fondusDesCoupes({ blancs: { niveau: 'normal', fonduEntree: 0.02, fonduSortie: 0.04 } })).toEqual({ entree: 0.02, sortie: 0.04 });
    expect(fondusDesCoupes({})).toBe(FONDUS_HABITUELS);
  });

  it('mixeur : fondu de 40 ms avant la coupe, 20 ms après, pas de marche > −40 dB', () => {
    const r = couperLesBlancs(recette([{ de: 0, a: 30 }]), [m(0, 10), m(20, 30)], 'normal');
    const scenario = compiler(r);
    const f = 48000;
    // Son de la source : +0,5 dans le 1er morceau, −0,5 dans le 2ᵉ (le pire cas : un saut de 1 à la coupe).
    const pcm1 = { frequence: f, debut: 0, canaux: [new Float32Array(f * 10).fill(0.5)] };
    const pcm2 = { frequence: f, debut: 20, canaux: [new Float32Array(f * 10).fill(-0.5)] };
    const t0 = 9.5;
    const sortie = mixerBloc({ scenario, t0, n: f, pcmMorceaux: [pcm1, pcm2], fondus: fondusDesCoupes(r) })[0]!;
    let marche = 0;
    for (let k = 1; k < sortie.length; k++) marche = Math.max(marche, Math.abs(sortie[k]! - sortie[k - 1]!));
    expect(20 * Math.log10(marche)).toBeLessThan(-40);
    const a = (t: number) => sortie[Math.round((t - t0) * f)]!;
    expect(a(9.9)).toBeCloseTo(0.5, 2); // avant le fondu
    expect(a(9.98)).toBeCloseTo(0.25, 1); // milieu du fondu de sortie (40 ms)
    expect(Math.abs(a(10))).toBeLessThan(0.01); // la coupe
    expect(a(10.01)).toBeCloseTo(-0.25, 1); // milieu du fondu d'entrée (20 ms)
    expect(a(10.1)).toBeCloseTo(-0.5, 2);
  });
});
