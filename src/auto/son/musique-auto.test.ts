// Musique automatique (pure) : catalogue Kevin MacLeod (fichiers, crédits exacts), ambiances d'après le nom, musiques de
// Ma bibliothèque utilisables (jamais de musique de jeu), ambiance des séquences, groupes de 2 à 4 min (au début d'une
// séquence, pas pendant l'accroche, fin calme), priorité des sources (Ma bibliothèque → Kevin MacLeod → Arko),
// variété, et branchement dans le Montage express (morceaux déjà placés gardés, recette rétrocompatible).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { construireMontageExpress, type AnalyseExpress, type ReglagesExpress } from '../express/express';
import { choisirScenes, decouperScenes } from '../express/scenes';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import { accrocheDesMorceaux, MEILLEUR } from '../../recette/modeles';
import { definirMusique } from '../../recette/operations';
import type { Mot, Recette, Source } from '../../recette/types';
import type { SignauxSource } from '../types';
import { avisMusique, ligneCredit } from './credits';
import {
  ambianceDeSequence,
  ambiancesDuNom,
  candidatsArko,
  candidatsBibliotheque,
  candidatsKevin,
  choisirMorceaux,
  creditKevin,
  finAccroche,
  grouperSequences,
  lireIdArko,
  MORCEAUX_KEVIN,
  morceauxDuPlan,
  MUSIQUE_AUTO,
  nomFichierKevin,
  nomMusiqueArko,
  pisteAuto,
  planifierMusique,
  referenceAmbiances,
  remplacerParArko,
  sequencesDuMontage,
  type MorceauCandidat,
  type SequenceMusicale,
} from './musique-auto';

const RACINE = join(__dirname, '../../..');

describe('catalogue Kevin MacLeod', () => {
  it('9 morceaux, ids uniques, fichiers présents dans public/ (petits : < 3 Mo chacun)', () => {
    expect(MORCEAUX_KEVIN).toHaveLength(9);
    expect(new Set(MORCEAUX_KEVIN.map((m) => m.id)).size).toBe(9);
    for (const m of MORCEAUX_KEVIN) {
      const f = join(RACINE, 'public/musiques/kevin-macleod', m.fichier);
      expect(existsSync(f), m.fichier).toBe(true);
      expect(statSync(f).size).toBeLessThan(3 * 1024 * 1024);
      expect(m.duree).toBeGreaterThan(60);
      expect(m.isrc).toMatch(/^USUAN\d{7}$/);
    }
    // Les 6 morceaux du montage fait à la main sont là.
    for (const t of ['Monkeys Spinning Monkeys', 'Sneaky Snitch', 'Fluffing a Duck', 'Investigations', 'Scheming Weasel (faster version)', 'Divertissement - Pizzicato (from the ballet Sylvia)']) {
      expect(MORCEAUX_KEVIN.some((m) => m.titre === t), t).toBe(true);
    }
  });

  it('crédit EXACT de la page du morceau, et retrouvé par l\'alerte de licence d\'après le nom du fichier importé', () => {
    const m = MORCEAUX_KEVIN.find((x) => x.id === 'scheming-weasel-faster')!;
    expect(creditKevin(m)).toBe('"Scheming Weasel (faster version)" Kevin MacLeod (incompetech.com)\nLicensed under Creative Commons: By Attribution 4.0 License\nhttp://creativecommons.org/licenses/by/4.0/');
    for (const k of MORCEAUX_KEVIN) {
      expect(ligneCredit(nomFichierKevin(k))).toContain(`"${k.titre}" Kevin MacLeod (incompetech.com)`);
      // Le crédit copié par l'appli = le texte exact de la page du morceau, sur 3 lignes (relecture point 10).
      expect(ligneCredit(nomFichierKevin(k))).toBe(creditKevin(k));
      expect(avisMusique([nomFichierKevin(k)]).credits).toHaveLength(1);
      expect(avisMusique([nomFichierKevin(k)]).alertes).toEqual([]);
    }
  });

  it('pas dans le pré-cache du service worker (téléchargés à la demande) et crédités dans CREDITS.md', () => {
    const config = readFileSync(join(RACINE, 'vite.config.ts'), 'utf8');
    const motifs = /globPatterns:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';
    expect(motifs).not.toMatch(/m4a/);
    const credits = readFileSync(join(RACINE, 'CREDITS.md'), 'utf8');
    for (const m of MORCEAUX_KEVIN) expect(credits).toContain(`"${m.titre}" Kevin MacLeod (incompetech.com)`);
  });
});

