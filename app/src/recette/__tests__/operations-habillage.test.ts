import { describe, expect, it } from 'vitest';
import { normaliser, normaliserRecette } from '../normaliser';
import {
  ajouterTexte, avertissementsZone, choisirMise, definirSousTitres, lignesSousTitres, modifierMot, modifierTexte, supprimerMot, supprimerTexte,
} from '../operations';
import type { Mot, Recette } from '../types';

const v = { id: 's1', nom: 'v', taille: 1, emp: '', duree: 30, type: 'video' as const, l: 1920, h: 1080 };
const MOTS: Mot[] = [
  ['attends', 1, 1.4], ['il', 1.4, 1.6], ['est', 1.6, 1.8], ['où', 1.8, 2.1, 1],
  ['NON', 3.5, 3.9], ['mdr', 3.9, 4.2], ['gg!', 4.2, 4.5], ['bien', 4.5, 4.8], ['joué', 4.8, 5.1],
];
const base = (): Recette => normaliserRecette({ plans: [{ de: 0, a: 10 }], textes: [{ txt: 'Salut', t: 1 }] }, { sources: [v] });
const avecMots = (plans = [{ de: 0, a: 10 }]): Recette =>
  normaliserRecette({ plans, sousTitres: { parLigne: 3, mots: MOTS } }, { sources: [v] });
/** Copie profonde pour vérifier qu'une opération ne modifie jamais la recette reçue. */
const copie = (r: Recette) => JSON.parse(JSON.stringify(r)) as Recette;

describe('textes', () => {
  it('ajouterTexte : nouvel indice, valeurs par défaut, immuable', () => {
    const r0 = base();
    const avant = copie(r0);
    const { recette, i } = ajouterTexte(r0, { txt: '  1v4 avec 8 PV ', t: 2.345, style: 'alerte' });
    expect(i).toBe(1);
    expect(recette.textes[1]).toEqual({ txt: '1v4 avec 8 PV', style: 'alerte', t: 2.35, dur: 3, x: 0.5, y: 0.2 });
    expect(r0).toEqual(avant);
  });
  it('ajouterTexte : texte vide → recette d\'origine et i = -1', () => {
    const r0 = base();
    expect(ajouterTexte(r0, { txt: '   ', t: 0 })).toEqual({ recette: r0, i: -1 });
    expect(ajouterTexte(r0, { txt: '   ', t: 0 }).recette).toBe(r0);
  });
  it('ajouterTexte : normalisé (y gardé dans la zone, style inconnu → accroche)', () => {
    const { recette } = ajouterTexte(base(), { txt: 'Bas', t: 0, y: 0.95, style: 'neon' });
    expect(recette.textes[1]).toMatchObject({ y: 0.62, style: 'accroche' });
  });
  it('role « accroche » conservé (ajout, modification, normalisation) ; rôle inconnu ignoré', () => {
    const { recette, i } = ajouterTexte(base(), { txt: '1v4 avec 8 PV', t: 0, dur: 2.5, role: 'accroche' });
    expect(recette.textes[i]!.role).toBe('accroche');
    expect(modifierTexte(recette, i, { txt: 'Attends la fin' }).textes[i]!.role).toBe('accroche');
    expect(normaliserRecette(recette, { sources: [v] }).textes[i]!.role).toBe('accroche');
    const r = normaliser({ plans: [{ de: 0, a: 5 }], textes: [{ txt: 'a', t: 0, role: 'titre' }] }, { sources: [v] });
    expect(r.recette.textes[0]!.role).toBeUndefined();
    expect(r.problemes.some((p) => p.message.includes('rôle "titre"'))).toBe(true);
  });
  it('modifierTexte : change, sans effet → même objet, txt vide ignoré', () => {
    const r0 = base();
    const avant = copie(r0);
    const r1 = modifierTexte(r0, 0, { txt: 'Coucou', x: 2 });
    expect(r1.textes[0]).toMatchObject({ txt: 'Coucou', x: 1 });
    expect(r0).toEqual(avant);
    expect(modifierTexte(r0, 0, { txt: 'Salut' })).toBe(r0);
    expect(modifierTexte(r0, 0, { txt: '' })).toBe(r0);
    expect(modifierTexte(r0, 5, { txt: 'x' })).toBe(r0);
    expect(modifierTexte(r0, -1, { txt: 'x' })).toBe(r0);
  });
  it('supprimerTexte', () => {
    const r0 = base();
    expect(supprimerTexte(r0, 0).textes).toEqual([]);
    expect(r0.textes).toHaveLength(1);
    expect(supprimerTexte(r0, 3)).toBe(r0);
  });
});

