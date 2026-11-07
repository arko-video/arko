import { describe, expect, it } from 'vitest';
import type { Mot, Source } from '../recette/types';
import { candidats } from './candidats';
import type { Moment } from './moments';
import { rangerMots, recetteATranscrire } from './mots-moments';
import { accrocheDuMoment, clipsSansIA, heure, titreDuMoment } from './sans-ia';
import { CONNUS, signalSynthetique } from './synthese-test';

const SOURCE: Source = { id: 's1', nom: 'live.mp4', taille: 1e9, emp: 'abc', duree: 7200, type: 'video', l: 1920, h: 1080 };

const calme: Moment = { id: 'm01', debut: 994, fin: 1004, score: 70, etiquettes: ['silence>pic'], pic: 1000, raison: 'Gros pic de son après un calme' };
const rire: Moment = { id: 'm02', debut: 2995, fin: 3009, score: 90, etiquettes: ['pic', 'rire'], pic: 3000, raison: 'Pic de son, puis des rires' };
const motsRire: Mot[] = [['attends', 2999.2, 2999.6], ['NON', 3000.1, 3000.5, 1], ['!', 3000.5, 3000.6]];

describe('transcription des moments', () => {
  it('écoute de 15 s avant à 8 s après chaque pic (v3 : la mise en place), triées, réunies si elles se chevauchent', () => {
    const r = recetteATranscrire([rire, calme], SOURCE);
    expect(r.plans).toEqual([{ de: 985, a: 1008 }, { de: 2985, a: 3008 }]);
    const proche = { ...calme, id: 'm09', pic: 1020 };
    expect(recetteATranscrire([calme, proche], SOURCE).plans).toEqual([{ de: 985, a: 1028 }]);
    expect(r.sources[0]!.id).toBe('s1');
  });

  it('range les mots en temps source dans chaque moment', () => {
    const autres: Mot[] = [['loin', 5000, 5000.4]];
    const [a, b] = rangerMots([calme, rire], [...motsRire, ...autres], SOURCE.duree);
    expect(a!.mots).toBeUndefined();
    expect(b!.mots).toHaveLength(3);
    expect(b!.extrait).toBe('attends NON!');
  });
});

describe('mode sans IA', () => {
  it('choisit les N meilleurs moments, un brouillon normalisé chacun', () => {
    const p = clipsSansIA([calme, rire], SOURCE, 1);
    expect(p).toHaveLength(1);
    const r = p[0]!.recette;
    expect(r.statut).toBe('brouillon');
    expect(r.plans[0]!.m).toBe('m02');
    expect(p[0]!.raison).toBe('Pic de son, puis des rires');
    expect(p[0]!.problemes.filter((x) => x.niveau === 'bloquant')).toEqual([]);
  });

  it('plan de 12 à 30 s raconté (sans mots ni signaux : 8 s avant le pic), zoom punch au pic, sans bruitage', () => {
    const r = clipsSansIA([calme], SOURCE, 5)[0]!.recette;
    const plan = r.plans[0]!;
    expect(plan.de).toBe(992);
    expect(plan.a - plan.de).toBeGreaterThanOrEqual(12);
    expect(plan.a - plan.de).toBeLessThanOrEqual(30);
    expect(r.zooms).toEqual([expect.objectContaining({ ts: 1000, style: 'punch' })]);
    expect(r.sons).toEqual([]);
    expect(r.textes[0]).toEqual(expect.objectContaining({ role: 'accroche', txt: 'ATTENDS LA FIN…', t: 0 }));
    expect(r.sousTitres?.mots).toBe('auto');
    expect(r.titre).toBe('Calme puis gros pic à 16:40');
  });

  it('accroche et sous-titres tirés de la transcription quand elle est courte et forte', () => {
    const [avecMots] = rangerMots([rire], motsRire, SOURCE.duree);
    const r = clipsSansIA([avecMots!], SOURCE, 1)[0]!.recette;
    expect(r.textes[0]!.txt).toBe('ATTENDS NON!');
    expect(r.titre).toBe('Attends non!');
    expect(Array.isArray(r.sousTitres?.mots) && r.sousTitres.mots.length).toBe(3);
    expect((r.sousTitres!.mots as Mot[])[1]).toEqual(['NON', 3000.1, 3000.5, 1]);
  });

  it('un extrait long ou plat ne fait pas d\'accroche : on prend la raison', () => {
    const plat: Moment = { ...rire, extrait: 'bon alors on va aller voir là-bas pour la quête', mots: undefined };
    expect(accrocheDuMoment(plat)).toBe('MORT DE RIRE');
    expect(titreDuMoment(plat)).toBe('Fou rire à 50:00');
    expect(heure(3725)).toBe('1:02:05');
    // Arrondi au plus proche : un pic à 59,98 s est « à 1:00 », pas « à 0:59 ».
    expect(heure(59.98)).toBe('1:00');
    expect(heure(299.6)).toBe('5:00');
    expect(heure(59.4)).toBe('0:59');
  });

  it('sans sous-titres automatiques si demandé, et clips variés', () => {
    const p = clipsSansIA([calme, { ...calme, id: 'm03', pic: 2000, debut: 1994, fin: 2004 }], SOURCE, 2, { sansMots: 'aucun' });
    expect(p[0]!.recette.sousTitres).toBeNull();
    expect(p[0]!.recette.textes[0]!.txt).not.toBe(p[1]!.recette.textes[0]!.txt);
  });

  it('de bout en bout sur le signal fabriqué : le meilleur clip contient un moment connu', () => {
    const s = signalSynthetique();
    const moments = candidats(s);
    const source = { ...SOURCE, duree: s.duree };
    const [premier] = clipsSansIA(moments, source, 3);
    const plan = premier!.recette.plans[0]!;
    const connus = [CONNUS.calmePic, CONNUS.rire, CONNUS.cri];
    expect(connus.some((t) => t >= plan.de && t <= plan.a)).toBe(true);
  });
});
