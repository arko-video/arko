// Tests du « Papier découpé » goofy (7/11/2026) : situations de jeu (dessin, émotion par défaut), table des mots
// clés (choix automatique), persos tout prêts, recette (normaliseur, opération « situation d'un passage »), cache.
import { describe, expect, it } from 'vitest';
import { FauxContexte } from '../../moteur/couches/faux-contexte';
import { normaliser } from '../../recette/normaliser';
import { situationDe, situationDuPassage } from '../../recette/operations-chibis';
import type { DefinitionChibi, Mot, Recette } from '../../recette/types';
import { completerTours } from '../bouche';
import { cleChibi } from '../cache';
import { EMOTIONS, SITUATIONS } from '../catalogue';
import { dessinerChibi, type PoseChibi } from '../dessin';
import { MOTS_SITUATIONS, situationDesMots, situationDuTour } from '../situations-mots';
import { variantes } from '../variantes';
import { balancement } from './papier';
import { PERSOS_PRETS, persoPretPour } from './prets';
import { DEF_SITUATIONS, emotionAvecSituation } from './situations';

function dessiner(def: DefinitionChibi, pose: PoseChibi) {
  const f = new FauxContexte();
  dessinerChibi(f.ctx, def, pose, { x: 300, y: 600, h: 300 });
  return f;
}
const empreinte = (f: FauxContexte) => JSON.stringify(f.traces);
const PERSO = PERSOS_PRETS[0]!;

describe('situations de jeu', () => {
  it('23 situations (+ « aucune »), chacune avec une émotion par défaut ; toutes dessinées et différentes', () => {
    expect(SITUATIONS).toHaveLength(24);
    const sans = empreinte(dessiner(PERSO, { emo: 'parle', bouche: false }));
    const vues = new Set<string>();
    for (const sit of SITUATIONS) {
      expect(EMOTIONS).toContain(DEF_SITUATIONS[sit].emo);
      const f = dessiner(PERSO, { emo: 'parle', bouche: false, sit });
      expect(f.traces.length, sit).toBeGreaterThan(40);
      if (sit !== 'aucune') expect(empreinte(f), sit).not.toBe(sans);
      vues.add(empreinte(f));
    }
    expect(vues.size).toBe(24);
  });

  it('chaque situation se combine avec les 24 émotions × bouche ouverte / fermée (48 dessins différents)', () => {
    for (const sit of ['epee', 'feu', 'lag', 'trophee'] as const) {
      const vues = new Set(variantes().map((p) => empreinte(dessiner(PERSO, { ...p, sit }))));
      expect(vues.size, sit).toBe(48);
    }
  });

  it('même entrée → mêmes traits (objets animés compris)', () => {
    for (const sit of ['bombe', 'feu', 'peche', 'potion', 'lag', 'chute'] as const) {
      const p: PoseChibi = { emo: 'panique', bouche: true, sit, t: 0.37 };
      expect(empreinte(dessiner(PERSO, p))).toBe(empreinte(dessiner(PERSO, p)));
    }
  });

  it('émotion : « parle » (le défaut) laisse la situation choisir ; une autre émotion est gardée', () => {
    expect(emotionAvecSituation('parle', 'epee')).toBe('determine');
    expect(emotionAvecSituation(undefined, 'mort')).toBe('defaite');
    expect(emotionAvecSituation('rit', 'epee')).toBe('rit');
    expect(emotionAvecSituation('parle', undefined)).toBe('parle');
    expect(emotionAvecSituation('parle', 'aucune')).toBe('parle');
  });

  it('cache : la situation et le balancement de la tête font partie de la clé du papier ; chibis inchangés', () => {
    const p: PoseChibi = { emo: 'parle', bouche: false };
    expect(cleChibi(PERSO, { ...p, sit: 'epee' }, 300)).not.toBe(cleChibi(PERSO, p, 300));
    expect(cleChibi(PERSO, { ...p, t: 0.2 }, 300)).not.toBe(cleChibi(PERSO, { ...p, t: 0.4 }, 300));
    const chibi: DefinitionChibi = { ...PERSO, style: 'feutre' };
    expect(cleChibi(chibi, p, 300)).toBe(`${['feutre', 101, '#F6C9A0', 'herisses', '#1E1A18', 'sweat', 'casqueAudio', '#E74C3C', 'ronds'].join('|')}|parle|0|0|0|300`);
    expect(balancement(undefined)).toBe(0);
    expect(Math.abs(balancement(0.25))).toBeGreaterThan(1);
  });
});

