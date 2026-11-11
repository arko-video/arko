// Best-of serré (intégrateur) : scènes notées et resserrées, passages pas retenus, ordre du contrat §6 (étapes du
// Montage express → passages → qui parle → chibis + avatars → sous-titres pour la voix faible → bips), titres
// facultatifs, un seul Annuler.

import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { modeleMeilleurDAbord } from '../../recette/modeles';
import { normaliser } from '../../recette/normaliser';
import { annuler, nouvelHistorique, pousser, sousTitresPour } from '../../recette/operations';
import type { Mot, Recette, TourDeParole } from '../../recette/types';
import type { SignauxSource } from '../types';
import type { VoixDetectees } from '../types-v3';
import { chibiAuHasard } from '../../chibis/hasard';
import {
  BEST_OF_DEFAUT,
  chibiParDefaut,
  construireBestOf,
  passagesRestants,
  plagesGardees,
  scenesBestOf,
  voixMalEntendue,
  type AnalyseBestOf,
  type SceneBestOf,
} from './best-of';
import type { AnalyseExpress, ReglagesExpress } from './express';

const DUREE = 900;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Phrases de 5 mots (0,4 s par mot) de `de` à `a`, séparées de 0,6 s ; voix p1 / p2 en alternance. */
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

const NORMAL = [['on', 'va', 'au', 'château', 'maintenant'], ['je', 'cherche', 'du', 'bois', 'ici']];
const FORT = [['non!', 'putain', 'le', 'creeper', 'là'], ['mdr', 'il', 'a', 'tout', 'explosé!']];
// 4 scènes : A (courte, drôle), B (calme), C (200 s d'échanges avec un fou rire : protégée, longue → resserrée), D.
const PARTIES = [echange(10, 40, FORT), echange(100, 125, NORMAL), echange(200, 400, [...NORMAL, ...FORT]), echange(500, 520, NORMAL)];
const MOTS = PARTIES.flatMap((p) => p.mots);
const TOURS = PARTIES.flatMap((p) => p.tours);

const SIGNAUX: SignauxSource = {
  src: 's1',
  duree: DUREE,
  pas: 0.02,
  rms: new Float32Array(DUREE * 50).fill(0.01),
  pics: [{ ts: 20, db: -6, z: 5 }, { ts: 299, db: -5, z: 6 }],
  cris: [{ de: 350, a: 351, t: 350.5, force: 0.8 }],
  rires: [{ de: 21, a: 23, t: 22, force: 0.6 }, { de: 300, a: 304, t: 302, force: 0.9 }],
  muets: [{ de: 600, a: DUREE }],
};

const VOIX: VoixDetectees = {
  src: 's1',
  methode: 'niveau+timbre',
  voix: [
    { id: 'p1', niveauDb: -40, part: 0.5 },
    { id: 'p2', niveauDb: -25, part: 0.5 },
  ],
  tours: TOURS,
  sure: 0.9,
};

function recette(destination: 'youtube' | 'tiktok' = 'youtube'): Recette {
  return normaliser({
    format: 'arko.recette/1',
    destination,
    sources: [{ id: 's1', nom: 'session.mp4', taille: 1, emp: 'e1', duree: DUREE, type: 'video', l: 1280, h: 720 }],
    plans: [{ de: 0, a: DUREE }],
    textes: [],
    sons: [],
    zooms: [],
    guide: null,
    boucle: false,
    export: {},
  }).recette;
}

const REGLAGES: ReglagesExpress = {
  dureeVisee: { min: 120, max: 180 },
  garder: 'parole+forts',
  niveauBlancs: 'serre',
  transcrire: true,
  punchlines: true,
  bruitages: true, // ignoré en Best-of
  musique: ['m1'],
  bords: false,
  zooms: 'normal',
  sections: true, // remplacé par bestOf.titres
  accroche: true,
  avecIA: false,
};
const MUSIQUE = [{ id: 'm1', nom: 'Kevin MacLeod - Monkeys.mp3', taille: 1, emp: 'b2', duree: 120, type: 'audio' as const }];

function analyse(): AnalyseBestOf {
  const base: AnalyseExpress = {
    transcription: { src: 's1', mots: MOTS, plages: [{ de: 0, a: DUREE }], complete: true },
    parole: 'mots',
    signaux: SIGNAUX,
    scenes: [],
    cadreBords: null,
    avertissements: [],
  };
  const { scenes, passages } = scenesBestOf(base, VOIX, 140);
  return { ...base, scenes, voix: VOIX, empreintes: [], passages };
}

function construire(o: { titres?: boolean; bips?: boolean; pour?: string | null; destination?: 'youtube' | 'tiktok' } = {}) {
  const a = analyse();
  const chibiGuts = chibiAuHasard(42, 'paint');
  return construireBestOf(recette(o.destination), a, a.scenes as SceneBestOf[], REGLAGES, { ...BEST_OF_DEFAUT, titres: o.titres ?? false, bips: o.bips ?? false }, {
    sourcesAudio: MUSIQUE,
    bruitages: [{ id: 'a1', ts: 20, src: 's1', vol: 0.631, dur: 2, fondu: 0.3 }],
    musique: { morceaux: [{ src: 'm1', t: 0 }] },
    noms: { p1: 'Romain', p2: 'Guts' },
    chibis: { p2: { def: chibiGuts, bib: 'c7' } },
    ...(o.pour !== undefined ? { sousTitresPour: o.pour } : {}),
  });
}

