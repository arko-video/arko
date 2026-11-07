// Échafaudage de la v3 « Best-of » (contrat : conception/contrat-wankil.md). Fichier GELÉ (intégrateur).
// 1. Les fonctions publiques du contrat existent (les devs les écrivent ; leurs tests vont dans LEURS fichiers).
// 2. Les crochets du moteur sont neutres pour un ancien montage (aucun élément inséré, avatar, bip ni piste).
// 3. Données figées : catalogue des chibis, variantes, hasard reproductible, drapeaux, textes.
// Les `it.todo` du minimum attendu de chaque dev ont été retirés à l'intégration (7/11/2026) : leurs tests sont
// dans les fichiers *.test.ts des devs (recit, derush, qui-parle, insertion, pistes, bips, chibis, avatars).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCESSOIRES, COIFFURES, EMOTIONS, SITUATIONS, STYLES_CHIBI, TENUES } from '../../chibis/catalogue';
import { aleatoire } from '../../chibis/hasard';
import { variantes } from '../../chibis/variantes';
import { preparerBips } from '../../moteur/audio/bips';
import { lireSonDuPlan } from '../../moteur/audio/pistes';
import { CacheDecodage } from '../../moteur/cache-decodage';
import type { MediaOuvert } from '../../moteur/media';
import { preparerAvatars } from '../../moteur/couches/avatars';
import { preparerInserts } from '../../moteur/inserts/inserts';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import * as ops from '../../recette/operations';
import { TV } from '../../textes-v3';
import { DRAPEAUX_V3, lireDrapeauxV3, visible } from '../../ui/auto/drapeaux';
import * as recit from '../../ia/recit';
import * as notation from '../derush/notation';
import * as derush from '../derush/derush';
import * as quiParle from '../voix/qui-parle';
import * as attribution from '../voix/attribution';
import * as bestOf from '../express/best-of';
import { ANCIENS_MONTAGES } from './anciens-montages';
import { MONTAGES_V2 } from './montages-v2';
import { RECETTE_V3 } from './recette-v3';

describe('fonctions du contrat', () => {
  const attendues: [string, unknown][] = [
    // Dev 1
    ['bornesRacontees', recit.bornesRacontees], ['dedoublonner', recit.dedoublonner],
    ['indicesScene', notation.indicesScene], ['noterIndices', notation.noterIndices], ['raisonIndices', notation.raisonIndices],
    ['echangesRapides', notation.echangesRapides], ['estProtegee', notation.estProtegee],
    ['noterScenes', derush.noterScenes], ['resserrer', derush.resserrer], ['choisirBestOf', derush.choisirBestOf],
    ['separerVoix', quiParle.separerVoix], ['voixDesPistes', quiParle.voixDesPistes], ['extraitsDeVoix', quiParle.extraitsDeVoix],
    ['personneDuMot', attribution.personneDuMot], ['phrasesParPersonne', attribution.phrasesParPersonne],
    ['definirQuiParle', ops.definirQuiParle], ['renommerPersonne', ops.renommerPersonne], ['attribuerPhrase', ops.attribuerPhrase],
    ['personneSuivante', ops.personneSuivante], ['retirerQuiParle', ops.retirerQuiParle],
    ['indicesTitres', ops.indicesTitres], ['retirerTitres', ops.retirerTitres], ['changerTitre', ops.changerTitre],
    ['definirPassages', ops.definirPassages], ['ajouterPassage', ops.ajouterPassage],
    // Dev 2
    ['insererElement', ops.insererElement], ['decalerApres', ops.decalerApres], ['deplacerElement', ops.deplacerElement],
    ['supprimerElement', ops.supprimerElement], ['modifierElement', ops.modifierElement], ['estElementInsere', ops.estElementInsere],
    ['choisirPistes', ops.choisirPistes], ['choisirBips', ops.choisirBips],
    // Dev 3
    ['activerAvatars', ops.activerAvatars], ['donnerChibi', ops.donnerChibi], ['placerAvatar', ops.placerAvatar], ['montrerAvatar', ops.montrerAvatar],
    // Intégrateur
    ['analyserPourBestOf', bestOf.analyserPourBestOf], ['scenesBestOf', bestOf.scenesBestOf], ['construireBestOf', bestOf.construireBestOf],
  ];
  it.each(attendues)('%s existe', (_nom, f) => expect(typeof f).toBe('function'));
});