describe('sous-titres', () => {
  it('definirSousTitres : normalisé, y par défaut selon la mise en page, null retire', () => {
    const r0 = base();
    const r1 = definirSousTitres(r0, { mots: [['b', 2, 2.5], ['a', 1, 1.2]] });
    expect(r1.sousTitres).toEqual({ style: 'karaoke', y: 0.66, parLigne: 3, mots: [['a', 1, 1.2], ['b', 2, 2.5]] });
    expect(r0.sousTitres).toBeNull();
    expect(definirSousTitres(r1, r1.sousTitres)).toBe(r1);
    expect(definirSousTitres(r1, null).sousTitres).toBeNull();
    expect(definirSousTitres(r0, null)).toBe(r0);
    const recadre = choisirMise(r0, { type: 'recadre', x: 0.5 });
    expect(definirSousTitres(recadre, { mots: 'auto' }).sousTitres?.y).toBe(0.6);
  });
  it('le normaliseur garde y dans [0,15 ; 0,72] avec un message', () => {
    const r = normaliser({ plans: [{ de: 0, a: 5 }], sousTitres: { y: 0.9, style: 'disco', mots: 'auto' } }, { sources: [v] });
    expect(r.recette.sousTitres).toMatchObject({ y: 0.72, style: 'karaoke' });
    const messages = r.problemes.map((p) => p.message);
    expect(messages).toContain('Les sous-titres sortaient de la zone visible sur TikTok (y = 0,90) : remontés à 0,72.');
    expect(messages.some((m) => m.includes('"disco" n\'existe pas'))).toBe(true);
    const haut = normaliser({ plans: [{ de: 0, a: 5 }], sousTitres: { y: 0.05, mots: 'auto' } }, { sources: [v] });
    expect(haut.recette.sousTitres?.y).toBe(0.15);
  });
  it('jeu + webcam : sous-titres sur la jointure, et ils suivent la mise en page', () => {
    const r0 = definirSousTitres(base(), { mots: 'auto' });
    expect(r0.sousTitres?.y).toBe(0.66);
    const r1 = choisirMise(r0, { type: 'jeuCam', cam: { x: 0, y: 0, l: 0.3, h: 0.3 }, partCam: 0.4 });
    expect(r1.sousTitres?.y).toBe(0.4);
    const r2 = choisirMise(r1, { type: 'jeuCam', cam: { x: 0, y: 0, l: 0.3, h: 0.3 }, partCam: 0.4, camEnHaut: false });
    expect(r2.sousTitres?.y).toBe(0.6);
    // Déplacés à la main : ils ne bougent plus.
    const r3 = definirSousTitres(r2, { ...r2.sousTitres!, y: 0.3 });
    expect(choisirMise(r3, { type: 'flou' }).sousTitres?.y).toBe(0.3);
  });
  it('modifierMot : texte corrigé, mis en valeur ou non, immuable', () => {
    const r0 = avecMots();
    const avant = copie(r0);
    const r1 = modifierMot(r0, 0, { txt: 'ATTENDS', fort: 1 });
    expect((r1.sousTitres!.mots as Mot[])[0]).toEqual(['ATTENDS', 1, 1.4, 1]);
    expect(r0).toEqual(avant);
    expect((modifierMot(r0, 3, { fort: 0 }).sousTitres!.mots as Mot[])[3]).toEqual(['où', 1.8, 2.1]);
    expect(modifierMot(r0, 1, { txt: 'il' })).toBe(r0);
    expect(modifierMot(r0, 1, { txt: '  ' })).toBe(r0);
    expect(modifierMot(r0, 99, { txt: 'x' })).toBe(r0);
    expect(modifierMot(base(), 0, { txt: 'x' }).sousTitres).toBeNull();
  });
  it('supprimerMot', () => {
    const r0 = avecMots();
    const r1 = supprimerMot(r0, 0);
    expect((r1.sousTitres!.mots as Mot[]).map((m) => m[0])).toEqual(MOTS.slice(1).map((m) => m[0]));
    expect((r0.sousTitres!.mots as Mot[])).toHaveLength(MOTS.length);
    expect(supprimerMot(r0, -1)).toBe(r0);
    const auto = definirSousTitres(base(), { mots: 'auto' });
    expect(supprimerMot(auto, 0)).toBe(auto);
  });
});

