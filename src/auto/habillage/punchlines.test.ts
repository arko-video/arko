// B. Punchlines : choix des phrases fortes, jurons masqués, opérations (fusion, basculer, mode) et placement.

import { describe, expect, it } from 'vitest';
import { compiler } from '../../recette/chronologie';
import { normaliser, normaliserRecette } from '../../recette/normaliser';
import { avertissementsZone } from '../../recette/zone-sure';
import { basculerPunchline, choisirModeSousTitres, definirPunchlines, lignesSousTitres, Y_PUNCHLINES_PAYSAGE, Y_PUNCHLINES_VERTICAL_MAX } from '../../recette/operations';
import type { Mot, Recette } from '../../recette/types';
import type { SignauxSource } from '../types';
import { estJuron, masquer, masquerJuron } from './jurons';
import { indiceCle, phraseDuMot, trouverPunchlines } from './punchlines';

/** Signaux fabriqués : 60 s de son calme, avec les pics / rires / cris donnés. */
export function signaux(o: Partial<SignauxSource> = {}): SignauxSource {
  return { src: 's1', duree: 60, pas: 0.02, rms: new Float32Array(3000).fill(0.01), pics: [], cris: [], rires: [], muets: [], ...o };
}

/** Une phrase de mots consécutifs (0,3 s chacun) à partir de t. */
function phrase(t: number, ...txt: string[]): Mot[] {
  return txt.map((x, i) => [x, Math.round((t + i * 0.3) * 100) / 100, Math.round((t + i * 0.3 + 0.28) * 100) / 100]);
}

describe('choix des punchlines (une règle par raison)', () => {
  it('mot fort : mis en valeur, ou de la liste (« gg »)', () => {
    expect(trouverPunchlines(phrase(0, 'bien', 'joué', 'gg'), null)).toMatchObject([{ k0: 0, k1: 3, raison: 'mot-fort', cle: 2 }]);
    const marque: Mot[] = [['le', 0, 0.2], ['château', 0.2, 0.6, 1]];
    expect(trouverPunchlines(marque, null)).toMatchObject([{ raison: 'mot-fort', cle: 1 }]);
  });
  it('exclamation', () => {
    expect(trouverPunchlines(phrase(0, 'trop', 'bien', 'ça!'), null)).toMatchObject([{ raison: 'exclamation', cle: 2, ts: 0, fin: 0.88 }]);
  });
  it('juron (avec ponctuation ou élision)', () => {
    expect(trouverPunchlines(phrase(0, 'putain', 'le', 'creeper'), null)).toMatchObject([{ raison: 'juron', cle: 0 }]);
    expect(trouverPunchlines(phrase(0, 'quel', "d'enfoiré"), null)).toMatchObject([{ raison: 'juron', cle: 1 }]);
  });
  it('rire pendant la phrase ou juste après', () => {
    const mots = phrase(10, 'on', 'saute', 'là');
    expect(trouverPunchlines(mots, null)).toEqual([]);
    expect(trouverPunchlines(mots, signaux({ rires: [{ de: 11.5, a: 12.4, t: 11.8, force: 0.8 }] }))).toMatchObject([{ raison: 'rire' }]);
    expect(trouverPunchlines(mots, signaux({ rires: [{ de: 13, a: 14, t: 13.5, force: 0.8 }] }))).toEqual([]);
  });
  it('pic de son à ±1,5 s (un cri compte aussi)', () => {
    const mots = phrase(10, 'on', 'saute', 'là'); // de 10 à 10,88
    expect(trouverPunchlines(mots, signaux({ pics: [{ ts: 12.3, db: -6, z: 4 }] }))).toMatchObject([{ raison: 'pic', cle: 1 }]);
    expect(trouverPunchlines(mots, signaux({ pics: [{ ts: 8.6, db: -6, z: 4 }] }))).toMatchObject([{ raison: 'pic' }]);
    expect(trouverPunchlines(mots, signaux({ pics: [{ ts: 12.5, db: -6, z: 4 }] }))).toEqual([]);
    expect(trouverPunchlines(mots, signaux({ cris: [{ de: 11, a: 11.6, t: 11.2, force: 1 }] }))).toMatchObject([{ raison: 'pic' }]);
  });
  it('plus de 7 mots : refusée, même avec un « ! »', () => {
    expect(trouverPunchlines(phrase(0, 'il', 'est', 'trop', 'fort', 'franchement', 'je', 'te', 'jure!'), null)).toEqual([]);
    expect(trouverPunchlines(phrase(0, 'il', 'est', 'trop', 'fort', 'je', 'te', 'jure!'), null)).toHaveLength(1);
  });
  it('les phrases sont coupées par un trou > 0,6 s ou une fin de phrase', () => {
    const mots: Mot[] = [...phrase(0, 'bon', 'on', 'y', 'va.'), ...phrase(1.2, 'gg', 'les', 'gars'), ...phrase(3, 'merde', 'alors')];
    const p = trouverPunchlines(mots, null);
    expect(p.map((x) => [x.k0, x.k1, x.raison])).toEqual([[4, 7, 'mot-fort'], [7, 9, 'juron']]);
    expect(phraseDuMot(mots, 1)).toEqual({ ts: 0, fin: 1.18, k0: 0, k1: 4 });
    expect(phraseDuMot(mots, 5)).toMatchObject({ k0: 4, k1: 7 });
  });
  it('mot clé : le plus long quand rien d\'autre', () => {
    expect(indiceCle(phrase(0, 'on', 'saute', 'là'))).toBe(1);
    expect(indiceCle(phrase(0, 'a', 'b'))).toBeNull();
  });
});

