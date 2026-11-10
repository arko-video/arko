// Best-of v4 (dev-ui) — le parcours de l'interface, SANS navigateur : réglages à la 2ᵉ ouverture, carte d'accord du
// module sous-titres (jamais de mode voix muet), refus → analyse sans le module (et c'est dit), durée de la revue =
// dureeEstimee, durée visée / voix / empreinte changées sur la revue sans réanalyse, et le montage en UN seul
// modifier(). Session FABRIQUÉE (comme chaine-best-of.test.ts) ; étapes d'AVANT (stables pendant la vague).
// Aucun modèle, aucun ffmpeg, aucune donnée privée.

import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { BEST_OF_DEFAUT } from '../../../auto/express/best-of';
import { dureeEstimee, reglagesBestOfV4 } from '../../../auto/express/chaine-best-of';
import { ETAPES_ANCIENNES } from '../../../auto/express/etapes-anciennes';
import type { AnalyseExpress, ReglagesExpress } from '../../../auto/express/express';
import type { SceneProposee } from '../../../auto/express/scenes';
import type { SignauxSource } from '../../../auto/types';
import type { EmpreintesVoix } from '../../../auto/types-v3';
import type { AnalyseV4, EntreeVoix, EtatModule, MesuresSource, ModulesBestOf, ProbasVad, SequenceV4, VoixDetecteesV4 } from '../../../auto/types-v4';
import type { SourceOuverte } from '../../../moteur/api';
import { ErreurArko } from '../../../moteur/erreurs';
import type { Destination } from '../../../recette/destination';
import type { DefinitionChibi, Mot, Recette, Source, TourDeParole } from '../../../recette/types';
import { TAILLE_MODULE } from '../../../sous-titres/config';
import { BRANCHEMENTS, brancherV4 } from './branchements-v4';
import type { EtatAnalyseExpress } from './etat-express';
import {
  avertissementsRevue,
  choixCombien,
  creerParcoursBestOf,
  dureeSequence,
  etapesAnalyse,
  etoiles,
  mesuresGardeesDe,
  modulesAvecRefus,
  propositionModules,
  refaireSansPrecision,
  reglagesPourStyle,
  type EtatPartageV4,
  type OptionsMesuresV4,
  type ServicesV4,
} from './etat-v4';
import { TEXTES_V4 } from './textes-v4';
import { TEXTES_VAD } from '../../../auto/vad/textes-vad';
import { TA } from '../../../textes-auto';

/* ------------------------------------------------------------------ session fabriquée (15 min, 2 voix) */

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

const NORMAL = [['on', 'va', 'au', 'château', 'maintenant'], ['je', 'cherche', 'du', 'bois', 'ici']];
const FORT = [['non!', 'putain', 'le', 'creeper', 'là'], ['mdr', 'il', 'a', 'tout', 'explosé!']];
const PARTIES = [echange(10, 40, FORT), echange(100, 125, NORMAL), echange(200, 400, [...NORMAL, ...FORT]), echange(500, 520, NORMAL)];
const MOTS = PARTIES.flatMap((p) => p.mots);
const TOURS = PARTIES.flatMap((p) => p.tours);

const SIGNAUX: SignauxSource = {
  src: 's1',
  duree: DUREE,
  pas: PAS,
  rms: new Float32Array(DUREE / PAS).fill(0.01),
  pics: [{ ts: 20, db: -6, z: 5 }, { ts: 299, db: -5, z: 6 }],
  cris: [{ de: 350, a: 351, t: 350.5, force: 0.8 }],
  rires: [{ de: 21, a: 23, t: 22, force: 0.6 }, { de: 300, a: 304, t: 302, force: 0.9 }],
  muets: [{ de: 600, a: DUREE }],
};

function empreintes(): EmpreintesVoix {
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
  return { pas: PAS, duree: DUREE, db, bandes };
}

