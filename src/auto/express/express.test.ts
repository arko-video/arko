// H. Montage express : choix des scènes, assemblage dans l'ordre du contrat (A → D → B → E → C → G → F), accroche
// de 6 s, chapitres et titres de section après l'accroche, musique au début des chapitres, volume final.

import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import { annuler, nouvelHistorique, pousser } from '../../recette/operations';
import type { Mot, Recette } from '../../recette/types';
import type { SignauxSource } from '../types';
import { construireMontageExpress, meilleurMoment, placerMorceaux, type AnalyseExpress, type ReglagesExpress } from './express';
import { choisirScenes, decouperScenes, dureeGardee, horodatage, motsDesScenes, SCENES } from './scenes';

const DUREE = 900;

/** Une phrase de n mots réguliers à partir de t (0,3 s par mot, 0,1 s entre deux). */
function phrase(t: number, textes: string[]): Mot[] {
  return textes.map((x, i) => [x, Math.round((t + i * 0.4) * 100) / 100, Math.round((t + i * 0.4 + 0.3) * 100) / 100]);
}

function signaux(o: Partial<SignauxSource> = {}): SignauxSource {
  return { src: 's1', duree: DUREE, pas: 0.02, rms: new Float32Array(DUREE * 50).fill(0.01), pics: [], cris: [], rires: [], muets: [], ...o };
}

function recette(): Recette {
  return normaliser({
    format: 'arko.recette/1',
    destination: 'youtube',
    sources: [{ id: 's1', nom: 'obs.mp4', taille: 1, emp: 'e1', duree: DUREE, type: 'video', l: 1280, h: 720 }],
    plans: [{ de: 0, a: 600 }],
    textes: [],
    sons: [],
    zooms: [],
    guide: null,
    boucle: false,
    export: {},
  }).recette;
}

// 4 scènes de parole séparées de plus de 20 s ; la 3ᵉ a des rires et un pic (la meilleure).
const BLA = Array.from({ length: 30 }, () => 'bla');
const MOTS: Mot[] = [
  ...phrase(10, ['bon', 'on', 'commence', 'la', 'partie']),
  ...phrase(20, ['on', 'va', 'au', 'château', 'maintenant']),
  ...phrase(25, BLA),
  ...phrase(100, ['je', 'cherche', 'du', 'bois', 'pour', 'la', 'maison']),
  ...phrase(115, ['il', 'faut', 'du', 'fer', 'aussi']),
  ...phrase(120, BLA),
  ...phrase(200, ['non!', 'putain', 'le', 'creeper']),
  ...phrase(210, ['mdr', 'il', 'a', 'tout', 'explosé']),
  ...phrase(215, BLA),
  ...phrase(300, ['on', 'a', 'gagné!']),
  ...phrase(310, ['gg', 'les', 'gars', 'tchao']),
  ...phrase(315, BLA),
];
const SIGNAUX = signaux({
  pics: [{ ts: 201, db: -6, z: 5 }],
  rires: [{ de: 211, a: 213, t: 212, force: 0.8 }],
  muets: [{ de: 600, a: DUREE }],
});

const REGLAGES: ReglagesExpress = {
  dureeVisee: { min: 60, max: 120 },
  garder: 'parole+forts',
  niveauBlancs: 'normal',
  transcrire: true,
  punchlines: true,
  bruitages: true,
  musique: ['m1', 'm2'],
  bords: true,
  zooms: 'normal',
  sections: true,
  accroche: true,
  avecIA: false,
};

describe('scènes', () => {
  it('une pause de plus de 20 s ouvre une nouvelle scène ; jamais un passage muet', () => {
    const scenes = decouperScenes(MOTS, SIGNAUX);
    expect(scenes).toHaveLength(4);
    expect(scenes[0]).toEqual({ de: 9.5, a: 37.4 });
    for (const s of scenes) expect(s.a <= 600 || s.de >= DUREE).toBe(true);
    // Des mots dans un passage muet (AFK) ne font pas de scène.
    const afk = decouperScenes([...MOTS, ...phrase(700, ['zzz', 'zzz'])], SIGNAUX);
    expect(afk).toHaveLength(4);
  });

  it('une scène trop longue est coupée à son plus grand silence', () => {
    const long: Mot[] = [];
    for (let t = 0; t < 400; t += 15) long.push(...phrase(t, ['bla', 'bla']));
    long.push(...phrase(415, ['après', 'le', 'grand', 'blanc'])); // trou de 14 s, le plus grand
    const scenes = decouperScenes(long, null);
    expect(scenes.length).toBeGreaterThan(1);
    for (const s of scenes) expect(s.a - s.de).toBeLessThanOrEqual(SCENES.max + 1);
  });

  it('note et coche les meilleures jusqu\'à la durée visée, dans l\'ordre chronologique', () => {
    const scenes = choisirScenes(decouperScenes(MOTS, SIGNAUX), MOTS, SIGNAUX, 15);
    expect(scenes.map((s) => s.de)).toEqual([...scenes].map((s) => s.de).sort((a, b) => a - b));
    const meilleure = scenes.reduce((m, s) => (s.score > m.score ? s : m));
    expect(meilleure.de).toBeCloseTo(199.5);
    expect(meilleure.garde).toBe(true);
    expect(meilleure.raison).toContain('1 rire');
    expect(meilleure.titre).toBe('Mdr il a tout explosé');
    expect(dureeGardee(scenes)).toBeLessThan(40);
    // Une durée visée large garde tout.
    expect(choisirScenes(decouperScenes(MOTS, SIGNAUX), MOTS, SIGNAUX, 600).every((s) => s.garde)).toBe(true);
  });

  it('horodatage et mots des scènes', () => {
    expect(horodatage(754.2)).toBe('12:34');
    expect(horodatage(3725)).toBe('1:02:05');
    expect(motsDesScenes(MOTS, [{ de: 199, a: 214.9 }]).map((m) => m[0])).toEqual(['non!', 'putain', 'le', 'creeper', 'mdr', 'il', 'a', 'tout', 'explosé']);
  });
});

