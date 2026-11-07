// « Sous-titres précis » (dev-mots-2) : quoi réécouter (tours de la voix sous-titrée dans les séquences gardées) et
// les mots de la 2ᵉ passe à la place de ceux d'avant, puis le montage qui s'en sert (sous-titres, punchlines, persos).
// Transcription FABRIQUÉE : aucun modèle, aucun ffmpeg, aucune donnée privée.

import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import type { Mot, Source, TourDeParole } from '../../recette/types';
import type { SignauxSource } from '../types';
import type { EmpreintesVoix } from '../types-v3';
import type { AnalyseV4, MesuresSource, ProbasVad, SequenceV4 } from '../types-v4';
import { analyserChaine, monterChaine, recetteDeDepart, reglagesBestOfV4, revueParDefaut } from '../express/chaine-best-of';
import { avecMotsPrecis, bilanPrecis, PASSE_PRECISE, plagesPrecises } from './passe-precise';

const seq = (de: number, a: number, garde = true): SequenceV4 => ({ de, a, garde, titre: '', raison: '', score: 50, duree: a - de }) as unknown as SequenceV4;

/** Une analyse réduite à ce que la passe précise lit. */
function analyse(o: { tours: TourDeParole[]; mots?: Mot[]; morceaux?: { de: number; a: number }[]; parole?: 'mots' | 'voix' }): AnalyseV4 {
  return {
    parole: o.parole ?? 'mots',
    transcription: { src: 's1', mots: o.mots ?? [], plages: [{ de: 0, a: 600 }], complete: true },
    voix: { src: 's1', methode: 'niveau', voix: [{ id: 'p1', niveauDb: -25, part: 0.5 }, { id: 'p2', niveauDb: -40, part: 0.5 }], tours: o.tours, sure: 1, separation: {} },
    morceaux: (o.morceaux ?? []).map((m) => ({ ...m, raison: 'parole' })),
    paroleDetectee: { src: 's1', methode: 'mots', segments: [], probas: null, part: 0 },
    energie: null,
  } as unknown as AnalyseV4;
}

describe('Sous-titres précis : ce qu\'on réécoute', () => {
  const tours: TourDeParole[] = [
    { ts: 10, fin: 12, p: 'p2' },
    { ts: 12.2, fin: 13, p: 'p2' }, // collé au précédent (marge) : un seul bout
    { ts: 15, fin: 16, p: 'p1' }, // l'autre voix : jamais
    { ts: 48, fin: 52, p: 'p2' }, // à cheval sur la fin de la séquence 20–50 : coupé à 50
    { ts: 70, fin: 72, p: 'p2' }, // séquence décochée : rien
    { ts: 120, fin: 121, p: 'p2' }, // hors séquence : rien
  ];
  const revue = { scenes: [seq(60, 80, false), seq(5, 50)], sousTitresPour: 'p2' };

  it('les tours de la voix sous-titrée dans les séquences gardées, avec 0,3 s de marge, fusionnés et coupés aux bords', () => {
    const p = plagesPrecises(analyse({ tours }), revue);
    expect(PASSE_PRECISE.marge).toBe(0.3);
    expect(p).toEqual([
      { de: 9.7, a: 13.3 },
      { de: 47.7, a: 50 },
    ]);
  });

  it('personne de sous-titré, pas de voix, rien de coché : rien à réécouter', () => {
    expect(plagesPrecises(analyse({ tours }), { ...revue, sousTitresPour: null })).toEqual([]);
    expect(plagesPrecises({ ...analyse({ tours }), voix: null }, revue)).toEqual([]);
    expect(plagesPrecises(analyse({ tours }), { ...revue, scenes: [seq(5, 50, false)] })).toEqual([]);
  });

  it('un tour qu\'aucun morceau gardé par les coupes ne touche n\'est pas réécouté', () => {
    const p = plagesPrecises(analyse({ tours, morceaux: [{ de: 11, a: 12.5 }] }), revue);
    expect(p).toEqual([{ de: 9.7, a: 13.3 }]);
  });
});