function vad(): ProbasVad {
  const pas = 0.032;
  const p = new Uint8Array(Math.ceil(DUREE / pas)).fill(5);
  for (const t of TOURS) for (let k = Math.floor(t.ts / pas); k < Math.ceil(t.fin / pas); k++) p[k] = 230;
  return { src: 's1', pas, p, plages: [{ de: 0, a: DUREE }], modele: 'silero-vad-v5' };
}

function mesures(modules: ModulesBestOf): MesuresSource {
  const mots = modules.whisper === 'present';
  return {
    src: 's1',
    duree: DUREE,
    signaux: SIGNAUX,
    empreintes: [empreintes()],
    pistesSeparees: false,
    vad: vad(),
    hauteur: null,
    transcription: mots ? { src: 's1', mots: MOTS, plages: [{ de: 0, a: DUREE }], complete: true } : null,
    neurales: null,
    cadreBords: null,
    modules: { ...modules },
    avertissements: mots ? [] : ['Voix détectée au son (sans transcription).'],
  };
}

const SOURCE: Source = { id: 's1', nom: 'session.mp4', taille: 1, emp: 'test-ui-v4', duree: DUREE, type: 'video', l: 1280, h: 720 };
const OUVERTE = { infos: SOURCE, verticale: false, fichier: {} as File } as SourceOuverte;
const MUSIQUE: Source = { id: 'a1', nom: 'Kevin MacLeod - Sneaky Snitch.m4a', taille: 1, emp: 'test-musique', duree: 120, type: 'audio' };

/** Étape « voix » fabriquée : 2 voix, ou 1 si on la force (comme le fera separerVoixV4 avec `forcer`). */
function voixFabriquee(e: EntreeVoix): VoixDetecteesV4 {
  const une = e.forcer === 1;
  const tours = TOURS.map((t) => ({ ...t, p: une ? 'p1' : t.p }));
  return {
    src: e.src,
    methode: une ? 'une' : 'niveau+timbre',
    voix: une ? [{ id: 'p1', niveauDb: -30, part: 1 }] : [{ id: 'p1', niveauDb: -25, part: 0.5 }, { id: 'p2', niveauDb: -40, part: 0.5 }],
    tours,
    sure: 1,
    separation: { par: une ? 'une' : 'niveau', seuilDb: une ? null : -32, ecartDb: une ? null : 15, cosinusCentres: e.neurales ? 0.4 : null, ambigu: 0, morceaux: tours.length, proposerEmpreinte: null },
  };
}

/* ------------------------------------------------------------------ faux services + état */

interface Options {
  whisper?: EtatModule;
  vad?: EtatModule;
  enLigne?: boolean;
  telechargementRate?: boolean;
  /** ms avant le calcul exact de la durée (défaut ici : 0, tout de suite). */
  attenteDuree?: number;
}