describe('crochets du moteur : neutres pour un ancien montage', () => {
  const anciens = Object.values({ ...ANCIENS_MONTAGES, ...MONTAGES_V2 }).map((b) => normaliser(b).recette).filter((r) => r.plans.length > 0);

  it('aucun élément inséré, avatar ni bip préparé', () => {
    for (const r of anciens) {
      const sc = compiler(r);
      expect(preparerInserts(r)).toBeNull();
      expect(preparerAvatars(r, sc)).toBeNull();
      expect(preparerBips(r, sc)).toBeNull();
    }
  });

  it('le son d\'un plan sans réglage de pistes vient de la piste principale, à l\'identique', async () => {
    const pcm = { frequence: 48000, debut: 10, canaux: [new Float32Array(480)] };
    const demandes: number[][] = [];
    const lecteur = { lire: async (a: number, b: number) => (demandes.push([a, b]), pcm), fermer: async () => undefined };
    const cache = new CacheDecodage({ video: () => null, audio: () => lecteur as never });
    cache.preparer(new Map([['s1', {} as MediaOuvert]]));
    const r = anciens[0]!;
    expect(await lireSonDuPlan(cache, r, 's1', 10, 10.01)).toBe(pcm);
    expect(demandes).toEqual([[10, 10.01]]);
    expect(await lireSonDuPlan(cache, r, 'inconnue', 0, 1)).toBeNull();
  });

  it('un élément inséré a une image (échafaudage : noire), un plan vidéo n\'en a pas', () => {
    const r = normaliser(RECETTE_V3()).recette;
    const sc = compiler(r);
    const inserts = preparerInserts(r)!;
    const env = { l: 1920, h: 1080, echelle: 1 };
    expect(inserts.image(sc.plans[0]!, env)).toBeNull();
    expect(inserts.image(sc.plans[4]!, env)).toBeNull(); // clip inséré = plan vidéo
    expect(inserts.image(sc.plans[2]!, env)).toMatchObject({ largeur: 1920, hauteur: 1080 });
  });
});

describe('données figées', () => {
  it('catalogue : 3 styles d\'origine (toujours en tête) + 6 styles « Persos » ajoutés à la fin, 24 émotions, au moins 8 coiffures, tenues et accessoires', () => {
    expect(STYLES_CHIBI.slice(0, 3)).toEqual(['feutre', 'crayon', 'paint']);
    expect(STYLES_CHIBI.slice(3)).toEqual(['bd', 'cartoon', 'rate', 'mascotte', 'pixel', 'papier']);
    expect(EMOTIONS).toHaveLength(24);
    expect(COIFFURES.length).toBeGreaterThanOrEqual(8);
    expect(TENUES.length).toBeGreaterThanOrEqual(8);
    expect(ACCESSOIRES.filter((a) => a !== 'aucun').length).toBeGreaterThanOrEqual(8);
    for (const t of ['sweat', 'tshirt', 'armure', 'astronaute', 'cowboy', 'pyjama']) expect(TENUES).toContain(t);
    for (const a of ['casquette', 'casqueAudio', 'lunettes']) expect(ACCESSOIRES).toContain(a);
  });

  it('48 variantes par chibi et par style (24 émotions × bouche fermée / ouverte)', () => {
    const v = variantes();
    expect(v).toHaveLength(48);
    expect(v.slice(0, 2)).toEqual([{ emo: 'parle', bouche: false }, { emo: 'parle', bouche: true }]);
  });

  it('le hasard des chibis est reproductible', () => {
    const a = aleatoire(42);
    const b = aleatoire(42);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('le schéma JSON reprend les listes du catalogue', () => {
    const schema = JSON.parse(readFileSync('src/recette/schema.json', 'utf8'));
    expect(schema.$defs.emotion.enum).toEqual([...EMOTIONS]);
    expect(schema.$defs.chibi.properties.tenue.enum).toEqual([...TENUES]);
    expect(schema.$defs.chibi.properties.accessoire.enum).toEqual([...ACCESSOIRES]);
    expect(schema.$defs.chibi.properties.style.enum).toEqual([...STYLES_CHIBI]);
    expect(schema.$defs.situation.enum).toEqual([...SITUATIONS]);
  });

  it('drapeaux v3 : cachés par défaut, forcés par « tout » ou une liste', () => {
    expect(visible('insertion', false)).toBe(false);
    expect(visible('insertion', true)).toBe(true);
    expect(lireDrapeauxV3('tout').size).toBe(DRAPEAUX_V3.length);
    expect([...lireDrapeauxV3('chibis, blancs avatars')]).toEqual(['chibis', 'avatars']);
  });

  it('textes en français (espace insécable avant « ? » et « : »)', () => {
    expect(TV.voix.titre).toBe('Qui parle ?');
    expect(TV.derush.passages.note(72)).toBe('Note : 72/100');
    expect(Object.keys(TV.chibis.emotions)).toEqual([...EMOTIONS]);
  });
});