describe('jurons masqués', () => {
  it('« putain » → « P*TAIN », première voyelle après la 1re lettre', () => {
    expect(masquerJuron('putain')).toBe('P*TAIN');
    expect(masquerJuron('Merde')).toBe('M*RDE');
    expect(masquerJuron('fdp')).toBe('F*P');
    expect(masquerJuron('shit')).toBe('SH*T');
    expect(masquerJuron('putain!')).toBe('P*TAIN!');
    expect(masquerJuron("d'enfoiré")).toBe("D'ENF*IRÉ");
  });
  it('un mot ordinaire reste tel quel (en majuscules)', () => {
    expect(masquerJuron('château')).toBe('CHÂTEAU');
    expect(masquer('salut')).toBe('salut');
    expect(masquer('Putain')).toBe('P*tain');
    expect(estJuron('putain,')).toBe(true);
    expect(estJuron('computer')).toBe(false);
  });
});

const s1 = { id: 's1', nom: 'obs.mp4', taille: 1, emp: 'e', duree: 60, type: 'video' as const, l: 1920, h: 1080 };
const MOTS: Mot[] = [...phrase(0, 'bon', 'on', 'y', 'va.'), ...phrase(1.2, 'gg', 'les', 'gars'), ...phrase(3, 'merde', 'alors'), ...phrase(5, 'il', 'pleut')];

function base(destination: 'tiktok' | 'youtube' = 'youtube'): Recette {
  return normaliserRecette({ destination, plans: [{ de: 0, a: 10 }], sousTitres: { style: 'karaoke', mots: MOTS } }, { sources: [s1] });
}

function enPunchlines(r: Recette = base()): Recette {
  return choisirModeSousTitres(definirPunchlines(r, trouverPunchlines(MOTS, null)), 'punchlines');
}