describe('lignesSousTitres', () => {
  it('lignes de parLigne mots, coupées par un trou > 0,6 s et une fin de phrase', () => {
    const l = lignesSousTitres(avecMots());
    expect(l.map((x) => x.mots.map((m) => m[0]).join(' '))).toEqual(['attends il est', 'où', 'NON mdr gg!', 'bien joué']);
    expect(l[0]).toMatchObject({ k0: 0, k1: 3, t0: 1, t1: 1.8 });
    expect(l[1]).toMatchObject({ k0: 3, k1: 4 });
  });
  it('suit les plans : temps de sortie, mots coupés exclus, vitesse, passage réutilisé', () => {
    // Plan 1 : [3 ; 4,5] à vitesse 2 (0,75 s de sortie) ; plan 2 : [0 ; 2] ; plan 3 : [3,5 ; 4,2].
    const r = avecMots([{ de: 3, a: 4.5, vit: 2 } as never, { de: 0, a: 2 }, { de: 3.5, a: 4.2 }]);
    const l = lignesSousTitres(r);
    expect(l.map((x) => x.mots.map((m) => m[0]).join(' '))).toEqual(['NON mdr gg!', 'attends il est', 'où', 'NON mdr']);
    expect(l[0]!.t0).toBeCloseTo(0.25);
    expect(l[0]!.t1).toBeCloseTo(0.75);
    expect(l[1]!.t0).toBeCloseTo(1.75);
    expect(l[3]).toMatchObject({ k0: 4, k1: 6 });
    // « bien » et « joué » ne sont dans aucun plan.
    expect(l.flatMap((x) => x.mots).some((m) => m[0] === 'bien')).toBe(false);
  });
  it('rien tant que les mots sont « auto »', () => {
    expect(lignesSousTitres(definirSousTitres(base(), { mots: 'auto' }))).toEqual([]);
    expect(lignesSousTitres(base())).toEqual([]);
  });
});

describe('avertissementsZone', () => {
  it('rien quand tout est dans la zone sûre', () => {
    expect(avertissementsZone(avecMots())).toEqual([]);
    expect(avertissementsZone(base())).toEqual([]);
  });
  it('texte de 3 lignes trop bas : remonté, avec un message', () => {
    const { recette } = ajouterTexte(base(), { txt: 'Il ne s\'attendait pas du tout à ça regarde la fin', t: 0, style: 'bulle', y: 0.62 });
    const m = avertissementsZone(recette);
    expect(m).toHaveLength(1);
    expect(m[0]).toContain('est remonté');
  });
  it('sous-titres dont le bas dépasse 0,72', () => {
    const r = definirSousTitres(avecMots(), { ...avecMots().sousTitres!, y: 0.72 });
    expect(avertissementsZone(r)).toEqual(['Tes sous-titres risquent d\'être cachés par la description TikTok.']);
  });
});