function analyse(): AnalyseExpress {
  const scenes = choisirScenes(decouperScenes(MOTS, SIGNAUX), MOTS, SIGNAUX, 600);
  return {
    transcription: { src: 's1', mots: MOTS, plages: [{ de: 0, a: DUREE }], complete: true },
    parole: 'mots',
    signaux: SIGNAUX,
    scenes,
    cadreBords: { x: 0.0414, y: 0.0278, l: 0.9164, h: 0.9167 },
    avertissements: [],
  };
}

const AUDIO = [
  { id: 'a1', nom: 'bruh.mp3', taille: 1, emp: 'b1', duree: 1, type: 'audio' as const },
  { id: 'm1', nom: 'Kevin MacLeod - Monkeys.mp3', taille: 1, emp: 'b2', duree: 120, type: 'audio' as const },
  { id: 'm2', nom: 'Sneaky.mp3', taille: 1, emp: 'b3', duree: 120, type: 'audio' as const },
];

function construire(reglages = REGLAGES): Recette {
  const a = analyse();
  return construireMontageExpress(recette(), a, a.scenes, reglages, {
    sourcesAudio: AUDIO,
    bruitages: [{ id: 'a1', ts: 200.1, src: 's1', vol: 0.631, dur: 2, fondu: 0.3 }],
    musique: { morceaux: [{ src: 'm1', t: 0 }, { src: 'm2', t: 0 }] },
  });
}