function monde(o: Options = {}) {
  const appels = {
    mesurer: [] as OptionsMesuresV4[],
    telechargerWhisper: 0,
    telechargerEmpreinte: 0,
    empreintes: 0,
    modifier: 0,
    musiqueAuto: 0,
    apres: 0,
    toasts: [] as string[],
    ecrans: [] as string[],
    neurales: [] as boolean[],
    gardees: [] as boolean[],
  };
  let ouverte: Recette | null = null;
  let whisper: EtatModule = o.whisper ?? 'present';
  const etapes = {
    ...ETAPES_ANCIENNES,
    voix: (e: EntreeVoix) => {
      appels.neurales.push(e.neurales !== null);
      return voixFabriquee(e);
    },
  };
  const services: ServicesV4 = {
    lireModules: async () => ({ whisper, vad: o.vad ?? 'present', empreinte: 'absent' }),
    enLigne: () => o.enLigne ?? true,
    attenteDuree: o.attenteDuree ?? 0,
    telechargerWhisper: async (op) => {
      appels.telechargerWhisper++;
      op.surProgression?.(0.5, '');
      if (o.telechargementRate) throw new ErreurArko('Plus de place.', 'place');
      whisper = 'present';
    },
    telechargerEmpreinte: async () => {
      appels.telechargerEmpreinte++;
    },
    mesurer: async (_s, _r, _b, op) => {
      appels.mesurer.push(op);
      return mesures(op.modules);
    },
    empreintesNeurales: async (_s, morceaux) => {
      appels.empreintes++;
      return { modele: 'campplus-zh-en', morceaux: morceaux.map((m) => ({ de: m.de, a: m.a, v: new Float32Array(192) })) };
    },
    pistes: () => [],
    allerA: (e) => void appels.ecrans.push(e),
    retour: () => {},
    toast: (m) => void appels.toasts.push(m),
    ouvrirProjet: async (_s, depart) => (ouverte = depart),
    musiqueAuto: async () => {
      appels.musiqueAuto++;
      return { piste: { morceaux: [{ src: 'a1', t: 0 }] }, sources: [MUSIQUE] };
    },
    musiqueChoisie: async () => null,
    modifier: (op) => {
      appels.modifier++;
      const n = op(ouverte!);
      const change = n !== ouverte;
      ouverte = n;
      return change;
    },
    apresMontage: (_s, _a, gardees) => {
      appels.apres++;
      appels.gardees.push(gardees !== null && gardees.vad !== null && gardees.energie !== null);
    },
    optionsChaine: { etapes },
  };
  const { express, bestOf } = reglagesBestOfV4('youtube');
  const etat: EtatPartageV4 = {
    source: signal<SourceOuverte | null>(OUVERTE),
    destination: signal<Destination>('youtube'),
    reglages: signal<ReglagesExpress>({ ...express, dureeVisee: { min: 60, max: 120 } }),
    bestOf: signal(bestOf),
    etat: signal<EtatAnalyseExpress>({ phase: 'avant' }),
    analyse: signal<AnalyseExpress | null>(null),
    scenes: signal<SceneProposee[]>([]),
    noms: signal<Record<string, string>>({}),
    chibis: signal<Record<string, { def: DefinitionChibi; bib?: string }>>({}),
    pour: signal<string | null>(null),
    montageEnCours: signal(false),
  };
  const parcours = creerParcoursBestOf(etat, services);
  return { appels, etat, parcours, services, recette: () => ouverte };
}

const servicesDe = (m: ReturnType<typeof monde>): ServicesV4 => m.services;

/* ------------------------------------------------------------------ tests */

describe('Best-of v4, réglages : réglages d\'office à CHAQUE ouverture', () => {
  it('2ᵉ ouverture : coupe Normal (la DA) même si on avait choisi Serré, Transcrire coché, musique auto', () => {
    const base = reglagesBestOfV4('youtube').express;
    let reg = reglagesPourStyle('bestOf', 'youtube', base).express;
    expect(reg.niveauBlancs).toBe('normal');
    reg = { ...reg, niveauBlancs: 'serre', transcrire: false, musiqueAuto: false };
    // On referme, on rouvre : le Best-of reprend SES réglages (avant : Normal sans le dire, ou Serré imposé).
    const rouvert = reglagesPourStyle('bestOf', 'tiktok', reg);
    expect(rouvert.express.niveauBlancs).toBe('normal');
    expect(rouvert.express.transcrire).toBe(true);
    expect(rouvert.express.musiqueAuto).toBe(true);
    expect(rouvert.express.dureeVisee).toEqual({ min: 60, max: 120 });
    expect(rouvert.bestOf).toEqual(BEST_OF_DEFAUT);
    // Montage express : ses réglages restent, coupe Normal.
    expect(reglagesPourStyle('express', 'youtube', reg).express).toMatchObject({ niveauBlancs: 'normal', transcrire: false });
  });
});