describe('choix automatique de la situation (mots clés)', () => {
  const cas: [string, string | undefined][] = [
    ['je le tape avec mon épée', 'epee'], ['je le tue', 'epee'], ['je mine', 'pioche'], ['un diamant !', 'pioche'],
    ['la TNT', 'bombe'], ['ça explose', 'bombe'], ['boum', 'bombe'], ['on va à la pêche', 'peche'], ['je suis mort', 'mort'],
    ['ça brûle', 'feu'], ['dans la lave', 'feu'], ['au feu', 'feu'], ['je mange', 'mange'], ["j'ai faim", 'mange'],
    ['une potion', 'potion'], ['le coffre', 'coffre'], ['ça lag', 'lag'], ['je suis AFK', 'afk'], ["j'ai gagné", 'trophee'],
    ['GG', 'trophee'], ['bonjour tout le monde', undefined], ['mort de rire', undefined],
  ];
  it.each(cas)('« %s » → %s', (phrase, attendu) => {
    expect(situationDesMots(phrase.split(/\s+/))).toBe(attendu);
  });
  it('la table ne cite que des situations connues, sans doublon de mot', () => {
    const tous = MOTS_SITUATIONS.flatMap(([s, mots]) => {
      expect(SITUATIONS).toContain(s);
      return mots;
    });
    expect(new Set(tous).size).toBe(tous.length);
  });
  it('mots dits pendant le tour et à ± 1,5 s ; completerTours écrit `sit` (rien sans mot clé)', () => {
    const mots: Mot[] = [['regarde', 1, 1.3], ['le', 1.3, 1.4], ['coffre', 1.4, 1.8], ['salut', 9, 9.4]];
    expect(situationDuTour({ ts: 3, fin: 5, p: 'p1' }, mots)).toBe('coffre');
    expect(situationDuTour({ ts: 3.5, fin: 5, p: 'p1' }, mots)).toBeUndefined();
    const [a, b] = completerTours([{ ts: 1, fin: 2, p: 'p1', sit: 'feu' }, { ts: 8, fin: 10, p: 'p1', sit: 'feu' }], { mots });
    expect(a!.sit).toBe('coffre');
    expect(b).not.toHaveProperty('sit');
  });
});

describe('persos tout prêts et recette', () => {
  it('6 persos bien différents, en papier découpé ; Voix 1 → perso 1 … Voix 7 → perso 1', () => {
    expect(PERSOS_PRETS).toHaveLength(6);
    for (const k of ['coiffure', 'accessoire', 'couleur', 'graine'] as const) expect(new Set(PERSOS_PRETS.map((p) => p[k])).size).toBe(6);
    expect(PERSOS_PRETS.every((p) => p.style === 'papier')).toBe(true);
    expect(persoPretPour('p1')).toBe(PERSOS_PRETS[0]);
    expect(persoPretPour('p3')).toBe(PERSOS_PRETS[2]);
    expect(persoPretPour('p7')).toBe(PERSOS_PRETS[0]);
    expect(persoPretPour('abc')).toBe(persoPretPour('abc'));
  });

  const base = (): Recette => {
    const sources = [{ id: 's1', nom: 'v', taille: 1, emp: '', duree: 30, type: 'video' as const, l: 1920, h: 1080 }];
    return normaliser({ format: 'arko.recette/1', sources, plans: [{ de: 0, a: 20 }], personnes: [{ id: 'p1', nom: 'Moi' }], paroles: [{ ts: 1, fin: 3, p: 'p1' }, { ts: 4, fin: 6, p: 'p1', sit: 'feu' }] }, { sources }).recette;
  };

  it('normaliseur : `sit` facultatif gardé ; inconnu ou « aucune » retiré ; perso plein écran aussi', () => {
    const r = base();
    expect(r.paroles![0]).not.toHaveProperty('sit');
    expect(r.paroles![1]!.sit).toBe('feu');
    const brut = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
    brut.paroles = [{ ts: 1, fin: 3, p: 'p1', sit: 'licorne' }, { ts: 4, fin: 6, p: 'p1', sit: 'aucune' }];
    brut.plans = [{ de: 0, a: 20 }, { ins: { type: 'chibi', emo: 'rit', sit: 'trophee' }, de: 0, a: 2 }, { ins: { type: 'chibi', emo: 'rit', sit: 'x' }, de: 0, a: 2 }];
    const { recette, problemes } = normaliser(brut, { sources: r.sources });
    expect(recette.paroles!.every((t) => !('sit' in t))).toBe(true);
    expect(recette.plans[1]!.ins).toMatchObject({ type: 'chibi', sit: 'trophee' });
    expect(recette.plans[2]!.ins).not.toHaveProperty('sit');
    expect(problemes.filter((p) => p.message.includes('situation'))).toHaveLength(2);
  });

  it('situation d\'un passage (un toucher) : donnée au tour qui le couvre, « aucune » la retire', () => {
    const r = base();
    const a = situationDuPassage(r, 1.5, 2.5, 'epee');
    expect(a.paroles![0]!.sit).toBe('epee');
    expect(situationDe(a, 1.5, 2.5)).toBe('epee');
    expect(situationDuPassage(a, 1.5, 2.5, 'epee')).toBe(a); // rien ne change : la même recette
    expect(situationDuPassage(a, 4.5, 5, 'aucune').paroles![1]).not.toHaveProperty('sit');
    expect(situationDuPassage(r, 12, 13, 'epee')).toBe(r); // aucun tour
  });
});
