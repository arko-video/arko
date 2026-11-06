// Échafaudage du Montage auto (contrat : conception/contrat-montage-auto.md).
// 1. Les anciens montages s'ouvrent EXACTEMENT pareil (sortie du normaliseur figée avant l'échafaudage).
// 2. Les nouveaux champs facultatifs passent le normaliseur (gardés, corrigés, idempotents).
// 3. Les crochets du moteur : neutres pour un ancien montage, actifs avec les nouveaux champs.
// 4. Toutes les fonctions du contrat sont écrites (plus aucune ne lève « pas_encore_fait ») ; le mécanisme reste.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fondusDesCoupes, FONDUS_HABITUELS } from '../../moteur/audio/fondus-coupes';
import { mixerBloc } from '../../moteur/audio/mixeur';
import { preparerMusique } from '../../moteur/audio/musique';
import { imageRognee, rognagesParSource } from '../../moteur/rognage';
import type { ImageSource } from '../../moteur/canevas';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import { CLES_RECETTE_AUTO } from '../../recette/normaliser-auto';
import * as ops from '../../recette/operations';
import { estPasEncoreFait, pasEncoreFait } from '../pas-encore-fait';
import type { Recette } from '../../recette/types';
import { TA } from '../../textes-auto';
import { lireDrapeaux, visible } from '../../ui/auto/drapeaux';
import { apercuBlancs, morceauxDeParole, REGLAGES_BLANCS } from '../coupes/blancs';
import { cadreRognage, detecterBords } from '../coupes/rognage-detection';
import { zonesDeVoix } from '../coupes/voix';
import { choisirScenes, decouperScenes } from '../express/scenes';
import { masquerJuron } from '../habillage/jurons';
import { trouverPunchlines } from '../habillage/punchlines';
import { FORCES_ZOOMS_AUTO, planifierZoomsAuto } from '../habillage/zooms-auto';
import { signauxDepuisEnveloppe } from '../signaux-source';
import { proposerBruitages } from '../son/bruitages';
import { choisirSon, SONS_ARKO_CATEGORIES } from '../son/choix-son';
import { avisMusique } from '../son/credits';
import { DECLENCHEURS_DEFAUT } from '../son/declencheurs';
import { catalogueIds } from '../../sons/catalogue';
import { ANCIENS_MONTAGES } from './anciens-montages';

const FIGE = JSON.parse(readFileSync(join(__dirname, 'anciens-montages.fige.json'), 'utf8')) as Record<string, unknown>;

function anciennesEntrees(): [string, unknown][] {
  const res: [string, unknown][] = Object.entries(ANCIENS_MONTAGES);
  for (const dossier of ['src/recette/exemples', 'src/recette/__tests__/erreurs-ia']) {
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.json')).sort()) {
      res.push([`${dossier.split('/').pop()}/${f}`, readFileSync(join(dossier, f), 'utf8')]);
    }
  }
  return res;
}

describe('anciens montages', () => {
  const entrees = anciennesEntrees();

  it('couvre bien les recettes figées', () => {
    expect(entrees.map(([nom]) => nom).sort()).toEqual(Object.keys(FIGE).sort());
  });

  it.each(entrees)('%s s\'ouvre exactement pareil', (nom, brut) => {
    expect(JSON.parse(JSON.stringify(normaliser(brut)))).toEqual(FIGE[nom]);
  });

  it('ne reçoivent aucun champ du Montage auto, ni dans la recette ni dans le scénario', () => {
    for (const [, brut] of entrees) {
      const { recette } = normaliser(brut);
      for (const cle of CLES_RECETTE_AUTO) expect(recette).not.toHaveProperty(cle);
      if (recette.plans.length > 0) expect(compiler(recette).plans.some((p) => 'zoomFixe' in p)).toBe(false);
    }
  });
});

const s1 = { id: 's1', nom: 'obs.mp4', taille: 1, emp: 'e1', duree: 7200, type: 'video' as const, l: 1280, h: 720 };
const a1 = { id: 'a1', nom: 'Kevin MacLeod - Monkeys.mp3', taille: 1, emp: 'e2', duree: 120, type: 'audio' as const };
const a2 = { id: 'a2', nom: 'bruh.mp3', taille: 1, emp: 'e3', duree: 1, type: 'audio' as const };