describe('Best-of v4, modules : proposer, jamais de mode voix en silence', () => {
  it('le détecteur de voix est dans l\'appli : seul Whisper est proposé (≈ 90 Mo)', () => {
    expect(propositionModules({ whisper: 'absent', vad: 'absent', empreinte: 'absent' }, true)).toMatchObject({ aProposer: ['whisper'], octets: TAILLE_MODULE, parole: 'voix' });
    expect(propositionModules({ whisper: 'present', vad: 'absent', empreinte: 'absent' }, true)).toMatchObject({ aProposer: [], octets: 0, parole: 'mots' });
    expect(propositionModules({ whisper: 'refuse', vad: 'present', empreinte: 'absent' }, true)).toMatchObject({ aProposer: [], manques: ['textes'] });
    expect(propositionModules({ whisper: 'absent', vad: 'present', empreinte: 'absent' }, false).aProposer).toEqual([]);
  });

  it('refus et connexion : « refuse » pour cette ouverture, « horsLigne » sans internet', () => {
    const lus: ModulesBestOf = { whisper: 'absent', vad: 'present', empreinte: 'absent' };
    expect(modulesAvecRefus(lus, new Set(['whisper']), true).whisper).toBe('refuse');
    expect(modulesAvecRefus(lus, new Set(), false).whisper).toBe('horsLigne');
    expect(modulesAvecRefus({ ...lus, whisper: 'present' }, new Set(['whisper']), false).whisper).toBe('present');
  });

  it('Whisper absent : « Analyser » montre la carte d\'accord et NE lance RIEN (ni analyse, ni téléchargement)', async () => {
    const { parcours, appels, etat } = monde({ whisper: 'absent' });
    await parcours.demanderAnalyse();
    expect(parcours.carte.value).toEqual({ phase: 'proposer', octets: TAILLE_MODULE });
    expect(appels.mesurer).toHaveLength(0);
    expect(appels.telechargerWhisper).toBe(0);
    expect(etat.etat.value.phase).toBe('avant');
  });

  it('« Télécharger » : le module, puis l\'analyse en mode mots', async () => {
    const { parcours, appels, etat } = monde({ whisper: 'absent' });
    await parcours.demanderAnalyse();
    await parcours.accepterModules();
    expect(appels.telechargerWhisper).toBe(1);
    expect(appels.mesurer).toHaveLength(1);
    expect(appels.mesurer[0]!.modules.whisper).toBe('present');
    expect(parcours.carte.value).toBeNull();
    expect(etat.analyse.value?.parole).toBe('mots');
    expect(appels.ecrans).toEqual(['analyse', 'revue']);
  });

  it('« Pas maintenant » : analyse sans le module, et la revue le DIT (module refusé dans l\'analyse)', async () => {
    const { parcours, appels, etat } = monde({ whisper: 'absent' });
    await parcours.demanderAnalyse();
    await parcours.refuserModules();
    expect(appels.telechargerWhisper).toBe(0);
    expect(appels.mesurer[0]!.modules.whisper).toBe('refuse');
    const a = etat.analyse.value as AnalyseV4;
    expect(a.parole).toBe('voix');
    expect(a.modules.whisper).toBe('refuse');
    // Le refus vaut pour cette ouverture : « Analyser » de nouveau ne repropose pas la carte.
    await parcours.demanderAnalyse();
    expect(parcours.carte.value).toBeNull();
    expect(appels.mesurer).toHaveLength(2);
    // Nouvelle ouverture du Montage express : re-proposé.
    parcours.ouvrir();
    await parcours.demanderAnalyse();
    expect(parcours.carte.value?.phase).toBe('proposer');
  });

  it('sans internet : carte « Pas de connexion » puis « Continuer sans »', async () => {
    const { parcours, appels } = monde({ whisper: 'absent', enLigne: false });
    await parcours.demanderAnalyse();
    expect(parcours.carte.value).toEqual({ phase: 'horsLigne' });
    expect(appels.mesurer).toHaveLength(0);
    await parcours.refuserModules();
    expect(appels.mesurer[0]!.modules.whisper).toBe('horsLigne');
  });

  it('téléchargement raté : message, « Réessayer » possible, rien d\'analysé', async () => {
    const { parcours, appels } = monde({ whisper: 'absent', telechargementRate: true });
    await parcours.demanderAnalyse();
    await parcours.accepterModules();
    expect(parcours.carte.value).toMatchObject({ phase: 'erreur', message: 'Plus de place.' });
    expect(appels.mesurer).toHaveLength(0);
  });

  it('Whisper présent : « Analyser » lance tout de suite (chemin en 2 touchers)', async () => {
    const { parcours, appels, etat } = monde();
    await parcours.demanderAnalyse();
    expect(parcours.carte.value).toBeNull();
    expect(appels.mesurer).toHaveLength(1);
    expect(etat.etat.value.phase).toBe('fini');
    expect(etat.scenes.value.some((s) => s.garde)).toBe(true);
  });

  it('bandeau de la revue « Le télécharger et refaire l\'analyse » : carte, puis analyse refaite avec Whisper', async () => {
    const { parcours, appels, etat } = monde({ whisper: 'absent' });
    await parcours.demanderAnalyse();
    await parcours.refuserModules();
    await parcours.telechargerEtRefaire();
    expect(parcours.carte.value?.phase).toBe('proposer');
    await parcours.accepterModules();
    expect(appels.telechargerWhisper).toBe(1);
    expect(etat.analyse.value?.parole).toBe('mots');
  });
});

