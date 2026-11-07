// Recouper après coup (dev-coupes) : Habiller → Couper Serré / Normal / Large recoupe un Best-of comme le Best-of
// (couperV4 + couperLesBlancs), sans réécouter (mesures gardées + mots des sous-titres) ; l'accroche et les bords
// posés à la main ne bougent pas ; les textes et chapitres suivent leur image ; un seul Annuler par geste ;
// « Passages pas retenus → Ajouter » coupe comme le Best-of. Données fabriquées seulement.

import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import { annuler, couperLesBlancs, nouvelHistorique, pousser } from '../../recette/operations';
import type { Mot, NiveauBlancs, Recette } from '../../recette/types';
import type { MesuresGardees } from '../types-v4';
import { paroleDepuisProbas, paroleDepuisZones } from '../vad/segments';
import { couperV4 } from './coupes-v4';
import { energieFabriquee, entree, vadFabriquee } from './coupes-test';
import { FENETRE_RECOUPE, morceauxDuPassage, recouperMontage, TROU_RECOUPE, type EntreeRecoupe } from './recouper';

const DUREE = 600;
const s1 = { id: 's1', nom: 'live.mp4', taille: 1, emp: 'e1', duree: DUREE, type: 'video' as const, l: 1280, h: 720 };

// Phrases (temps source) : des trous de 1 s (gardés en Normal, coupés en Serré), de 1,6 s (coupés en Normal,
// gardés en Large), courts (0,4 s : toujours gardés) et longs (toujours coupés), dans deux séquences [10, 60] et
// [100, 150]. Ces trous restent justes même si les marges des segments de la VAD (dev-vad) bougent un peu.
const phrases: [number, number][] = [];
for (const debut of [12, 102]) {
  let t = debut;
  for (const [duree, trou] of [[2, 1], [1.7, 1.6], [2.1, 3], [1.5, 1], [1.8, 1.6], [1.4, 5], [3, 1], [2, 1.6], [1.2, 2.5], [2.5, 0.4]] as const) {
    phrases.push([t, t + duree]);
    t += duree + trou;
  }
}
const mots: Mot[] = phrases.flatMap(([de, a]) => [['mot', de + 0.05, (de + a) / 2], ['autre', (de + a) / 2 + 0.02, a - 0.05]] as Mot[]);
const vad = vadFabriquee(DUREE, phrases.map(([de, a]) => [de, a, 0.9]));
const energie = energieFabriquee(DUREE, -60, phrases.map(([de, a]) => [de, a, -28]));
const mesures: MesuresGardees = { v: 1, vad: { pas: vad.pas, p: vad.p, plages: vad.plages, modele: vad.modele }, energie, hauteur: null };
const e: EntreeRecoupe = { mesures, mots };
const sequences = [{ de: 10, a: 60 }, { de: 100, a: 150 }];

const morceaux = (niveau: NiveauBlancs) => couperV4(entree({ mots, parole: paroleDepuisProbas(vad, DUREE), energie, niveau }));
/** Le Best-of à ce niveau : plans = séquences, coupés par couperLesBlancs avec les morceaux de couperV4. */
function bestOf(niveau: NiveauBlancs): Recette {
  const r = normaliser({ sources: [s1], plans: sequences.map((p) => ({ ...p })) }).recette;
  return couperLesBlancs(r, morceaux(niveau), niveau);
}
/** + une accroche (copie de 120–126 au début, « glitch » sur le plan suivant), un texte et un chapitre en temps de sortie. */
/** Le texte et le 2ᵉ chapitre sont posés sur l'image de la source à TS_TEXTE (au milieu d'une phrase de la séquence B). */
const TS_TEXTE = 108.5;
function avecAccroche(r: Recette): Recette {
  const plans = [{ de: 120, a: 126 }, { ...r.plans[0]!, trans: 'glitch' }, ...r.plans.slice(1)];
  const r1 = normaliser({ ...r, plans }, { sources: r.sources }).recette;
  const p = compiler(r1).plans.find((x) => x.i > 0 && TS_TEXTE >= x.de && TS_TEXTE < x.a)!;
  const t = Math.round((p.t0 + (TS_TEXTE - p.de)) * 100) / 100;
  return normaliser({ ...r1, textes: [{ txt: 'SUITE', t, dur: 2, style: 'titre' }], chapitres: [{ t: 0, titre: 'Début' }, { t, titre: 'Suite' }] }, { sources: r.sources }).recette;
}
const plages = (r: Recette, depuis = 0) => r.plans.slice(depuis).map((p) => [p.de, p.a]);