/** Une recette qui utilise TOUS les nouveaux champs. */
function recetteAuto(): unknown {
  return {
    format: 'arko.recette/1',
    destination: 'youtube',
    sources: [s1, a1, a2],
    plans: [{ de: 10, a: 20, zoomFixe: { force: 1.32, y: 0.45 } }, { de: 30, a: 40 }],
    mise: { type: 'recadre', x: 0.5 },
    textes: [{ txt: 'LE CHÂTEAU', role: 'section', style: 'bandeau', t: 0, dur: 2.2 }],
    sousTitres: { style: 'punchline', mode: 'punchlines', punchlines: [{ ts: 12, fin: 13.5 }], couleurCle: 'rouge', jurons: 'masques', mots: [['putain', 12, 12.4, 1]] },
    sons: [{ id: 'a2', ts: 12.1, vol: 0.63, role: 'bruitage', dur: 3, fondu: 0.3 }, { id: 'whoosh.rapide', t: 0, role: 'section' }],
    zooms: [],
    guide: null,
    boucle: false,
    export: {},
    blancs: { niveau: 'normal', fonduEntree: 0.02, fonduSortie: 0.04 },
    rognages: [{ src: 's1', x: 53 / 1280, y: 20 / 720, l: 1173 / 1280, h: 660 / 720 }],
    musique: { morceaux: [{ src: 'a1', t: 0 }], vol: 0.14, baisse: true, fonduEntree: 1.2, fonduSortie: 1.5 },
    volumeFinal: { lufs: -14, crete: -1.5 },
    sections: { source: 'chapitres', son: true, dur: 2.2 },
  };
}

describe('nouveaux champs facultatifs', () => {
  it('sont gardés tels quels, sans aucun problème signalé', () => {
    const { recette, problemes } = normaliser(recetteAuto());
    expect(problemes).toEqual([]);
    expect(recette.blancs).toEqual({ niveau: 'normal', fonduEntree: 0.02, fonduSortie: 0.04 });
    expect(recette.rognages).toEqual([{ src: 's1', x: 0.0414, y: 0.0278, l: 0.9164, h: 0.9167 }]);
    expect(recette.musique?.morceaux).toEqual([{ src: 'a1', t: 0 }]);
    expect(recette.volumeFinal).toEqual({ lufs: -14, crete: -1.5 });
    expect(recette.sections).toEqual({ source: 'chapitres', son: true, dur: 2.2 });
    expect(recette.plans[0]!.zoomFixe).toEqual({ force: 1.32, y: 0.45 });
    expect(recette.textes[0]).toMatchObject({ role: 'section', style: 'bandeau' });
    expect(recette.sousTitres).toMatchObject({ style: 'punchline', mode: 'punchlines', couleurCle: 'rouge', punchlines: [{ ts: 12, fin: 13.5 }] });
    expect(recette.sons[0]).toMatchObject({ role: 'bruitage', dur: 3, fondu: 0.3 });
    expect(compiler(recette).plans[0]!.zoomFixe).toEqual({ force: 1.32, y: 0.45 });
  });

  it('le normaliseur est idempotent', () => {
    const une = normaliser(recetteAuto()).recette;
    const deux = normaliser(JSON.parse(JSON.stringify(une))).recette;
    expect(deux).toEqual(une);
  });

  it('corrige les valeurs fausses avec un message en français', () => {
    const brut = recetteAuto() as Record<string, unknown>;
    brut.plans = [{ de: 10, a: 20, zoomFixe: { force: 9 } }, { de: 30, a: 40, zoomFixe: 1 }];
    brut.rognages = [{ src: 's9', x: 0, y: 0, l: 0.9, h: 0.9 }, { src: 's1', l: 0.1, h: 1 }];
    brut.musique = { morceaux: [{ src: 'a7', t: 0 }] };
    brut.blancs = { niveau: 'enorme' };
    brut.sousTitres = { mode: 'bof', mots: 'auto' };
    const { recette, problemes } = normaliser(brut);
    expect(recette.plans[0]!.zoomFixe).toEqual({ force: 2.5 });
    expect(recette.plans[1]).not.toHaveProperty('zoomFixe');
    expect(recette.rognages).toEqual([{ src: 's1', x: 0, y: 0, l: 0.5, h: 1 }]);
    expect(recette).not.toHaveProperty('musique');
    expect(recette.blancs?.niveau).toBe('normal');
    expect(recette.sousTitres).not.toHaveProperty('mode');
    const textes = problemes.map((p) => p.message).join('\n');
    expect(textes).toContain('La vidéo "s9" n\'existe pas');
    expect(textes).toContain('Le son "a7" de la musique n\'est plus là');
    expect(textes).toContain('Le réglage "enorme" n\'existe pas');
    expect(textes).toContain('Le mode "bof" n\'existe pas');
  });

  it('les sources audio de la musique ne sont jamais retirées comme « inutiles »', () => {
    const { recette } = normaliser(recetteAuto(), undefined, { retirerSourcesAudioInutiles: true });
    expect(recette.sources.map((s) => s.id)).toEqual(['s1', 'a1', 'a2']);
  });

  it('le schéma JSON décrit tous les nouveaux champs', () => {
    const schema = JSON.parse(readFileSync('src/recette/schema.json', 'utf8'));
    for (const cle of [...CLES_RECETTE_AUTO, 'destination', 'chapitres', 'intro', 'outro']) expect(schema.properties).toHaveProperty(cle);
    expect(schema.$defs.plan.properties).toHaveProperty('zoomFixe');
    expect(Object.keys(schema.$defs.sousTitres.properties)).toEqual(expect.arrayContaining(['mode', 'punchlines', 'couleurCle', 'jurons']));
    expect(Object.keys(schema.$defs.son.properties)).toEqual(expect.arrayContaining(['role', 'dur', 'fondu']));
  });
});