describe('Sous-titres précis : les mots de la 2ᵉ passe', () => {
  const avant: Mot[] = [
    ['salut', 5, 5.4],
    ['on', 10.1, 10.3], // dans le tour réécouté
    ['va', 10.4, 10.6], // dans le tour réécouté
    ['bien', 30, 30.4],
  ];
  const plages = [{ de: 9.7, a: 13.3 }];

  it('dans les plages réécoutées, les mots précis remplacent ceux d\'avant ; ailleurs rien ne bouge ; triés', () => {
    const a = analyse({ tours: [], mots: avant });
    const precis: Mot[] = [['on', 10.1, 10.25], ['y', 10.3, 10.4], ['va', 10.45, 10.6], ['là-bas !', 10.7, 11.2, 1], ['hors', 40, 40.2]];
    const b = avecMotsPrecis(a, plages, precis);
    expect(b.transcription.mots.map((m) => m[0])).toEqual(['salut', 'on', 'y', 'va', 'là-bas !', 'bien']);
    // Le mot fort (4ᵉ champ) est gardé ; un mot précis HORS des plages est ignoré (on ne réécoute que les plages).
    expect(b.transcription.mots.find((m) => m[0].startsWith('là'))?.[3]).toBe(1);
    expect(a.transcription.mots).toEqual(avant);
    expect(bilanPrecis(a, b, plages)).toEqual({ avant: 2, apres: 4, secondes: 3.6 });
  });

  it('les mots précis passent par le même nettoyage (une boucle de Whisper est retirée)', () => {
    const boucle: Mot[] = [];
    for (let k = 0; k < 8; k++) boucle.push(['il', 10 + k * 0.3, 10.1 + k * 0.3], ['y', 10.1 + k * 0.3, 10.2 + k * 0.3], ['a', 10.2 + k * 0.3, 10.3 + k * 0.3]);
    const b = avecMotsPrecis(analyse({ tours: [], mots: avant }), plages, boucle);
    expect(b.transcription.mots.filter((m) => m[1] >= 9.7 && m[1] < 13.3).length).toBeLessThan(boucle.length);
  });

  it('mode voix ou rien réécouté : l\'analyse telle quelle', () => {
    const a = analyse({ tours: [], mots: avant, parole: 'voix' });
    expect(avecMotsPrecis(a, plages, [['x', 10, 10.2]])).toBe(a);
    const m = analyse({ tours: [], mots: avant });
    expect(avecMotsPrecis(m, [], [['x', 10, 10.2]])).toBe(m);
  });
});

/* ------------------------------------------------------------------ bout à bout : le montage avec les mots précis */

const DUREE = 900;
const PAS = 0.02;
const r2 = (x: number) => Math.round(x * 100) / 100;

function echange(de: number, a: number, textes: string[][]): { mots: Mot[]; tours: TourDeParole[] } {
  const mots: Mot[] = [];
  const tours: TourDeParole[] = [];
  let k = 0;
  for (let t = de; t + 2 <= a; t += 2.6, k++) {
    const txt = textes[k % textes.length]!;
    txt.forEach((x, i) => mots.push([x, r2(t + i * 0.4), r2(t + i * 0.4 + 0.3)]));
    tours.push({ ts: r2(t), fin: r2(t + (txt.length - 1) * 0.4 + 0.3), p: k % 2 === 0 ? 'p1' : 'p2' });
  }
  return { mots, tours };
}

const PHRASES = [['on', 'va', 'au', 'château', 'maintenant'], ['je', 'cherche', 'du', 'bois', 'ici'], ['non!', 'putain', 'le', 'creeper', 'là']];
const PARTIES = [echange(10, 40, PHRASES), echange(100, 125, PHRASES), echange(200, 400, PHRASES), echange(500, 520, PHRASES)];
const MOTS = PARTIES.flatMap((p) => p.mots);
const TOURS = PARTIES.flatMap((p) => p.tours);