describe('recouperMontage : comme le Best-of à ce niveau', () => {
  const normal = bestOf('normal');

  it('le Best-of fabriqué a bien des trous différents selon le niveau', () => {
    expect(bestOf('serre').plans.length).toBeGreaterThan(normal.plans.length);
    expect(bestOf('large').plans.length).toBeLessThan(normal.plans.length);
  });

  for (const niveau of ['serre', 'large'] as const) {
    it(`Normal → ${niveau} = le Best-of coupé en ${niveau}`, () => {
      const r = recouperMontage(normal, e, niveau);
      expect(plages(r)).toEqual(plages(bestOf(niveau)));
      expect(r.blancs?.niveau).toBe(niveau);
      expect(r.blancs).toMatchObject({ fonduEntree: 0.02, fonduSortie: 0.04 });
    });
  }

  it('même niveau : rien ne change (même recette)', () => {
    expect(recouperMontage(normal, e, 'normal')).toBe(normal);
  });

  it('Serré → Normal → Large → Normal revient au même montage', () => {
    const r1 = recouperMontage(normal, e, 'serre');
    const r2 = recouperMontage(r1, e, 'normal');
    expect(plages(r2)).toEqual(plages(normal));
    const r3 = recouperMontage(recouperMontage(r2, e, 'large'), e, 'normal');
    expect(plages(r3)).toEqual(plages(normal));
  });

  it('un seul Annuler revient au montage d\'avant', () => {
    const h = pousser(nouvelHistorique(normal), recouperMontage(normal, e, 'serre'));
    expect(h.present).not.toBe(normal);
    expect(annuler(h).present).toBe(normal);
  });

  it('sans les mesures gardées, un Best-of coupé avec la VAD n\'est pas recoupé (rien de perdu, jamais d\'erreur)', () => {
    expect(recouperMontage(normal, { mesures: null, mots }, 'large')).toBe(normal);
    expect(recouperMontage(normal, { mesures: null }, 'large')).toBe(normal);
  });

  it('un montage coupé sur les mots seuls se recoupe sur les mots seuls', () => {
    const paroleMots = paroleDepuisZones('s1', DUREE, mots.map((m) => ({ de: m[1] - 0.05, a: m[2] + 0.05 })), 'mots');
    const surMots = (niveau: NiveauBlancs) => couperV4(entree({ mots, parole: paroleMots, niveau }));
    const r0 = couperLesBlancs(normaliser({ sources: [s1], plans: sequences.map((p) => ({ ...p })) }).recette, surMots('normal'), 'normal');
    const r = recouperMontage(r0, { mesures: null, mots }, 'large');
    expect(r.blancs?.niveau).toBe('large');
    const attendu = couperLesBlancs(normaliser({ sources: [s1], plans: sequences.map((p) => ({ ...p })) }).recette, surMots('large'), 'large');
    expect(plages(r)).toEqual(plages(attendu));
  });
});