describe('scenesBestOf (derush du dev 1, vu comme des séquences)', () => {
  const a = analyse();
  const scenes = a.scenes as SceneBestOf[];

  it('la scène drôle mais longue (fou rire, 200 s) est resserrée, pas jetée', () => {
    expect(scenes).toHaveLength(4);
    const c = scenes.find((s) => s.de > 190 && s.de < 205)!;
    expect(c.protegee).toBe(true);
    expect(c.garde).toBe(true);
    expect(c.morceaux!.length).toBeGreaterThanOrEqual(1);
    expect(c.duree).toBeGreaterThan(40);
    expect(c.duree).toBeLessThan(110);
    // Le fou rire (300–304 s) est gardé avec sa mise en place (≥ 5 s avant).
    expect(c.morceaux!.some((m) => m.de <= 295 && m.a >= 304)).toBe(true);
  });

  it('passages pas retenus : morceaux enlevés de la scène resserrée, triés par note, note ≥ 20', () => {
    expect(a.passages.length).toBeGreaterThan(0);
    expect(a.passages.some((p) => p.de >= 199 && p.a <= 401)).toBe(true);
    for (const p of a.passages) expect(p.note).toBeGreaterThanOrEqual(20);
    expect(a.passages.map((p) => p.note)).toEqual([...a.passages].map((p) => p.note).sort((x, y) => y - x));
  });

  it('passagesRestants : une séquence décochée sur la revue rejoint la liste ; une cochée en sort', () => {
    const decochee = scenes.map((s, i) => (i === 0 ? { ...s, garde: false } : s));
    const res = passagesRestants(a.passages, decochee, 's1');
    expect(res.some((p) => p.de === scenes[0]!.de && p.a === scenes[0]!.a && p.src === 's1')).toBe(res.length > 0 && scenes[0]!.score >= 20);
    const toutes = scenes.map((s) => ({ ...s, garde: true, morceaux: undefined }));
    expect(passagesRestants(a.passages, toutes)).toEqual([]);
    expect(plagesGardees(scenes).length).toBeGreaterThan(scenes.filter((s) => s.garde).length - 1);
  });
});