describe('construireMontageExpress', () => {
  const r = construire();
  const sc = compiler(r);

  it('A + D + B + E + C : coupes, bords, punchlines, bruitages, zooms', () => {
    expect(r.blancs).toEqual({ niveau: 'normal', fonduEntree: 0.02, fonduSortie: 0.04 });
    expect(r.rognages).toEqual([{ src: 's1', x: 0.0414, y: 0.0278, l: 0.9164, h: 0.9167 }]);
    expect(r.sousTitres).toMatchObject({ mode: 'punchlines', style: 'punchline' });
    expect(r.sousTitres!.punchlines!.length).toBeGreaterThan(0);
    expect(r.sons.filter((s) => s.role === 'bruitage')).toHaveLength(1);
    expect(r.plans.some((p) => p.zoomFixe?.force === 1.32)).toBe(true);
    // Les plans ne gardent que la parole (+ marges) : bien moins que les 4 scènes entières.
    expect(sc.duree).toBeLessThan(130);
    for (const p of r.plans.slice(1)) expect(p.a).toBeLessThanOrEqual(600);
  });

  it('accroche de 6 s du meilleur moment (10/11 : la réaction humaine, le rire à 212 s, avant le pic) au début', () => {
    const premier = sc.plans[0]!;
    expect(premier.t1 - premier.t0).toBeCloseTo(6, 1);
    expect(premier.de).toBeLessThan(212);
    expect(premier.a).toBeGreaterThan(212);
    expect(r.textes.find((x) => x.role === 'accroche')).toMatchObject({ txt: 'ATTENDS…', t: 0 });
  });

  it('chapitres (3 au moins, 0:00, 10 s chacun) et titres de section APRÈS l\'accroche', () => {
    const chapitres = r.chapitres ?? [];
    expect(chapitres.length).toBeGreaterThanOrEqual(3);
    expect(chapitres[0]!.t).toBe(0);
    for (let i = 1; i < chapitres.length; i++) {
      expect(chapitres[i]!.t - chapitres[i - 1]!.t).toBeGreaterThanOrEqual(10);
      expect(chapitres[i]!.t).toBeGreaterThanOrEqual(6);
    }
    const titres = r.textes.filter((x) => x.role === 'section');
    expect(titres.length).toBe(chapitres.length - 1); // le chapitre 0:00 tombe dans l'accroche : sauté
    for (const x of titres) expect(x.t).toBeGreaterThanOrEqual(6);
    expect(r.sons.filter((s) => s.role === 'section')).toHaveLength(titres.length);
  });

  it('F : musique au début des chapitres, volume final −14 LUFS / −1,5 dBTP', () => {
    expect(r.musique?.morceaux.map((m) => m.src)).toEqual(['m1', 'm2']);
    expect(r.musique!.morceaux[0]!.t).toBe(0);
    expect((r.chapitres ?? []).map((c) => c.t)).toContain(r.musique!.morceaux[1]!.t);
    expect(r.volumeFinal).toEqual({ lufs: -13, crete: -1.5 });
  });

  it('montage normal : normaliseur sans problème, idempotent, un seul Annuler', () => {
    const { recette: deux, problemes } = normaliser(JSON.parse(JSON.stringify(r)));
    expect(problemes.filter((p) => p.niveau === 'bloquant')).toEqual([]);
    expect(deux).toEqual(r);
    const h = pousser(nouvelHistorique(recette()), r);
    expect(annuler(h).present).toEqual(recette());
  });

  it('seulement les scènes cochées, dans l\'ordre choisi ; options coupées = parties absentes', () => {
    const a = analyse();
    const scenes = [a.scenes[2]!, a.scenes[0]!].map((s) => ({ ...s, garde: true }));
    const r2 = construireMontageExpress(recette(), a, scenes, { ...REGLAGES, accroche: false, punchlines: false, zooms: null, bords: false, bruitages: false, musique: [] }, { sourcesAudio: [], bruitages: [], musique: null });
    expect(r2.plans[0]!.de).toBeGreaterThanOrEqual(199);
    expect(r2.plans[r2.plans.length - 1]!.a).toBeLessThanOrEqual(38);
    expect(r2.sousTitres?.mode).toBeUndefined();
    expect(r2.rognages).toBeUndefined();
    expect(r2.musique).toBeUndefined();
    expect(r2.plans.every((p) => !p.zoomFixe)).toBe(true);
    expect(r2.chapitres ?? []).toEqual([]); // 2 scènes : moins de 3 chapitres, aucun
    const mots = r2.sousTitres!.mots as Mot[];
    expect(mots.every((m) => (m[1] >= 199 && m[2] <= 230) || m[2] <= 38)).toBe(true);
  });

  it('aucune scène cochée : recette inchangée', () => {
    const a = analyse();
    const r0 = recette();
    expect(construireMontageExpress(r0, a, a.scenes.map((s) => ({ ...s, garde: false })), REGLAGES, { sourcesAudio: [], bruitages: [], musique: null })).toBe(r0);
  });

  it('en vertical (TikTok) : pas de chapitres ni de titres de section', () => {
    const a = analyse();
    const r0 = normaliser({ ...recette(), destination: 'tiktok' }).recette;
    const rv = construireMontageExpress(r0, a, a.scenes, REGLAGES, { sourcesAudio: AUDIO, bruitages: [], musique: null });
    expect(rv.chapitres ?? []).toEqual([]);
    expect(rv.textes.some((x) => x.role === 'section')).toBe(false);
    expect(rv.sousTitres?.mode).toBe('punchlines');
  });
});

describe('aides', () => {
  it('meilleurMoment : la réaction humaine (cri, rire) avant un pic, encore dans le montage (temps de sortie)', () => {
    const r = normaliser({ ...recette(), plans: [{ de: 100, a: 110 }, { de: 195, a: 215 }] }).recette;
    // Le rire à 212 s (source) = 10 + (212 - 195) = 27 s en sortie.
    expect(meilleurMoment(r, SIGNAUX)).toBeCloseTo(27, 1);
    // Sans le rire dans le montage : le pic à 201 s.
    expect(meilleurMoment(normaliser({ ...recette(), plans: [{ de: 100, a: 110 }, { de: 195, a: 205 }] }).recette, SIGNAUX)).toBeCloseTo(16, 1);
    expect(meilleurMoment(r, null)).toBeNull();
    expect(meilleurMoment(normaliser({ ...recette(), plans: [{ de: 0, a: 50 }] }).recette, SIGNAUX)).toBeNull();
  });

  it('placerMorceaux : le 1er à 0, les suivants au début du chapitre le plus proche', () => {
    expect(placerMorceaux(['a', 'b', 'c'], [0, 50, 110, 190], 240)).toEqual([{ src: 'a', t: 0 }, { src: 'b', t: 50 }, { src: 'c', t: 190 }]);
    expect(placerMorceaux(['a', 'b'], [], 100)).toEqual([{ src: 'a', t: 0 }, { src: 'b', t: 50 }]);
  });
});