describe('ambiances et candidats', () => {
  it('reconnaît les titres de Kevin MacLeod (même mal nommés dans un pack), les musiques d\'Arko et des mots', () => {
    expect(ambiancesDuNom('Monkeys Spinning Monkeys (Kevin MacLeod) - Gaming Background Music (HD) ( 160kbps )')[0]).toBe('joyeux');
    expect(ambiancesDuNom('Scheming Weasel Faster (Kevin Macleod) - Vanoss Gaming Background Music (HD)')[0]).toBe('rigolo');
    expect(ambiancesDuNom('Divertissement Pizzicato (Kevin Macleod) - Background Music (HD)')[0]).toBe('calme');
    expect(ambiancesDuNom('Investigations (Kevin MacLeod)')[0]).toBe('enquete');
    expect(ambiancesDuNom(nomMusiqueArko('enquete', 2))).toEqual(['enquete']);
    expect(ambiancesDuNom('Suspense music detective')[0]).toBe('enquete');
    expect(ambiancesDuNom('chill lofi beat')[0]).toBe('calme');
    expect(ambiancesDuNom('funny cartoon music')[0]).toBe('rigolo');
    expect(ambiancesDuNom('track 07')).toEqual([]);
  });

  it('Ma bibliothèque : rayon Musiques (≥ 20 s), longs sons « musique » des bruitages ; jamais Mario, Sonic, Nintendo…', () => {
    const c = candidatsBibliotheque([
      { id: 'm1', nom: 'Monkeys Spinning Monkeys (Kevin MacLeod)', duree: 125, rayon: 'musiques', etiquette: 'son de fond' },
      { id: 'm2', nom: 'Super Mario Bros Theme', duree: 160, rayon: 'musiques' },
      { id: 'm3', nom: 'Green Hill Zone', duree: 100, rayon: 'musiques', etiquette: 'Sonic' },
      { id: 'm4', nom: 'jingle', duree: 8, rayon: 'musiques' },
      { id: 'm5', nom: 'Kevin MacLeod - Carefree', duree: 200 },
      { id: 'm6', nom: 'vine boom', duree: 2 },
      { id: 'm7', nom: 'long bruit de pluie', duree: 120 },
      { id: 'm8', nom: 'Nintendo Wii - Mii Channel', duree: 140, rayon: 'musiques' },
    ]);
    expect(c.map((x) => x.id)).toEqual(['bib:m1', 'bib:m5']);
    expect(c[0]!.ambiances[0]).toBe('joyeux');
    expect(c.every((x) => x.origine === 'bibliotheque')).toBe(true);
  });

  it('Kevin MacLeod : seulement ceux qu\'on peut avoir (hors ligne : ceux déjà gardés) ; Arko : 4 ambiances × 3', () => {
    expect(candidatsKevin()).toHaveLength(9);
    expect(candidatsKevin((id) => id === 'investigations').map((x) => x.id)).toEqual(['kevin:investigations']);
    const arko = candidatsArko();
    expect(arko).toHaveLength(12);
    expect(lireIdArko(arko[0]!.id)).toEqual({ ambiance: 'joyeux', graine: 1 });
    expect(lireIdArko('kevin:carefree')).toBeNull();
  });
});

const seq = (t0: number, d: number, o: Partial<SequenceMusicale> = {}): SequenceMusicale => ({ t0, t1: t0 + d, duree: d, rires: 0, fousRires: 0, cris: 0, pics: 0, jurons: 0, tension: 0, ...o });

