// Tests des mesures du banc réel. PURS : petites données fabriquées à la main + verite.json du dépôt (temps et
// étiquettes seulement) ; aucun fichier privé, aucun ffmpeg, aucun modèle.
//   npx vitest run --config tests/banc-reel/mesures/vitest.config.ts

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Recette } from '../../../src/recette/types';
import { afficher, correspondance, familleDe, mesurer, restreindreVerite, type Activite, type Mesure, type Resultats, type Verite } from './mesurer';
import { recetteParfaite } from './plafond';
import {
  bordsDeCoupe,
  bruitDeFond,
  dansUnMot,
  fusionner,
  Grille,
  intersection,
  intervallesMots,
  lireMontage,
  longueur,
  recouvrement,
  sourceA,
  versSortie,
  versSource,
  voixDesDeuxCotes,
  type Iv,
} from './temps';

const val = (r: Resultats, cle: string): Mesure => {
  const m = r.mesures.find((x) => x.cle === cle);
  if (!m) throw new Error(`mesure ${cle} absente`);
  return m;
};

/** Une recette minimale (une vidéo de 100 s) avec ces plans. */
function recette(plans: Recette['plans'], plus: Partial<Recette> = {}): Recette {
  return {
    format: 'arko.recette/1',
    sources: [{ id: 's1', nom: 'v.mp4', taille: 1, emp: 'e', duree: 100, type: 'video', l: 1280, h: 720 }],
    plans,
    mise: { type: 'flou' },
    textes: [],
    sousTitres: null,
    sons: [],
    zooms: [],
    guide: null,
    boucle: false,
    export: {},
    destination: 'youtube',
    ...plus,
  };
}

/**
 * Une petite vérité fabriquée : accroche (copie de 21,55–23 s), séquence A (10–14 s, Romain parle 10,5–12 s) et
 * séquence B (20–24 s, Guts parle 20,5–23 s, punchline 21–22,2 s), un sous-titre de Romain.
 */
function petiteVerite(): Verite {
  return {
    format: 'arko.banc-verite/1',
    duree: 9.45,
    accroche: { sortie: [0, 1.45], morceaux: [0], plages: [[21.55, 23]] },
    sequences: [
      { id: 'A', plages: [[10, 14]], duree: 4, musique: 'm' },
      { id: 'B', plages: [[20, 24]], duree: 4, musique: 'm' },
    ],
    morceaux: [
      { i: 0, sequence: 'accroche', de: 21.55, a: 23, t0: 0, t1: 1.45, zoom: 1 },
      { i: 1, sequence: 'A', de: 10, a: 14, t0: 1.45, t1: 5.45, zoom: 1.32 },
      { i: 2, sequence: 'B', de: 20, a: 24, t0: 5.45, t1: 9.45, zoom: 1 },
    ],
    parole: { R: [[10.5, 12]], G: [[20.5, 23]] },
    persoMontre: { R: [[10.4, 12.35]], G: [[20.4, 23.35]] },
    phrases: [
      { i: 0, p: 'G', emo: 'crie', sit: null, accroche: true, sequence: 'accroche', sortie: [0, 1.45], montre: [[21.55, 23]], bouche: [[21.6, 23]] },
      { i: 1, p: 'R', emo: 'rit', sit: null, accroche: false, sequence: 'A', sortie: [2.4, 4.35], montre: [[10.4, 12.35]], bouche: [[10.5, 12]] },
      { i: 2, p: 'G', emo: 'crie', sit: null, accroche: false, sequence: 'B', sortie: [6.4, 9.35], montre: [[20.4, 23.35]], bouche: [[20.5, 23]] },
    ],
    punchlines: [{ i: 0, accroche: false, sequence: 'B', sortie: [7, 8.2], source: [[21, 22.2]], nMots: 3, p: 'G' }],
    sousTitres: [{ i: 0, accroche: false, sequence: 'A', sortie: [2.5, 4], source: [[10.5, 12]], nMots: 5, p: 'R' }],
    musique: { morceaux: [{ nom: 'm', t0: 1.45, t1: 9.45 }] },
  };
}