describe('crochets du moteur', () => {
  const r = normaliser(recetteAuto()).recette;

  it('rognage : image inchangée ; rognages rangés par source', () => {
    const image: ImageSource = { largeur: 1280, hauteur: 720, dessiner: () => undefined };
    expect(rognagesParSource(r).get('s1')?.l).toBe(0.9164);
    expect(imageRognee(image, undefined)).toBe(image);
  });

  it('fondus aux coupes : 20 / 40 ms avec « Couper les blancs », 5 ms sans ; musique préparée seulement si elle existe', () => {
    expect(fondusDesCoupes(r)).toEqual({ entree: 0.02, sortie: 0.04 });
    const sansBlancs: Recette = { ...r };
    delete sansBlancs.blancs;
    expect(fondusDesCoupes(sansBlancs)).toEqual(FONDUS_HABITUELS);
    expect(FONDUS_HABITUELS).toEqual({ entree: 0.005, sortie: 0.005 });
    const sansMusique: Recette = { ...r };
    delete sansMusique.musique;
    expect(preparerMusique(sansMusique, compiler(sansMusique), async () => null)).toBeNull();
    expect(typeof preparerMusique(r, compiler(r), async () => null)?.bloc).toBe('function');
  });

  it('le mixeur donne le même son avec les fondus habituels passés ou non', () => {
    const scenario = compiler(r);
    const n = 48000;
    const pcm = { frequence: 48000, debut: 0, canaux: [new Float32Array(48000 * 20).fill(0.3)] };
    const morceaux = () => [pcm, { ...pcm, debut: 30 }]; // le bloc [9,5 ; 10,5[ chevauche la coupe à 10 s
    const sans = mixerBloc({ scenario, t0: 9.5, n, pcmMorceaux: morceaux() });
    const avec = mixerBloc({ scenario, t0: 9.5, n, pcmMorceaux: morceaux(), fondus: FONDUS_HABITUELS, musique: null });
    expect(avec).toEqual(sans);
  });
});