describe('ambiance et groupes de séquences', () => {
  it('rires → rigolo, tension → enquête, sinon joyeux-malin', () => {
    expect(ambianceDeSequence(seq(0, 60, { rires: 3 }))).toBe('rigolo');
    expect(ambianceDeSequence(seq(0, 60, { tension: 2, cris: 1 }))).toBe('enquete');
    expect(ambianceDeSequence(seq(0, 60, { pics: 2 }))).toBe('joyeux');
    expect(ambianceDeSequence(seq(0, 60, { rires: 1, tension: 4 }))).toBe('enquete');
  });

  it('relatif au montage : sur une session où l\'on rit partout (≈ 7 rires/min), seules les séquences au-dessus de l\'habitude sont « rigolo »', () => {
    const seqs = [seq(0, 60, { rires: 7 }), seq(60, 60, { rires: 6 }), seq(120, 60, { rires: 13 }), seq(180, 60, { rires: 7, jurons: 30 }), seq(240, 60, { rires: 8 })];
    const ref = referenceAmbiances(seqs);
    expect(ref.rire).toBe(7);
    expect(seqs.map((x) => ambianceDeSequence(x, ref))).toEqual(['joyeux', 'joyeux', 'rigolo', 'enquete', 'joyeux']);
    // Sans référence (seuil fixe), tout serait « rigolo ».
    expect(seqs.filter((x) => ambianceDeSequence(x) === 'rigolo')).toHaveLength(4);
  });

  it('16 min en 19 séquences : groupes de 2 à 4 min, au début d\'une séquence, qui se suivent ; la fin est calme', () => {
    const seqs: SequenceMusicale[] = [];
    let t = 6;
    for (let k = 0; k < 19; k++) {
      const d = 35 + ((k * 17) % 30);
      const o = k >= 4 && k < 8 ? { tension: 4 } : k >= 8 && k < 10 ? { rires: 4 } : k >= 10 && k < 14 ? { tension: 3, cris: 1 } : k >= 14 && k < 17 ? { rires: 3, cris: 2 } : {};
      seqs.push(seq(t, d, o));
      t += d;
    }
    const g = grouperSequences(seqs);
    expect(g.length).toBeGreaterThanOrEqual(4);
    expect(g.length).toBeLessThanOrEqual(8);
    expect(g[0]!.t).toBe(6);
    g.forEach((x, k) => {
      expect(seqs.some((s) => s.t0 === x.t)).toBe(true);
      if (k > 0) expect(x.t).toBe(g[k - 1]!.fin);
      const d = x.fin - x.t;
      if (k < g.length - 1) {
        expect(d).toBeGreaterThanOrEqual(MUSIQUE_AUTO.groupeMin - 30);
        expect(d).toBeLessThanOrEqual(MUSIQUE_AUTO.groupeMax + 30);
      } else expect(d).toBeGreaterThanOrEqual(MUSIQUE_AUTO.finMin);
    });
    expect(g[g.length - 1]!.ambiance).toBe('calme');
    expect(g.map((x) => x.ambiance)).toContain('enquete');
    expect(g.map((x) => x.ambiance)).toContain('rigolo');
  });

  it('une vidéo courte (TikTok, 1 min 30) : un seul groupe, pas de « fin calme »', () => {
    const g = grouperSequences([seq(6, 30, { rires: 2 }), seq(36, 30), seq(66, 30)]);
    expect(g).toHaveLength(1);
    expect(g[0]!.ambiance).not.toBe('calme');
    expect(grouperSequences([])).toEqual([]);
  });
});