describe('opérations', () => {
  it('mode punchlines : style « punchline », tiers bas en 16:9 ; retour à « tout »', () => {
    const r = enPunchlines();
    expect(r.sousTitres).toMatchObject({ mode: 'punchlines', style: 'punchline', y: Y_PUNCHLINES_PAYSAGE });
    expect(r.sousTitres!.punchlines).toEqual([{ ts: 1.2, fin: 2.08 }, { ts: 3, fin: 3.58 }]);
    const tout = choisirModeSousTitres(r, 'tout');
    expect(tout.sousTitres).not.toHaveProperty('mode');
    expect(tout.sousTitres).toMatchObject({ style: 'karaoke', y: 0.82 });
    expect(tout.sousTitres!.punchlines).toHaveLength(2); // gardées pour plus tard
    expect(choisirModeSousTitres(r, 'punchlines')).toBe(r); // sans effet → même recette
  });
  it('vertical : hauteur habituelle, sans descendre sous la description TikTok ; retour à la hauteur habituelle', () => {
    expect(base('tiktok').sousTitres!.y).toBe(0.66); // fond flou
    const r = enPunchlines(base('tiktok'));
    expect(r.sousTitres!.y).toBe(Y_PUNCHLINES_VERTICAL_MAX);
    expect(avertissementsZone(r)).toEqual([]);
    expect(choisirModeSousTitres(r, 'tout').sousTitres!.y).toBe(0.66);
    const jeuCam = normaliserRecette({ plans: [{ de: 0, a: 10 }], mise: { type: 'jeuCam', cam: { x: 0, y: 0, l: 0.3, h: 0.3 } }, sousTitres: { mots: MOTS } }, { sources: [s1] });
    expect(enPunchlines(jeuCam).sousTitres!.y).toBe(jeuCam.sousTitres!.y); // sur la jointure : gardée
  });
  it('plages qui se chevauchent : fusionnées, triées', () => {
    const r = definirPunchlines(base(), [{ ts: 3, fin: 4 }, { ts: 1, fin: 2 }, { ts: 1.5, fin: 3.2 }]);
    expect(r.sousTitres!.punchlines).toEqual([{ ts: 1, fin: 4 }]);
  });
  it('basculer : ajoute la phrase touchée, puis la retire ; un seul changement à chaque fois', () => {
    const r = enPunchlines();
    const ajout = basculerPunchline(r, 10); // « il pleut »
    expect(ajout.sousTitres!.punchlines).toEqual([{ ts: 1.2, fin: 2.08 }, { ts: 3, fin: 3.58 }, { ts: 5, fin: 5.58 }]);
    const retrait = basculerPunchline(ajout, 7); // « merde alors »
    expect(retrait.sousTitres!.punchlines).toEqual([{ ts: 1.2, fin: 2.08 }, { ts: 5, fin: 5.58 }]);
    expect(basculerPunchline(r, 99)).toBe(r);
    // Une plage qui couvre deux phrases : seule la phrase touchée part.
    const large = basculerPunchline(definirPunchlines(r, [{ ts: 1.2, fin: 3.58 }]), 8);
    expect(large.sousTitres!.punchlines).toEqual([{ ts: 1.2, fin: 3 }]);
  });
  it('le normaliseur garde tout (idempotent)', () => {
    const r = enPunchlines();
    expect(normaliser(JSON.parse(JSON.stringify(r)), { sources: r.sources }).recette).toEqual(r);
  });
});

describe('placement', () => {
  it('seuls les mots des punchlines restent, UNE ligne par punchline, tenue pour être lue', () => {
    const sc = compiler(enPunchlines());
    const lignes = sc.sousTitres!.lignes;
    expect(lignes.map((l) => l.mots.map((m) => m.mot[0]).join(' '))).toEqual(['gg les gars', 'merde alors']);
    expect(lignes[0]!.t1).toBeCloseTo(2.28); // fin du dernier mot + 0,2 s (retour de Romain, 6/11)
    expect(lignes[1]!.t1).toBeCloseTo(3.78);
    expect(sc.sousTitres).toMatchObject({ style: 'punchline', couleurCle: '#FFE500', masquer: true });
  });
  it('un mot hors plage n\'est jamais placé', () => {
    const sc = compiler(enPunchlines());
    expect(sc.sousTitres!.lignes.flatMap((l) => l.mots.map((m) => m.k))).not.toContain(0);
  });
  it('la liste de l\'outil montre TOUTES les phrases, punchlines marquées', () => {
    const l = lignesSousTitres(enPunchlines(), { toutes: true });
    expect(l.map((x) => [x.k0, x.k1, x.punchline])).toEqual([[0, 4, false], [4, 7, true], [7, 9, true], [9, 11, false]]);
    expect(lignesSousTitres(enPunchlines()).map((x) => x.k0)).toEqual([4, 7]);
  });
  it('anciens sous-titres : aucun réglage auto dans le scénario', () => {
    const sc = compiler(base());
    expect(sc.sousTitres).not.toHaveProperty('couleurCle');
    expect(sc.sousTitres).not.toHaveProperty('masquer');
  });
});
