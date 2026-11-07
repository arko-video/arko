// Échafaudage de la v3 « Best-of » (contrat : conception/contrat-wankil.md). Fichier GELÉ (intégrateur).
// 1. Les montages d'avant la v3 (Montage auto, Améliorer l'image, Ma bibliothèque compris) s'ouvrent EXACTEMENT pareil :
//    sortie du normaliseur ET scénario compilé identiques à ceux figés AVANT l'échafaudage (montages-v2.fige.json).
// 2. Les nouveaux champs facultatifs passent le normaliseur (gardés, corrigés avec un message, idempotents).
// 3. Un plan inséré sans vidéo se compile (source vide, durée comptée).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliser } from '../../recette/normaliser';
import { CLES_RECETTE_V3 } from '../../recette/normaliser-v3';
import { ANCIENS_MONTAGES } from './anciens-montages';
import { MONTAGES_V2 } from './montages-v2';
import { RECETTE_V3 } from './recette-v3';

const FIGE = JSON.parse(readFileSync(join(__dirname, 'montages-v2.fige.json'), 'utf8')) as Record<string, unknown>;
const ENTREES = Object.entries({ ...ANCIENS_MONTAGES, ...MONTAGES_V2 });

describe('montages d\'avant la v3', () => {
  it('couvre bien les montages figés', () => {
    expect(ENTREES.map(([nom]) => nom).sort()).toEqual(Object.keys(FIGE).sort());
  });

  it.each(ENTREES)('%s s\'ouvre exactement pareil (recette et scénario)', (nom, brut) => {
    const n = normaliser(brut);
    const obtenu = { normalise: n, scenario: n.recette.plans.length > 0 ? compiler(n.recette) : null };
    expect(JSON.parse(JSON.stringify(obtenu))).toEqual(FIGE[nom]);
  });

  it('ne reçoivent aucun champ de la v3', () => {
    for (const [, brut] of ENTREES) {
      const { recette } = normaliser(brut);
      for (const cle of CLES_RECETTE_V3) expect(recette).not.toHaveProperty(cle);
      expect(recette.plans.some((p) => 'ins' in p)).toBe(false);
      expect(recette.sources.some((s) => 'pistes' in s)).toBe(false);
    }
  });
});

describe('champs de la v3', () => {
  it('sont gardés tels quels, sans aucun problème signalé', () => {
    const { recette, problemes } = normaliser(RECETTE_V3());
    expect(problemes).toEqual([]);
    expect(recette.personnes?.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(recette.personnes?.[0]?.chibi?.coiffure).toBe('herisses');
    expect(recette.paroles).toHaveLength(3);
    expect(recette.paroles?.[0]).toMatchObject({ p: 'p1', emo: 'rit', b: 'f/A=' });
    expect(recette.avatars).toEqual({ mode: 'parle', rebond: true, tenue: 0.5 });
    expect(recette.derush?.passages[0]).toMatchObject({ note: 72, titre: 'Le pont' });
    expect(recette.images).toEqual([{ id: 'i1', nom: 'carte.png', emp: 'e9', taille: 2000, l: 800, h: 600 }]);
    expect(recette.pistesAudio).toEqual([{ src: 's1', pistes: [{ n: 0, nom: 'Micro' }, { n: 1, vol: 0.8, nom: 'Discord' }] }]);
    expect(recette.bips).toEqual({ son: 'bip' });
    expect(recette.sources[0]!.pistes).toBe(2);
    expect(recette.plans.map((p) => p.ins?.type ?? '-')).toEqual(['-', 'image', 'carton', 'chibi', 'clip']);
    expect(recette.plans[1]).toMatchObject({ de: 0, a: 2, mise: { type: 'flou', y: 0.5 } });
    expect(recette.plans[2]).toMatchObject({ de: 0, a: 1.5, mise: { type: 'recadre', x: 0.5 } });
  });

  it('le normaliseur est idempotent', () => {
    const une = normaliser(RECETTE_V3()).recette;
    expect(normaliser(JSON.parse(JSON.stringify(une))).recette).toEqual(une);
  });

  it('corrige les valeurs fausses avec un message en français', () => {
    const brut = RECETTE_V3() as Record<string, unknown>;
    brut.plans = [{ de: 10, a: 20 }, { ins: { type: 'image', img: 'i9' }, de: 0, a: 2 }, { ins: { type: 'carton', txt: 'Plus tard' }, de: 0, a: 99, vit: 2 }];
    brut.paroles = [{ ts: 12, fin: 11, p: 'p1', emo: 'heureux' }, { ts: 1, fin: 2, p: 'p7' }];
    brut.personnes = [{ id: 'p1', nom: '', chibi: { style: 'aquarelle', coiffure: 'mulet' } }];
    brut.pistesAudio = [{ src: 's1', pistes: [{ n: 5 }] }];
    const { recette, problemes } = normaliser(brut);
    expect(recette.plans).toHaveLength(2);
    expect(recette.plans[1]).toMatchObject({ de: 0, a: 30 });
    expect(recette.plans[1]).not.toHaveProperty('vit');
    expect(recette.paroles).toEqual([{ ts: 11, fin: 12, p: 'p1' }]);
    expect(recette.personnes?.[0]).toMatchObject({ nom: 'Voix 1', chibi: { style: 'feutre', coiffure: 'courts' } });
    expect(recette).not.toHaveProperty('pistesAudio');
    expect(recette).not.toHaveProperty('images'); // plus aucun plan ne l'utilise
    const textes = problemes.map((p) => p.message).join('\n');
    expect(textes).toContain('L\'image "i9" n\'est pas dans le montage');
    expect(textes).toContain('L\'émotion "heureux" n\'existe pas');
    expect(textes).toContain('La personne "p7" n\'existe pas');
    expect(textes).toContain('Le style "aquarelle" n\'existe pas');
    expect(textes).toContain('La piste 6 n\'existe pas');
  });

  it('un plan sans vidéo se compile : pas de source, durée comptée, élément gardé', () => {
    const sc = compiler(normaliser(RECETTE_V3()).recette);
    expect(sc.plans.map((p) => p.src)).toEqual(['s1', '', '', '', 'b1']);
    expect(sc.plans[1]!.ins).toEqual({ type: 'image', img: 'i1' });
    expect(sc.duree).toBe(10 + 2 + 1.5 + 1.5 + 3);
    expect(sc.plans[0]).not.toHaveProperty('ins');
  });

  it('le schéma JSON décrit tous les nouveaux champs', () => {
    const schema = JSON.parse(readFileSync('src/recette/schema.json', 'utf8'));
    for (const cle of CLES_RECETTE_V3) expect(schema.properties).toHaveProperty(cle);
    expect(schema.$defs.plan.properties).toHaveProperty('ins');
    expect(schema.$defs.source.properties).toHaveProperty('pistes');
  });
});