function mesures(): MesuresSource {
  const n = DUREE / PAS;
  const db = new Float32Array(n).fill(-100);
  const bandes = new Float32Array(n * 8).fill(-100);
  for (const t of TOURS) {
    const niveau = t.p === 'p1' ? -40 : -25;
    for (let k = Math.floor(t.ts / PAS); k < Math.ceil(t.fin / PAS); k++) {
      db[k] = niveau + (k % 5) - 2;
      for (let b = 0; b < 8; b++) bandes[k * 8 + b] = niveau - (t.p === 'p1' ? b : 8 - b);
    }
  }
  const empreintes: EmpreintesVoix = { pas: PAS, duree: DUREE, db, bandes };
  const pv = 0.032;
  const p = new Uint8Array(Math.ceil(DUREE / pv)).fill(5);
  for (const t of TOURS) for (let k = Math.floor(t.ts / pv); k < Math.ceil(t.fin / pv); k++) p[k] = 230;
  const vad: ProbasVad = { src: 's1', pas: pv, p, plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' };
  const signaux: SignauxSource = {
    src: 's1',
    duree: DUREE,
    pas: PAS,
    rms: new Float32Array(n).fill(0.01),
    pics: [{ ts: 20, db: -6, z: 5 }],
    cris: [{ de: 350, a: 351, t: 350.5, force: 0.8 }],
    rires: [{ de: 21, a: 23, t: 22, force: 0.6 }],
    muets: [{ de: 600, a: DUREE }],
  };
  return {
    src: 's1',
    duree: DUREE,
    signaux,
    empreintes: [empreintes],
    pistesSeparees: false,
    vad,
    hauteur: null,
    transcription: { src: 's1', mots: MOTS, plages: [{ de: 0, a: DUREE }], complete: true },
    neurales: null,
    cadreBords: null,
    modules: { whisper: 'present', vad: 'present', empreinte: 'absent' },
    avertissements: [],
  };
}

const SOURCE: Source = { id: 's1', nom: 'session.mp4', taille: 1, emp: 'test-precis', duree: DUREE, type: 'video', l: 1280, h: 720 };

describe('Sous-titres précis : le montage se sert des mots de la 2ᵉ passe', () => {
  it('sous-titres = mots précis dans les tours de la voix faible, mots de base ailleurs ; mêmes coupes, même durée', () => {
    const { express, bestOf } = reglagesBestOfV4('youtube');
    const reg = { ...express, dureeVisee: { min: 60, max: 120 }, musiqueAuto: false };
    const a = analyserChaine(mesures(), reg, bestOf);
    const revue0 = revueParDefaut(a);
    const faible = [...(a.voix?.voix ?? [])].sort((x, y) => x.niveauDb - y.niveauDb)[0]!.id;
    const revue = { ...revue0, sousTitresPour: revue0.sousTitresPour ?? faible };
    const plages = plagesPrecises(a, revue);
    expect(plages.length).toBeGreaterThan(0);
    // La « 2ᵉ passe » fabriquée : un mot « précis » au milieu de chaque tour réécouté.
    const precis: Mot[] = plages.map((p) => ['précis', r2((p.de + p.a) / 2 - 0.15), r2((p.de + p.a) / 2 + 0.15)]);
    const a2 = avecMotsPrecis(a, plages, precis);
    const depart = recetteDeDepart(SOURCE, 'youtube', 'Best-of — session');
    const r1 = monterChaine(depart, a, revue, reg, bestOf, null);
    const r2_ = monterChaine(depart, a2, revue, reg, bestOf, null);
    const mots1 = Array.isArray(r1.sousTitres?.mots) ? r1.sousTitres.mots : [];
    const mots2 = Array.isArray(r2_.sousTitres?.mots) ? r2_.sousTitres.mots : [];
    expect(mots1.some((m) => m[0] === 'précis')).toBe(false);
    expect(mots2.filter((m) => m[0] === 'précis').length).toBeGreaterThan(0);
    const dans = (m: Mot) => plages.some((p) => (m[1] + m[2]) / 2 >= p.de && (m[1] + m[2]) / 2 < p.a);
    expect(mots2.filter(dans).every((m) => m[0] === 'précis')).toBe(true);
    expect(mots2.filter((m) => !dans(m))).toEqual(mots1.filter((m) => !dans(m)));
    // Les coupes ne bougent pas : mêmes plans (hors accroche, qui suit les mots), durée à moins d'une seconde près.
    expect(Math.abs(compiler(r2_).duree - compiler(r1).duree)).toBeLessThan(1);
    expect(r2_.sousTitres?.pour).toBe(revue.sousTitresPour);
  });
});