describe('fonctions du contrat : toutes écrites', () => {
  const r = normaliser(recetteAuto()).recette;
  const appels: [string, () => unknown][] = [
    ['signauxDepuisEnveloppe', () => signauxDepuisEnveloppe('s1', 1, 0.02, new Float32Array(50))],
    ['morceauxDeParole', () => morceauxDeParole([], null, REGLAGES_BLANCS.normal)],
    ['apercuBlancs', () => apercuBlancs(r, [])],
    ['zonesDeVoix', () => zonesDeVoix({ pas: 0.02, db: new Float32Array(1) })],
    ['detecterBords', () => detecterBords([], 1280, 720)],
    ['cadreRognage', () => cadreRognage({ haut: 20, bas: 40, gauche: 0, droite: 0 }, 1280, 720, 16 / 9)],
    ['couperLesBlancs', () => ops.couperLesBlancs(r, [], 'normal')],
    ['rognerSource', () => ops.rognerSource(r, 's1', null)],
    ['trouverPunchlines', () => trouverPunchlines([], null)],
    ['masquerJuron', () => masquerJuron('putain')],
    ['planifierZoomsAuto', () => planifierZoomsAuto([], [], 'normal', 's1')],
    ['zoomsAutomatiques', () => ops.zoomsAutomatiques(r, null, 'normal')],
    ['titresDeSection', () => ops.titresDeSection(r, { source: 'chapitres' })],
    ['choisirModeSousTitres', () => ops.choisirModeSousTitres(r, 'punchlines')],
    ['proposerBruitages', () => proposerBruitages([], 's1', null, DECLENCHEURS_DEFAUT)],
    ['choisirSon', () => choisirSon('bruh', [])],
    ['avisMusique', () => avisMusique([])],
    ['poserBruitages', () => ops.poserBruitages(r, [], [])],
    ['definirMusique', () => ops.definirMusique(r, null, [])],
    ['choisirVolumeFinal', () => ops.choisirVolumeFinal(r, null)],
    ['decouperScenes', () => decouperScenes([], null)],
    ['choisirScenes', () => choisirScenes([], [], null, 60)],
  ];
  it.each(appels)('%s ne lève plus « pas_encore_fait »', (_nom, appel) => {
    expect(appel).not.toThrow();
  });

  it('le mécanisme « pas encore fait » reste disponible pour la suite', () => {
    expect(() => pasEncoreFait('Essai')).toThrowError(expect.objectContaining({ code: 'pas_encore_fait' }) as Error);
    let e: unknown;
    try {
      pasEncoreFait('Essai');
    } catch (x) {
      e = x;
    }
    expect(estPasEncoreFait(e)).toBe(true);
  });
});

describe('données du contrat', () => {
  it('les sons d\'Arko de secours des bruitages existent tous', () => {
    for (const id of Object.values(SONS_ARKO_CATEGORIES)) expect(catalogueIds()).toContain(id);
  });

  it('réglages « Normal » = ceux qui ont marché sur la vraie vidéo', () => {
    expect(REGLAGES_BLANCS.normal).toMatchObject({ avant: 0.25, apres: 0.35, fusion: 0.5, fortDb: -16, morceauMin: 0.35, fonduEntree: 0.02, fonduSortie: 0.04 });
    expect(FORCES_ZOOMS_AUTO.normal).toEqual({ fort: 1.32, leger: 1.12 });
  });

  it('boutons cachés par défaut ; drapeaux forcés lus depuis « tout » ou une liste', () => {
    expect(visible('blancs', false)).toBe(false);
    expect(visible('blancs', true)).toBe(true);
    expect(lireDrapeaux('tout').size).toBe(9);
    expect([...lireDrapeaux('blancs, musique inconnu')]).toEqual(['blancs', 'musique']);
    expect(lireDrapeaux(null).size).toBe(0);
  });

  it('textes en français', () => {
    expect(TA.coupes.blancs.apercu('2 h 03', '41 min', 312)).toBe('2 h 03 → 41 min de parole · 312 coupes');
    // Règle des textes : espace insécable avant « : » et entre le nombre et l'unité (décidé par l'intégrateur le 6/11).
    expect(TA.son.volume.bilan('−14,0', '−1,6')).toBe('Volume\u00a0: −14,0\u00a0LUFS · crête −1,6\u00a0dBTP');
  });
});

// Une recette qui utilise tous les nouveaux champs se compile (durée = somme des plans).
it('une recette auto passe dans compiler sans erreur', () => {
  const r: Recette = normaliser(recetteAuto()).recette;
  expect(compiler(r).duree).toBe(20);
});