describe('intervalles et grille', () => {
  it('fusionne, mesure, recouvre, croise', () => {
    const f = fusionner([[3, 4], [0, 1], [0.5, 2], [4, 5]]);
    expect(f).toEqual([[0, 2], [3, 5]]);
    expect(longueur(f)).toBe(4);
    expect(recouvrement(f, [1, 3.5])).toBeCloseTo(1.5);
    expect(intersection(f, [[1, 4]])).toEqual([[1, 2], [3, 4]]);
  });
  it('marque les cases dont le milieu tombe dans un intervalle', () => {
    const g = new Grille(0.1, 1);
    const t = g.marquer([[0.2, 0.5]]);
    expect(Array.from(t)).toEqual([0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
  });
  it('lit les mots sous toutes leurs formes, sans garder le texte', () => {
    expect(intervallesMots({ mots: [['b', 2, 3], ['a', 1, 1.5]] })).toEqual([[1, 1.5], [2, 3]]);
    expect(intervallesMots([{ ts: 1, fin: 2 }, { de: 3, a: 4 }])).toEqual([[1, 2], [3, 4]]);
  });
});

describe('montage : temps source ↔ temps de sortie', () => {
  const r = recette([{ de: 50, a: 52 }, { de: 10, a: 14, trans: 'glitch' }, { de: 14, a: 16 }, { de: 20, a: 24 }]);
  const m = lireMontage(r);
  it('trouve l’accroche (plans avant le « glitch ») et place les plans', () => {
    expect(m.nbAccroche).toBe(1);
    expect(m.finAccroche).toBeCloseTo(2);
    expect(m.duree).toBeCloseTo(12);
    expect(sourceA(m, 2.5)).toBeCloseTo(10.5);
    expect(versSortie(m, [13, 15])).toEqual([[5, 6], [6, 7]]);
    expect(versSource(m, [7.5, 8.5])).toEqual([[15.5, 16], [20, 20.5]]);
  });
  it('deux plans qui se suivent dans la source ne font pas de coupe', () => {
    const b = bordsDeCoupe(m).map((x) => `${x.cote}@${x.ts}`);
    expect(b).toEqual(['debut@50', 'fin@52', 'debut@10', 'fin@16', 'debut@20', 'fin@24']);
  });
  it('coupe en plein mot : strictement dans un mot, à 30 ms près de ses bords', () => {
    const mots: Iv[] = [[1, 1.5], [2, 2.4]];
    expect(dansUnMot(mots, 1.2, 0.03)).toBe(true);
    expect(dansUnMot(mots, 1.48, 0.03)).toBe(false);
    expect(dansUnMot(mots, 1.7, 0.03)).toBe(false);
    expect(dansUnMot(mots, 2.1, 0.03)).toBe(true);
  });
});

describe('voix forte autour d’une coupe', () => {
  // 20 s de silence numérique (−100 dB), une voix à −30 dB de 5 à 6 s.
  const db = new Float32Array(1000).fill(-100);
  for (let k = 250; k < 300; k++) db[k] = -30;
  const act: Activite = { pas: 0.02, db };
  const bruit = bruitDeFond(act, 5, 0.1);
  it('une coupe qui tranche la voix compte, une coupe à sa fin ne compte pas', () => {
    expect(voixDesDeuxCotes(act, bruit, 5.5, 0.06, 10, -40).forte).toBe(true);
    expect(voixDesDeuxCotes(act, bruit, 6.0, 0.06, 10, -40).forte).toBe(false);
    expect(voixDesDeuxCotes(act, bruit, 8, 0.06, 10, -40).forte).toBe(false);
  });
  it('une voix trop faible (sous −40 dB) ne compte pas', () => {
    const faible = Float32Array.from(db, (x) => (x > -100 ? -50 : x));
    const a2: Activite = { pas: 0.02, db: faible };
    expect(voixDesDeuxCotes(a2, bruitDeFond(a2, 5, 0.1), 5.5, 0.06, 10, -40).forte).toBe(false);
  });
});

describe('correspondance et émotions', () => {
  it('chaque voix d’Arko va à la personne qu’elle recouvre le plus', () => {
    const c = correspondance(
      [{ p: 'v1', ts: 0, fin: 2 }, { p: 'v2', ts: 5, fin: 6 }, { p: 'v3', ts: 50, fin: 51 }],
      { R: [[0, 1.5]], G: [[4, 7]] },
    );
    expect(c.get('v1')).toBe('R');
    expect(c.get('v2')).toBe('G');
    expect(c.get('v3')).toBe(null);
  });
  it('familles d’émotions', () => {
    expect(familleDe('rit')).toBe(familleDe('mortDeRire'));
    expect(familleDe('crie')).toBe(familleDe('enerve'));
    expect(familleDe('frime')).not.toBe(familleDe('triste'));
  });
});

describe('mesures sur une petite vérité', () => {
  const v = petiteVerite();
  const mots: Iv[] = [[10.5, 11.2], [11.3, 12], [20.5, 21.5], [21.6, 22.2], [22.3, 23]];

  it('le montage parfait (plafond) atteint les cibles qu’il peut atteindre', () => {
    const { recette: r, analyse } = recetteParfaite(v);
    const res = mesurer({ verite: v, recette: r, analyse, mots });
    expect(val(res, 'voix.nombre').ok).toBe(true);
    expect(val(res, 'voix.temps').valeur).toBeGreaterThan(0.99);
    expect(val(res, 'voix.phrases').valeur).toBe(1);
    expect(val(res, 'scenes.sequences').valeur).toBe(1);
    expect(val(res, 'scenes.punchlines').valeur).toBe(1);
    expect(val(res, 'scenes.punchlinesArko').valeur).toBe(1);
    expect(val(res, 'cuts.pleinMot').valeur).toBe(0);
    expect(val(res, 'cuts.plansCourts').valeur).toBe(0);
    expect(val(res, 'musique.presence').valeur).toBeCloseTo(1);
    expect(val(res, 'musique.baisse').ok).toBe(true);
    expect(val(res, 'musique.lufs').ok).toBe(true);
    expect(val(res, 'persos.bon').valeur).toBeGreaterThan(0.99);
    expect(val(res, 'persos.mauvais').valeur).toBe(0);
    expect(val(res, 'persos.emotions').valeur).toBe(1);
    expect(val(res, 'sousTitres.pour').ok).toBe(true);
    expect(val(res, 'sousTitres.recouverts').valeur).toBe(1);
    // 10 s de montage : la durée (15–20 min) n'est pas atteinte, c'est normal ici.
    expect(val(res, 'duree.totale').ok).toBe(false);
    expect(afficher(res)).toContain('Score');
  });

  it('cible « en plein mot » sur les mots NETTOYÉS + la VAD ; les mots bruts restent indicatifs (décision du 7/11)', () => {
    const r = recette([{ de: 10, a: 11 }, { de: 20.8, a: 24 }]);
    // Mots nettoyés : les mêmes, mais le mot 10,5–11,2 a été ramené à 10,5–10,9 (étiré sur un silence).
    const nett: [number, number][] = (mots as [number, number][]).map(([a, b]) => (a === 10.5 ? [10.5, 10.9] : [a, b]));
    const sansVad = mesurer({ verite: v, recette: r, mots, motsNettoyes: nett });
    expect(val(sansVad, 'cuts.pleinMot').valeur).toBe(1); // seule la coupe de 20,8 s reste dans un mot
    expect(val(sansVad, 'cuts.pleinMotBrut').valeur).toBe(2);
    expect(val(sansVad, 'cuts.pleinMotBrut').ok).toBeNull();
    // VAD de référence : parole pendant 20,5–21,5 s → la coupe de 20,8 s est en pleine parole (dit dans le texte).
    const p = new Uint8Array(1000);
    for (let k = Math.floor(20.5 / 0.032); k < Math.ceil(21.5 / 0.032); k++) p[k] = 230;
    const avecVad = mesurer({ verite: v, recette: r, mots, motsNettoyes: nett, vad: { pas: 0.032, p } });
    expect(val(avecVad, 'cuts.pleinMot').texte).toContain('pleine parole');
    expect(val(avecVad, 'cuts.pleinMot').detail).toContain('Arko 1 /');
  });

  it('un mauvais montage est vu : coupes en plein mot, séquence perdue, pas de musique, mauvais perso', () => {
    // p1 couvre la phrase de Romain ET le début de celle de Guts : p1 → R, p2 → G ; pendant 20,8–21,4 s (et la tenue
    // de 0,5 s), c'est le perso de Romain qui est montré alors que Guts parle.
    const r = recette([{ de: 10, a: 11 }, { de: 20.8, a: 24 }], {
      personnes: [{ id: 'p1', nom: 'A' }, { id: 'p2', nom: 'B' }],
      paroles: [
        { ts: 10.5, fin: 12, p: 'p1' },
        { ts: 20.8, fin: 21.4, p: 'p1' },
        { ts: 21.4, fin: 23, p: 'p2' },
      ],
      avatars: { mode: 'parle' },
    });
    const res = mesurer({ verite: v, recette: r, mots });
    // Coupes à 11 s (dans le mot 10,5–11,2) et à 20,8 s (dans 20,5–21,5) ; 10 s et 24 s tombent hors des mots.
    expect(val(res, 'cuts.pleinMot').valeur).toBe(2);
    expect(val(res, 'cuts.pleinMot').ok).toBe(false);
    expect(val(res, 'scenes.sequences').valeur).toBe(0.5); // B gardée à 80 %, A à 25 %
    expect(val(res, 'scenes.punchlines').valeur).toBe(1);
    expect(val(res, 'scenes.punchlinesArko').valeur).toBe(0);
    expect(val(res, 'musique.presence').ok).toBe(false);
    expect(val(res, 'persos.mauvais').valeur).toBeGreaterThan(0.3);
    expect(val(res, 'persos.mauvais').ok).toBe(false);
    expect(val(res, 'persos.bon').valeur).toBeGreaterThan(0.6);
    expect(val(res, 'persos.bon').valeur).toBeLessThan(0.9);
  });

  it('des voix toutes sur la même personne donnent la moitié des phrases fausses', () => {
    const { recette: r } = recetteParfaite(v);
    const res = mesurer({
      verite: v,
      recette: r,
      analyse: { voix: { src: 's1', methode: 'une', voix: [{ id: 'p1', niveauDb: -30, part: 1 }], tours: [{ ts: 0, fin: 30, p: 'p1' }], sure: 1 } },
      mots,
    });
    expect(val(res, 'voix.nombre').ok).toBe(false);
    expect(val(res, 'voix.phrases').valeur).toBe(0.5);
  });

  it('réduit la vérité à une partie de la source', () => {
    const w = restreindreVerite(v, [0, 15]);
    expect(w.sequences.map((s) => s.id)).toEqual(['A']);
    expect(w.punchlines).toHaveLength(0);
    expect(w.accroche).toBe(null);
    expect(w.morceaux.map((m) => m.de)).toEqual([10]);
  });
});

describe('verite.json du dépôt', () => {
  const v = JSON.parse(readFileSync(new URL('../verite/verite.json', import.meta.url), 'utf8')) as Verite & { resume: Record<string, unknown> };

  it('a les chiffres attendus (19 séquences, ~16 min 30)', () => {
    expect(v.sequences).toHaveLength(19);
    expect(v.duree).toBeGreaterThan(16 * 60);
    expect(v.duree).toBeLessThan(17 * 60);
    expect(v.punchlines.length).toBeGreaterThan(40);
    expect(v.sousTitres.length).toBeGreaterThan(200);
  });

  it('ne contient aucun texte prononcé (seulement des étiquettes et des phrases d’explication)', () => {
    const chaines: string[] = [];
    const parcourir = (x: unknown) => {
      if (typeof x === 'string') chaines.push(x);
      else if (Array.isArray(x)) x.forEach(parcourir);
      else if (x && typeof x === 'object') Object.values(x).forEach(parcourir);
    };
    parcourir(v);
    const permis = /^([0-9]{2}(_[0-9])?|hook_0|accroche|[RG]|gauche|droite|jaune|rouge|aucune|Titre|Gros|[a-zA-Z]+|arko\.banc-verite\/1|[a-z]+ [0-9.]+→[0-9.]+|[0-9]+ min [0-9.]+ s)$/;
    const explications = new Set(Object.values((v as unknown as { conventions: Record<string, string> }).conventions));
    const autres = chaines.filter((s) => !permis.test(s) && !explications.has(s));
    // Les seules autres chaînes : origine, crédit et titres des musiques (Kevin MacLeod), contrôle de durée.
    expect(autres.every((s) => /Kevin MacLeod|Montage à la main|Monkeys|Snitch|Duck|Investigations|Weasel|Pizzicato|16 min 30/.test(s))).toBe(true);
  });

  it('le plafond (vérité contre elle-même) atteint toutes les cibles sauf celles qui demandent l’activité', () => {
    const { recette: r, analyse, mots } = recetteParfaite(v);
    const res = mesurer({ verite: v, recette: r, analyse, mots });
    const manquees = res.mesures.filter((x) => x.ok === false).map((x) => x.cle);
    expect(manquees).toEqual([]);
    expect(val(res, 'voix.phrases').valeur).toBe(1);
    expect(val(res, 'scenes.sequences').valeur).toBe(1);
    expect(val(res, 'duree.totale').ok).toBe(true);
    // Une seule coupe « dans la parole » : la fin de l'accroche, qui coupe une phrase (elle continue dans la séquence 14).
    expect(val(res, 'cuts.pleinMot').valeur).toBeLessThanOrEqual(1);
    expect(val(res, 'cuts.pleinMot').ok).toBe(true);
  });
});