describe('Best-of v4, revue : tout modifiable, sans réanalyse', () => {
  it('durée annoncée = dureeEstimee (cocher / décocher), et « Monter » grisé sans séquence', async () => {
    const { parcours, etat } = monde();
    await parcours.demanderAnalyse();
    const a = etat.analyse.value as AnalyseV4;
    const scenes = () => etat.scenes.value as SequenceV4[];
    expect(parcours.total.value).toBe(dureeEstimee(a, scenes(), etat.reglages.value));
    const i = scenes().findIndex((s) => s.garde);
    etat.scenes.value = scenes().map((s, k) => (k === i ? { ...s, garde: false } : s));
    expect(parcours.total.value).toBe(dureeEstimee(a, scenes(), etat.reglages.value));
    etat.scenes.value = scenes().map((s) => ({ ...s, garde: false }));
    expect(parcours.possible.value?.possible).toBe(false);
    expect(parcours.total.value).toBe(0);
  });

  it('téléphone : la durée exacte (accroche refaite) attend la fin des touchers ; avant, l\'accroche compte 6 s (relecture point 14)', async () => {
    const { parcours, etat } = monde({ attenteDuree: 30 });
    await parcours.demanderAnalyse();
    const a = etat.analyse.value as AnalyseV4;
    const scenes = () => etat.scenes.value as SequenceV4[];
    await new Promise((r) => setTimeout(r, 60));
    expect(parcours.total.value).toBe(dureeEstimee(a, scenes(), etat.reglages.value));
    const i = scenes().findIndex((s) => s.garde);
    etat.scenes.value = scenes().map((s, k) => (k === i ? { ...s, garde: false } : s));
    // Juste après le toucher : la durée rapide (accroche de 6 s), sans refaire l'habillage.
    expect(parcours.total.value).toBe(dureeEstimee({ morceaux: a.morceaux }, scenes(), etat.reglages.value));
    await new Promise((r) => setTimeout(r, 60));
    expect(parcours.total.value).toBe(dureeEstimee(a, scenes(), etat.reglages.value));
    expect(parcours.possible.value).toMatchObject({ possible: true, total: parcours.total.value });
  });

  it('durée d\'une séquence = même découpe que le montage', async () => {
    const { parcours, etat } = monde();
    await parcours.demanderAnalyse();
    const a = etat.analyse.value as AnalyseV4;
    const s = (etat.scenes.value as SequenceV4[]).find((x) => x.garde)!;
    const seule = dureeEstimee(a, [{ ...s, garde: true }], { niveauBlancs: 'normal', accroche: false });
    expect(dureeSequence(a, s, etat.reglages.value)).toBeCloseTo(seule, 1);
  });

  it('durée visée changée : séquences choisies à nouveau, sans réécouter (mesurer appelé une fois)', async () => {
    const { parcours, appels, etat } = monde();
    await parcours.demanderAnalyse();
    etat.noms.value = { p1: 'Guts' };
    parcours.changerDuree({ min: 30, max: 45 });
    expect(etat.reglages.value.dureeVisee).toEqual({ min: 30, max: 45 });
    expect(appels.mesurer).toHaveLength(1);
    expect(etat.noms.value).toEqual({ p1: 'Guts' });
  });

  it('« Une seule personne » / « Deux » : la chaîne refaite depuis les mesures gardées, noms gardés', async () => {
    const { parcours, appels, etat } = monde();
    await parcours.demanderAnalyse();
    expect((etat.analyse.value as AnalyseV4).voix?.voix).toHaveLength(2);
    etat.noms.value = { p1: 'Guts', p2: 'Romain' };
    parcours.forcerVoix(1);
    expect(parcours.forcer.value).toBe(1);
    expect((etat.analyse.value as AnalyseV4).voix?.voix).toHaveLength(1);
    expect(etat.noms.value).toEqual({ p1: 'Guts' });
    parcours.forcerVoix(2);
    expect((etat.analyse.value as AnalyseV4).voix?.voix).toHaveLength(2);
    expect(appels.mesurer).toHaveLength(1);
    expect(appels.toasts.at(-1)).toBe(TEXTES_V4.revue.voixRefaites(2));
  });

  it('« Plus de contexte » : ajusterSequence (dev-scenes) appelé avec la même découpe ; coche gardée', async () => {
    const { parcours, etat } = monde();
    await parcours.demanderAnalyse();
    const avant = BRANCHEMENTS.ajusterSequence;
    let vu: number | null = null;
    brancherV4({
      ajusterSequence: (s, e, cote, sens) => {
        vu = e.dureeDe([{ de: s.de, a: s.a }]);
        return cote === 'debut' && sens === 1 ? { ...s, de: Math.max(0, s.de - 3) } : s;
      },
    });
    try {
      const i = etat.scenes.value.findIndex((s) => s.garde);
      const de = etat.scenes.value[i]!.de;
      expect(parcours.ajuster(i, 'debut', 1)).toBe(true);
      expect(etat.scenes.value[i]!.de).toBe(Math.max(0, de - 3));
      expect(etat.scenes.value[i]!.garde).toBe(true);
      expect(vu).toBeGreaterThan(0);
      // Rien ne bouge : message, la séquence reste.
      expect(parcours.ajuster(i, 'fin', -1)).toBe(false);
    } finally {
      brancherV4({ ajusterSequence: avant });
    }
  });

  it('détecteur de voix pas chargé : un seul message (le bandeau, avec « Refaire l\'analyse »), pas deux (relecture 16)', () => {
    const av = [TEXTES_VAD.pasCharge, 'Un passage de 43 min sans son n\'est pas proposé.'];
    const a = { avertissements: av, modules: { whisper: 'present', vad: 'erreur', empreinte: 'absent' } } as const;
    expect(avertissementsRevue(a)).toEqual([av[1]]);
    expect(refaireSansPrecision(a)).toBe(true);
    expect(refaireSansPrecision({ modules: { ...a.modules, vad: 'refuse' } })).toBe(false);
    // Détecteur là : rien n'est caché ; sans module sous-titres, « sans transcription » est dans le bandeau.
    expect(avertissementsRevue({ ...a, modules: { ...a.modules, vad: 'present' } })).toEqual(av);
    expect(avertissementsRevue({ avertissements: [TA.express.sansMots], modules: { whisper: 'refuse', vad: 'present', empreinte: 'absent' } }, ['IA'])).toEqual(['IA']);
  });

  it('« Combien de personnes » : 3 voix → « Trois ou plus » actif et « Deux » touchable (relecture point 12)', () => {
    expect(choixCombien(3, null)).toEqual({ actif: 3, choix: [1, 2, 3] });
    expect(choixCombien(3, 2)).toEqual({ actif: 2, choix: [1, 2, 3] });
    expect(choixCombien(2, null)).toEqual({ actif: 2, choix: [1, 2] });
    expect(choixCombien(1, null)).toEqual({ actif: 1, choix: [1, 2] });
    expect(choixCombien(1, 2)).toEqual({ actif: 2, choix: [1, 2] });
  });

  it('mémoire gardée pour recouper : l\'énergie seule, jamais le timbre (8 fois plus gros ; relecture point 8)', () => {
    const e = { pas: 0.02, duree: 10, db: new Float32Array(500), bandes: new Float32Array(4000) };
    const g = mesuresGardeesDe({ vad: null, empreintes: [e], hauteur: null })!;
    expect(g.energie).toEqual({ pas: 0.02, db: e.db });
    expect((g.energie as unknown as Record<string, unknown>).bandes).toBeUndefined();
    expect(mesuresGardeesDe({ vad: null, empreintes: [], hauteur: null })).toBeNull();
  });

  it('« Plus de contexte » ne déborde jamais sur une séquence voisine COCHÉE (relecture point 3)', async () => {
    const { parcours, etat, appels: vus } = monde();
    await parcours.demanderAnalyse();
    const avant = BRANCHEMENTS.ajusterSequence;
    const liste = etat.scenes.value;
    // Deux séquences : la 2ᵉ commence juste après la 1ʳᵉ ; « + 1 phrase » à la fin de la 1ʳᵉ entrerait dedans.
    const [x, y] = [liste[0]!, liste[1]!];
    etat.scenes.value = [{ ...x, garde: true }, { ...y, de: x.a + 0.1, garde: true }, ...liste.slice(2)];
    brancherV4({ ajusterSequence: (s, _e, cote) => (cote === 'fin' ? { ...s, a: s.a + 5 } : s) });
    try {
      expect(parcours.ajuster(0, 'fin', 1)).toBe(false);
      expect(etat.scenes.value[0]!.a).toBe(x.a);
      expect(vus.toasts.at(-1)).toBe(TEXTES_V4.revue.reglageImpossible);
      // La voisine décochée : permis.
      etat.scenes.value = etat.scenes.value.map((z, k) => (k === 1 ? { ...z, garde: false } : z));
      expect(parcours.ajuster(0, 'fin', 1)).toBe(true);
      expect(etat.scenes.value[0]!.a).toBe(x.a + 5);
    } finally {
      brancherV4({ ajusterSequence: avant });
    }
  });

  it('empreinte de voix acceptée : téléchargée APRÈS le geste, calculée sur les morceaux demandés, chaîne refaite', async () => {
    const { parcours, appels, etat } = monde();
    await parcours.demanderAnalyse();
    expect(appels.telechargerEmpreinte).toBe(0);
    const a = etat.analyse.value as AnalyseV4;
    const avecBesoin: AnalyseV4 = { ...a, besoins: { ...a.besoins, empreintes: [{ de: 10, a: 11.5 }, { de: 200, a: 201.5 }], raisonEmpreinte: 'memeNiveau' } };
    etat.analyse.value = avecBesoin;
    await parcours.accepterEmpreinte();
    expect(appels.telechargerEmpreinte).toBe(1);
    expect(appels.empreintes).toBe(1);
    expect(appels.neurales.at(-1)).toBe(true);
    expect(parcours.empreinte.value.phase).toBe('faite');
    expect(appels.mesurer).toHaveLength(1);
    expect(appels.toasts.at(-1)).toBe(TEXTES_V4.revue.empreinte.faite);
  });

  it('QA : l\'empreinte ne trouve qu\'une voix → le message le dit (pas « Voix séparées »)', async () => {
    const { parcours, appels, etat } = monde();
    await parcours.demanderAnalyse();
    parcours.forcerVoix(1); // la chaîne refaite donne une seule voix (voixFabriquee)
    const a = etat.analyse.value as AnalyseV4;
    const avecBesoin: AnalyseV4 = { ...a, besoins: { ...a.besoins, empreintes: [{ de: 10, a: 11.5 }], raisonEmpreinte: 'memeNiveau' } };
    etat.analyse.value = avecBesoin;
    await parcours.accepterEmpreinte();
    expect(parcours.empreinte.value.phase).toBe('faite');
    expect((etat.analyse.value as AnalyseV4).voix?.voix).toHaveLength(1);
    expect(appels.toasts.at(-1)).toBe(TEXTES_V4.revue.empreinte.uneSeule);
  });

  it('étapes de l\'analyse à l\'écran (son, qui parle, mots, moments) et ★ du centile', () => {
    expect(etapesAnalyse(0, true)).toEqual(['encours', 'avenir', 'avenir', 'avenir']);
    expect(etapesAnalyse(0.5, true)).toEqual(['fait', 'fait', 'encours', 'avenir']);
    expect(etapesAnalyse(0.5, false)).toEqual(['fait', 'fait', 'saute', 'avenir']);
    expect(etapesAnalyse(1, true)).toEqual(['fait', 'fait', 'fait', 'fait']);
    expect([0, 19, 21, 60, 100].map(etoiles)).toEqual([1, 1, 2, 3, 5]);
  });
});