describe('recouperMontage : ce qui ne bouge pas', () => {
  const normal = avecAccroche(bestOf('normal'));

  it('l\'accroche et sa transition ne sont pas recoupées', () => {
    const r = recouperMontage(normal, e, 'serre');
    expect(r.plans[0]).toMatchObject({ de: 120, a: 126 });
    const t = r.plans[1]!.trans;
    expect(typeof t === 'string' ? t : t?.type).toBe('glitch');
    expect(plages(r, 1)).toEqual(plages(bestOf('serre')));
  });

  it('les textes et chapitres (temps de sortie) suivent leur image', () => {
    const r = recouperMontage(normal, e, 'serre');
    const avant = compiler(normal);
    const apres = compiler(r);
    // Le texte est posé sur l'image de la source à 108,5 s : après les coupes, il est encore dessus.
    const plan = apres.plans.find((p) => r.textes[0]!.t >= p.t0 - 1e-6 && r.textes[0]!.t < p.t1)!;
    expect(plan.de + (r.textes[0]!.t - plan.t0)).toBeCloseTo(TS_TEXTE, 1);
    expect(r.textes[0]!.t).toBeLessThan(normal.textes[0]!.t);
    expect(r.chapitres?.[0]?.t).toBe(0);
    expect(r.chapitres?.[1]?.t).toBeCloseTo(r.textes[0]!.t, 2);
    expect(apres.duree).toBeLessThan(avant.duree);
  });

  it('un bord coupé à la main (pas une marge des coupes) ne bouge pas', () => {
    const plans = normal.plans.map((p) => ({ ...p }));
    plans[3] = { ...plans[3]!, a: Math.round((plans[3]!.a - 0.6) * 100) / 100 };
    const main = normaliser({ ...normal, plans }, { sources: normal.sources }).recette;
    const r = recouperMontage(main, e, 'large');
    expect(r.plans.some((p) => Math.abs(p.a - plans[3]!.a) < 0.005)).toBe(true);
  });

  it('un plan que les coupes ne savent plus expliquer (rire sans mots, moments oubliés) est gardé tel quel', () => {
    const energieRire = energieFabriquee(DUREE, -60, [...phrases.map(([de, a]): [number, number, number] => [de, a, -28]), [32, 33, -30]]);
    const parole = paroleDepuisProbas(vad, DUREE);
    const avecRire = couperV4(entree({ mots, parole, energie: energieRire, moments: [{ genre: 'rire', de: 32, a: 33, t: 32.5, force: 0.8, indices: [] }] }));
    const r0 = couperLesBlancs(normaliser({ sources: [s1], plans: sequences.map((p) => ({ ...p })) }).recette, avecRire, 'normal');
    const rire = r0.plans.find((p) => p.de < 32 && p.a > 33)!;
    expect(rire).toBeTruthy();
    const r = recouperMontage(r0, { mesures: { ...mesures, energie: energieRire }, mots }, 'serre');
    expect(r.plans.some((p) => p.de === rire.de && p.a === rire.a)).toBe(true);
    expect(r.plans.length).toBeGreaterThan(r0.plans.length);
  });

  it('jamais de passage nouveau loin des plans gardés (± 1 s, trous ≤ 2 s)', () => {
    const r = recouperMontage(normal, e, 'large');
    const anciens = normal.plans.slice(1);
    for (const p of r.plans.slice(1)) {
      const proche = anciens.some((q) => p.de >= q.de - FENETRE_RECOUPE - 1e-6 && p.de <= q.a + TROU_RECOUPE);
      expect(proche).toBe(true);
      expect(p.de).toBeGreaterThanOrEqual(10);
      expect(p.a).toBeLessThanOrEqual(150);
    }
  });

  it('montage jamais coupé (pas de recette.blancs) : on ne fait que resserrer, sans rien ajouter', () => {
    const brut = normaliser({ sources: [s1], plans: sequences.map((p) => ({ ...p })) }).recette;
    const r = recouperMontage(brut, e, 'normal');
    expect(plages(r)).toEqual(plages(bestOf('normal')));
  });
});

describe('morceauxDuPassage', () => {
  it('coupe un passage pas retenu comme le Best-of, seulement dans le passage', () => {
    const m = morceauxDuPassage(e, { de: 100, a: 130 }, 'normal');
    expect(m.length).toBeGreaterThan(2);
    expect(m.every((x) => x.de >= 100 && x.a <= 130)).toBe(true);
    const ref = couperV4(entree({ mots, parole: paroleDepuisProbas(vad, DUREE), energie, plages: [{ de: 100, a: 130 }] }));
    expect(m).toEqual(ref);
  });

  it('rien à garder → [] (l\'appelant garde le passage entier) ; passage vide → []', () => {
    expect(morceauxDuPassage(e, { de: 300, a: 320 }, 'normal')).toEqual([]);
    expect(morceauxDuPassage(e, { de: 50, a: 50 }, 'normal')).toEqual([]);
  });
});