describe('construireBestOf (ordre du contrat §6)', () => {
  const r = construire();
  const sc = compiler(r);

  it('étapes du Montage express : coupes serrées, punchlines, zooms, accroche SANS texte, chapitres, musique, −14 LUFS', () => {
    expect(r.titre).toBeUndefined(); // le titre du projet est posé par la page
    expect(r.blancs?.niveau).toBe('serre');
    expect(r.sousTitres).toMatchObject({ mode: 'punchlines', style: 'punchline' });
    expect(r.plans.some((p) => p.zoomFixe)).toBe(true);
    expect(sc.plans[0]!.t1 - sc.plans[0]!.t0).toBeCloseTo(6, 1);
    expect(r.textes).toEqual([]); // titres décochés : ni « ATTENDS… », ni titres de section
    expect((r.chapitres ?? []).length).toBeGreaterThanOrEqual(3);
    expect(r.musique?.morceaux).toHaveLength(1);
    expect(r.volumeFinal).toEqual({ lufs: -13, crete: -1.5 });
    // Jamais de bruitages en Best-of (retour de Romain), même cochés dans les réglages.
    expect(r.sons.some((s) => s.role === 'bruitage')).toBe(false);
  });

  it('la scène resserrée n\'apporte que ses morceaux (un chapitre pour la scène, pas un par morceau)', () => {
    const c = (analyse().scenes as SceneBestOf[]).find((s) => s.de > 190 && s.de < 205)!;
    const dans = r.plans.filter((p) => p.de >= c.de - 0.01 && p.a <= c.a + 0.01).slice(1);
    for (const p of dans) expect(c.morceaux!.some((m) => p.de >= m.de - 0.6 && p.a <= m.a + 0.6)).toBe(true);
  });

  it('passages, qui parle (noms), un chibi par personne (choisi ou par défaut), avatars actifs', () => {
    expect(r.derush?.passages.length).toBeGreaterThan(0);
    expect(r.personnes?.map((p) => [p.id, p.nom])).toEqual([['p1', 'Romain'], ['p2', 'Guts']]);
    expect(r.personnes![0]!.chibi).toEqual(chibiParDefaut('p1'));
    expect(r.personnes![1]!.chibi).toEqual(chibiAuHasard(42, 'paint'));
    expect(r.personnes![1]!.bib).toBe('c7');
    expect(r.paroles!.length).toBe(TOURS.length);
    expect(r.paroles!.every((t) => t.emo !== undefined)).toBe(true);
    expect(r.avatars).toEqual({ mode: 'parle', rebond: true, tenue: 1 });
    expect(r.bips).toBeUndefined();
  });

  it('sous-titres pour la voix qu\'on entend mal (p1, 15 dB sous p2) : ses phrases en boîte, en bas, jamais sur une punchline', () => {
    expect(voixMalEntendue(VOIX)).toBe('p1');
    expect(r.sousTitres?.pour).toBe('p1');
    const lignes = sc.sousTitres!.lignes;
    const voix = lignes.filter((l) => l.style === 'boite');
    const punch = lignes.filter((l) => !l.style);
    expect(voix.length).toBeGreaterThan(0);
    expect(punch.length).toBeGreaterThan(0);
    for (const l of voix) {
      expect(l.y).toBe(0.88);
      // 0,7 s au moins, sauf si la ligne suivante commence avant (elle s'arrête alors pile où elle commence).
      const suivante = lignes.find((x) => x.t0 >= l.t1 - 1e-6 && x !== l);
      if (l.t1 - l.t0 < 0.69) expect(suivante && Math.abs(suivante.t0 - l.t1) < 1e-6).toBe(true);
      // Chaque mot est dit par p1.
      for (const m of l.mots) expect(TOURS.some((t) => t.p === 'p1' && m.mot[1] >= t.ts - 0.01 && m.mot[2] <= t.fin + 0.01)).toBe(true);
      for (const x of punch) expect(l.t0 < x.t1 && x.t0 < l.t1).toBe(false);
    }
    // Triées et sans chevauchement (une ligne à la fois).
    for (let i = 1; i < lignes.length; i++) expect(lignes[i]!.t0).toBeGreaterThanOrEqual(lignes[i - 1]!.t1 - 1e-9);
  });

  it('options : titres cochés → « ATTENDS… » + titres de section ; bips ; sous-titres pour personne', () => {
    const avec = construire({ titres: true, bips: true, pour: null });
    expect(avec.textes.find((x) => x.role === 'accroche')?.txt).toBe('ATTENDS…');
    expect(avec.textes.some((x) => x.role === 'section')).toBe(true);
    expect(avec.bips).toEqual({ son: 'bip' });
    expect(avec.sousTitres?.pour).toBeUndefined();
    expect(compiler(avec).sousTitres!.lignes.some((l) => l.style)).toBe(false);
    // Les titres restent retirables un par un (ce sont des textes ordinaires).
    expect(avec.textes.every((x) => typeof x.txt === 'string')).toBe(true);
  });

  it('montage normal : idempotent, un seul Annuler revient à la vidéo brute ; en vertical pas de chapitres', () => {
    const { recette: deux, problemes } = normaliser(JSON.parse(JSON.stringify(r)));
    expect(problemes.filter((p) => p.niveau === 'bloquant')).toEqual([]);
    expect(deux).toEqual(r);
    expect(annuler(pousser(nouvelHistorique(recette()), r)).present).toEqual(recette());
    const v = construire({ destination: 'tiktok' });
    expect(v.chapitres ?? []).toEqual([]);
    expect(v.sousTitres?.pour).toBe('p1');
  });

  it('aucune séquence cochée : recette inchangée', () => {
    const a = analyse();
    const r0 = recette();
    const res = construireBestOf(r0, a, (a.scenes as SceneBestOf[]).map((s) => ({ ...s, garde: false })), REGLAGES, BEST_OF_DEFAUT, { sourcesAudio: [], bruitages: [], musique: null, noms: {}, chibis: {} });
    expect(res).toBe(r0);
  });
});

describe('aides', () => {
  it('voixMalEntendue : la plus faible si ≥ 6 dB sous la plus forte', () => {
    expect(voixMalEntendue(null)).toBeNull();
    expect(voixMalEntendue({ ...VOIX, voix: [{ id: 'p1', niveauDb: -30, part: 1 }] })).toBeNull();
    expect(voixMalEntendue({ ...VOIX, voix: [{ id: 'p1', niveauDb: -30, part: 0.5 }, { id: 'p2', niveauDb: -27, part: 0.5 }] })).toBeNull();
  });

  it('sousTitresPour : personne inconnue sans effet ; null retire ; le normaliseur oublie une personne disparue', () => {
    const r = construire();
    expect(sousTitresPour(r, 'p9')).toBe(r);
    expect(sousTitresPour(r, null).sousTitres?.pour).toBeUndefined();
    expect(sousTitresPour(r, 'p2').sousTitres?.pour).toBe('p2');
    const sans = normaliser({ ...r, personnes: undefined, paroles: undefined }).recette;
    expect(sans.sousTitres?.pour).toBeUndefined();
  });

  it('modeleMeilleurDAbord : texte null → aucune accroche écrite, le passage est quand même copié', () => {
    const r = normaliser({ ...recette(), plans: [{ de: 10, a: 40 }] }).recette;
    const sans = modeleMeilleurDAbord(r, 5, 6, { texte: null });
    expect(sans.textes).toEqual([]);
    expect(sans.plans).toHaveLength(2);
    expect(modeleMeilleurDAbord(r, 5, 6).textes[0]!.txt).toBe('ATTENDS…');
  });
});