describe('Best-of v4, montage : UN seul modifier() = un seul Annuler', () => {
  it('nouveau projet, montage sans musique, musique automatique, volume final : une seule opération', async () => {
    const { parcours, appels, etat, recette } = monde();
    await parcours.demanderAnalyse();
    const annoncee = parcours.total.value!;
    expect(await parcours.monter()).toBe(true);
    expect(appels.modifier).toBe(1);
    expect(appels.musiqueAuto).toBe(1);
    expect(appels.apres).toBe(1);
    // VAD + énergie gardées en mémoire pour recouper après coup (Habiller → Couper) sans réécouter.
    expect(appels.gardees).toEqual([true]);
    const r = recette()!;
    expect(r.titre).toBe('Best-of — session');
    expect(r.plans.length).toBeGreaterThan(2);
    expect(r.musique?.morceaux.length).toBe(1);
    expect(r.volumeFinal).toEqual({ lufs: -13, crete: -1.5 });
    expect(r.blancs?.niveau).toBe('normal');
    expect(annoncee).toBeGreaterThan(0);
    // L'écran du Montage express est vidé.
    expect(etat.analyse.value).toBeNull();
    expect(etat.source.value).toBeNull();
    expect(etat.montageEnCours.value).toBe(false);
  });

  it('montage qui plante : message, revue gardée, l\'écran ne se ferme pas', async () => {
    const m = monde();
    await m.parcours.demanderAnalyse();
    const casse = { ...m, parcours: creerParcoursBestOf(m.etat, { ...servicesDe(m), ouvrirProjet: async () => Promise.reject(new ErreurArko('Plus de place.', 'espace')) }) };
    // Le parcours neuf n'a pas les mesures, mais l'analyse (signals partagés) est là : on peut monter.
    expect(await casse.parcours.monter()).toBe(false);
    expect(m.appels.toasts.at(-1)).toBe('Plus de place.');
    expect(m.etat.analyse.value).not.toBeNull();
    expect(m.etat.montageEnCours.value).toBe(false);
    expect(m.appels.apres).toBe(0);
  });

  it('rien de coché : pas de projet, pas d\'opération', async () => {
    const { parcours, appels, etat } = monde();
    await parcours.demanderAnalyse();
    etat.scenes.value = etat.scenes.value.map((s) => ({ ...s, garde: false }));
    expect(await parcours.monter()).toBe(false);
    expect(appels.modifier).toBe(0);
  });

  it('musique décochée et aucun morceau choisi : montage sans musique, toujours une seule opération', async () => {
    const { parcours, appels, etat, recette } = monde();
    await parcours.demanderAnalyse();
    etat.reglages.value = { ...etat.reglages.value, musiqueAuto: false, musique: [] };
    expect(await parcours.monter()).toBe(true);
    expect(appels.modifier).toBe(1);
    expect(appels.musiqueAuto).toBe(0);
    expect(recette()!.musique).toBeUndefined();
  });
});