describe('priorité des sources et variété', () => {
  const groupes = grouperSequences(Array.from({ length: 16 }, (_, k) => seq(6 + k * 60, 60, k < 4 ? {} : k < 8 ? { tension: 3 } : k < 12 ? { rires: 3 } : {})));
  const bib = (n: number): MorceauCandidat[] => Array.from({ length: n }, (_, k) => ({ id: `bib:m${k}`, nom: `Ma musique ${k}`, duree: 150, origine: 'bibliotheque' as const, ambiances: [] }));

  it('Ma bibliothèque d\'abord : avec 3 musiques ou plus, seulement elles (variées, jamais deux fois de suite)', () => {
    const ids = choisirMorceaux(groupes, [...bib(3), ...candidatsKevin(), ...candidatsArko()]);
    expect(ids).toHaveLength(groupes.length);
    expect(ids.every((x) => x.startsWith('bib:'))).toBe(true);
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    for (let k = 1; k < ids.length; k++) expect(ids[k]).not.toBe(ids[k - 1]);
  });

  it('1 seule musique à soi : elle d\'abord, puis Kevin MacLeod (pas de répétition)', () => {
    const ids = choisirMorceaux(groupes, [...bib(1), ...candidatsKevin(), ...candidatsArko()]);
    expect(ids[0]).toBe('bib:m0');
    expect(ids.slice(1).every((x) => x.startsWith('kevin:'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sans bibliothèque : Kevin MacLeod, l\'ambiance suit le groupe (enquête → Investigations…, fin → calme)', () => {
    const plan = planifierMusique(
      Array.from({ length: 16 }, (_, k) => seq(6 + k * 60, 60, k < 4 ? {} : k < 8 ? { tension: 3 } : k < 12 ? { rires: 3 } : {})),
      [...candidatsKevin(), ...candidatsArko()],
    );
    expect(plan.groupes.every((g) => g.morceau.startsWith('kevin:'))).toBe(true);
    const kevin = (id: string) => MORCEAUX_KEVIN.find((m) => `kevin:${m.id}` === id)!;
    for (const g of plan.groupes) expect(kevin(g.morceau).ambiances, g.ambiance).toContain(g.ambiance);
    expect(plan.groupes[plan.groupes.length - 1]!.ambiance).toBe('calme');
    expect(new Set(plan.groupes.map((g) => g.morceau)).size).toBe(plan.groupes.length);
  });

  it('hors ligne et rien de gardé : la musique fabriquée par Arko, de la bonne ambiance, variée', () => {
    const plan = planifierMusique(Array.from({ length: 16 }, (_, k) => seq(6 + k * 60, 60, k >= 4 && k < 8 ? { tension: 3 } : {})), [...candidatsKevin(() => false), ...candidatsArko()]);
    expect(plan.groupes.length).toBeGreaterThan(2);
    for (const g of plan.groupes) expect(lireIdArko(g.morceau)?.ambiance).toBe(g.ambiance);
    for (let k = 1; k < plan.groupes.length; k++) expect(plan.groupes[k]!.morceau).not.toBe(plan.groupes[k - 1]!.morceau);
  });

  it('un morceau introuvable est remplacé par une musique fabriquée de la même ambiance ; même morceau de suite = un seul', () => {
    const plan = planifierMusique([seq(6, 150, { tension: 5 }), seq(156, 150)], [...candidatsKevin(), ...candidatsArko()]);
    const avant = plan.groupes[0]!.morceau;
    const apres = remplacerParArko(plan, avant);
    expect(apres.groupes[0]!.morceau).toBe('arko:enquete:1');
    const m = morceauxDuPlan({ groupes: [{ ...plan.groupes[0]!, morceau: 'x' }, { ...plan.groupes[1]!, morceau: 'x' }] }, () => 'a1');
    expect(m).toEqual([{ src: 'a1', t: 6 }]);
  });
});

/* ------------------------------------------------------------------ branchement dans le Montage express */

const DUREE = 6000;
function phrase(t: number, n: number, mots: string[] = []): Mot[] {
  return Array.from({ length: n }, (_, i) => [mots[i % Math.max(1, mots.length)] ?? 'bla', Math.round((t + i * 0.4) * 100) / 100, Math.round((t + i * 0.4 + 0.3) * 100) / 100] as Mot);
}
/** Une session de 1 h 35 en 19 scènes de ~50 s : 4 calmes, 4 tendues (TNT), 2 drôles, 4 tendues, 3 drôles, la fin. */
function session(): { mots: Mot[]; signaux: SignauxSource } {
  const mots: Mot[] = [];
  const rires: SignauxSource['rires'] = [];
  const cris: SignauxSource['cris'] = [];
  for (let k = 0; k < 19; k++) {
    const t = 30 + k * 300;
    const tendue = (k >= 4 && k < 8) || (k >= 10 && k < 14);
    const drole = (k >= 8 && k < 10) || (k >= 14 && k < 17);
    mots.push(...phrase(t, 125, tendue ? ['attention', 'la', 'tnt', 'cours', 'vite', 'bla', 'bla', 'bla'] : ['on', 'va', 'au', 'village', 'bla']));
    if (drole) for (const d of [10, 25, 40]) rires.push({ de: t + d, a: t + d + 1.5, t: t + d + 0.5, force: 0.6 });
    if (tendue) cris.push({ de: t + 20, a: t + 21, t: t + 20.5, force: 0.7 });
  }
  return { mots, signaux: { src: 's1', duree: DUREE, pas: 0.02, rms: new Float32Array(DUREE * 50).fill(0.01), pics: [], cris, rires, muets: [] } };
}

function recetteSource(): Recette {
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

const REGLAGES: ReglagesExpress = {
  dureeVisee: { min: 900, max: 1200 },
  garder: 'parole',
  niveauBlancs: 'serre',
  transcrire: true,
  punchlines: false,
  bruitages: false,
  musique: [],
  musiqueAuto: true,
  bords: false,
  zooms: null,
  sections: false,
  accroche: true,
  avecIA: false,
};

describe('Montage express : musique automatique', () => {
  const { mots, signaux } = session();
  const scenes = choisirScenes(decouperScenes(mots, signaux), mots, signaux, 1e5);
  const a: AnalyseExpress = { transcription: { src: 's1', mots, plages: [{ de: 0, a: DUREE }], complete: true }, parole: 'mots', signaux, scenes, cadreBords: null, avertissements: [] };
  const sans = construireMontageExpress(recetteSource(), a, scenes, REGLAGES, { sourcesAudio: [], bruitages: [], musique: null });
  const seqs = sequencesDuMontage(sans, scenes.filter((s) => s.garde), signaux, mots);
  const plan = planifierMusique(seqs, [...candidatsKevin(), ...candidatsArko()]);
  const sources: Source[] = [...new Set(plan.groupes.map((g) => g.morceau))].map((id, k) => ({ id: `a${k + 1}`, nom: id, taille: 1, emp: `m${k}`, duree: 120, type: 'audio' }));
  const morceaux = morceauxDuPlan(plan, (id) => sources.find((s) => s.nom === id)?.id);

  it('séquences retrouvées dans le montage (après l\'accroche), dans l\'ordre, avec leurs chiffres', () => {
    const sc = compiler(sans);
    expect(finAccroche(sc)).toBeGreaterThan(4);
    expect(seqs).toHaveLength(19);
    expect(seqs[0]!.t0).toBeCloseTo(finAccroche(sc), 2);
    for (let k = 1; k < seqs.length; k++) expect(seqs[k]!.t0).toBeGreaterThanOrEqual(seqs[k - 1]!.t1 - 0.01);
    expect(seqs[5]!.tension).toBeGreaterThan(10);
    expect(seqs[8]!.rires).toBe(3);
  });

  it('accroche du Best-of v4 en 2 morceaux (la phrase puis la réaction) : la musique attend la fin des deux', () => {
    const nue = construireMontageExpress(recetteSource(), a, scenes, { ...REGLAGES, accroche: false }, { sourcesAudio: [], bruitages: [], musique: null });
    expect(finAccroche(compiler(nue))).toBe(0);
    const premier = nue.plans.find((p) => !p.ins)!;
    const deux = accrocheDesMorceaux(nue, [
      { src: 's1', de: premier.de, a: premier.de + 3.1 },
      { src: 's1', de: premier.de + 4, a: premier.de + 6.6 },
    ]);
    const sc = compiler(deux);
    expect(sc.plans[2]!.trans?.type).toBe(MEILLEUR.transition);
    expect(finAccroche(sc)).toBeCloseTo(sc.plans[1]!.t1, 2);
    expect(finAccroche(sc)).toBeGreaterThan(5.5);
    const seqs2 = sequencesDuMontage(deux, scenes.filter((x) => x.garde), signaux, mots);
    expect(seqs2[0]!.t0).toBeGreaterThanOrEqual(finAccroche(sc) - 0.01);
  });

  it('pas de musique pendant l\'accroche ; un morceau par groupe de 2 à 4 min ; enquête / rigolo / fin calme', () => {
    const sc = compiler(sans);
    expect(sc.duree).toBeGreaterThan(14 * 60);
    expect(morceaux[0]!.t).toBeCloseTo(finAccroche(sc), 1);
    expect(morceaux.length).toBeGreaterThanOrEqual(4);
    expect(morceaux.length).toBeLessThanOrEqual(8);
    const ambiances = plan.groupes.map((g) => g.ambiance);
    expect(ambiances[0]).toBe('joyeux');
    expect(ambiances).toContain('enquete');
    expect(ambiances).toContain('rigolo');
    expect(ambiances[ambiances.length - 1]).toBe('calme');
    // Chaque changement tombe au début d'une séquence.
    for (const m of morceaux) expect(seqs.some((s) => Math.abs(s.t0 - m.t) < 0.01)).toBe(true);
  });

  it('les morceaux déjà placés sont gardés tels quels par l\'étape musique ; ceux choisis à la main restent placés comme avant', () => {
    const avec = construireMontageExpress(recetteSource(), a, scenes, REGLAGES, { sourcesAudio: sources, bruitages: [], musique: { morceaux } });
    expect(avec.musique?.morceaux).toEqual(morceaux);
    // Même résultat que de poser la piste sur le montage sans musique (chemin de la page : un seul Annuler).
    expect(definirMusique(sans, { morceaux }, sources)).toEqual(avec);
    const main = construireMontageExpress(recetteSource(), a, scenes, { ...REGLAGES, musiqueAuto: false, musique: ['x'] }, { sourcesAudio: sources.slice(0, 2), bruitages: [], musique: { morceaux: [{ src: 'a1', t: 0 }, { src: 'a2', t: 0 }] } });
    expect(main.musique?.morceaux[0]!.t).toBe(0);
    expect(main.musique?.morceaux).toHaveLength(2);
  });

  it('recette rétrocompatible : arko.recette/1, aucun champ nouveau, relue à l\'identique par le normaliseur', () => {
    const avec = definirMusique(sans, { morceaux }, sources);
    expect(avec.format).toBe('arko.recette/1');
    for (const m of avec.musique!.morceaux) expect(Object.keys(m).sort()).toEqual(['src', 't']);
    const relue = normaliser(JSON.parse(JSON.stringify(avec)), { sources: avec.sources });
    expect(relue.recette.musique).toEqual(avec.musique);
    expect(relue.problemes.filter((x) => x.chemin.startsWith('musique'))).toEqual([]);
  });

  it('calcul rapide (choix pur) : < 300 ms pour 19 séquences', () => {
    const t0 = performance.now();
    for (let k = 0; k < 5; k++) planifierMusique(sequencesDuMontage(sans, scenes, signaux, mots), [...candidatsKevin(), ...candidatsArko()]);
    expect((performance.now() - t0) / 5).toBeLessThan(300);
  });
});

describe('piste automatique (v4)', () => {
  it('Best-of v4 (analyse v: 4) : baisse sur la parole ; Montage express d\'avant : comme avant ; forçable', () => {
    const m = [{ src: 'a1', t: 6 }];
    expect(pisteAuto(m, { v: 4 })).toEqual({ morceaux: m, baisseSur: 'parole' });
    expect(pisteAuto(m, {})).toEqual({ morceaux: m });
    expect(pisteAuto(m, { v: 4 }, null)).toEqual({ morceaux: m });
    expect(pisteAuto(m, {}, 'parole')).toEqual({ morceaux: m, baisseSur: 'parole' });
  });
});
