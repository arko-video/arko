// Tests de la couche avatars (dev 3) : placement en temps de sortie, image par image (pop, tenue, fusion, 2 personnes,
// bouche, rebond), places par défaut, opérations, crochet neutre, coût par image.
import { describe, expect, it } from 'vitest';
import { bitsBouche } from '../../chibis/bouche';
import { viderCacheChibis } from '../../chibis/cache';
import { compiler } from '../../recette/chronologie';
import { TIKTOK, YOUTUBE } from '../../recette/destination';
import { normaliser } from '../../recette/normaliser';
import { activerAvatars, donnerChibi, montrerAvatar, placerAvatar } from '../../recette/operations-chibis';
import type { Recette } from '../../recette/types';
import { ANIMATION_AVATAR, avatarsAuTemps, placeParDefaut, placerAvatars, preparerAvatars } from './avatars';
import { FauxContexte } from './faux-contexte';

const sources = [{ id: 's1', nom: 'v', taille: 1, emp: '', duree: 120, type: 'video' as const, l: 1920, h: 1080 }];

function recette(o: Record<string, unknown> = {}): Recette {
  return normaliser(
    {
      format: 'arko.recette/1', sources, destination: 'youtube', plans: [{ de: 0, a: 60 }],
      personnes: [{ id: 'p1', nom: 'Moi' }, { id: 'p2', nom: 'Guts' }],
      paroles: [{ ts: 2, fin: 4, p: 'p1', emo: 'rit' }, { ts: 6, fin: 7, p: 'p2' }, { ts: 7.3, fin: 8, p: 'p2', emo: 'crie' }],
      avatars: { mode: 'parle', rebond: true },
      ...o,
    },
    { sources },
  ).recette;
}

const voir = (r: Recette, t: number) => avatarsAuTemps(r, placerAvatars(r, compiler(r)), t, YOUTUBE);

describe('placerAvatars (tours en temps de sortie)', () => {
  it('suit les coupes, la vitesse ; un passage réutilisé fait réapparaître ; jamais pendant un arrêt sur image', () => {
    const r = recette({ plans: [{ de: 1, a: 3 }, { de: 3.5, a: 5, vit: 2 }, { de: 2, a: 3, fige: 1 }] });
    const pl = placerAvatars(r, compiler(r)).filter((x) => x.p === 'p1');
    expect(pl.map((x) => [x.t0, x.t1, x.ts0])).toEqual([
      [1, 2, 2],
      [2, 2.25, 3.5],
      [2.75, 3.75, 2],
    ]);
  });
  it('une personne cachée n\'a pas de placement', () => {
    const r = montrerAvatar(recette(), 'p1', false);
    expect(placerAvatars(r, compiler(r)).every((x) => x.p === 'p2')).toBe(true);
  });
});

describe('avatarsAuTemps, image par image', () => {
  const A = ANIMATION_AVATAR;
  it('apparaît quand la personne parle : pop 0 → 1,08 en 0,08 s → 1 à 0,12 s', () => {
    const r = recette();
    expect(voir(r, 1.99)).toHaveLength(0);
    expect(voir(r, 2.04)[0]!.echelle).toBeCloseTo(0.54, 2);
    expect(voir(r, 2.08)[0]!.echelle).toBeCloseTo(A.echelleMax, 3);
    expect(voir(r, 2.12)[0]!.echelle).toBeCloseTo(1, 3);
    expect(voir(r, 3)[0]).toMatchObject({ p: 'p1', emo: 'rit', echelle: 1 });
  });
  it('reste 0,5 s après la parole (même émotion, bouche fermée), disparaît sur les 0,15 dernières s', () => {
    const r = recette();
    expect(voir(r, 4.2)[0]).toMatchObject({ emo: 'rit', bouche: false, echelle: 1 });
    expect(voir(r, 4.425)[0]!.echelle).toBeCloseTo(0.5, 2);
    expect(voir(r, 4.5)).toHaveLength(0);
  });
  it('deux tours à moins de 0,5 s sont fusionnés (pas de clignotement), l\'émotion suit le tour', () => {
    const r = recette();
    expect(voir(r, 7.15)[0]).toMatchObject({ p: 'p2', emo: 'parle', echelle: 1 });
    expect(voir(r, 7.5)[0]).toMatchObject({ p: 'p2', emo: 'crie', echelle: 1 });
  });
  it('2 personnes = 2 places (16:9 : bas gauche, bas droite) ; 9:16 au-dessus de la zone cachée', () => {
    const r = recette({ paroles: [{ ts: 2, fin: 4, p: 'p1' }, { ts: 3, fin: 5, p: 'p2' }] });
    const v = voir(r, 3.5);
    // Persos tout prêts (papier découpé, en buste) : posés sur le bas de l'image en 16:9 ; chibi entier : 0,97.
    expect(v.map((x) => [x.p, x.place.x, x.place.y, x.place.taille])).toEqual([['p1', 0.12, 1, 0.3], ['p2', 0.88, 1, 0.3]]);
    expect(placeParDefaut(0, YOUTUBE)).toEqual({ x: 0.12, y: 0.97, taille: 0.3 });
    expect(placeParDefaut(0, TIKTOK, true)).toEqual(placeParDefaut(0, TIKTOK));
    // 9:16 (7/11) : plus petit, hors des 20 % du bas et de la bande de droite (15 %) ; au-dessus des sous-titres.
    expect(placeParDefaut(0, TIKTOK).taille).toBeLessThan(0.16);
    expect(placeParDefaut(0, TIKTOK).y).toBeLessThanOrEqual(0.8);
    expect(placeParDefaut(0, TIKTOK, true, 2, 0.66).y).toBeLessThan(0.66 - 0.045);
    // Voix 3 en 16:9 : en bas, à côté de la voix 1 (plus en haut à gauche).
    expect(placeParDefaut(2, YOUTUBE, true, 3)).toMatchObject({ y: 1, taille: 0.3 });
    expect(placeParDefaut(2, YOUTUBE, true, 3).x).toBeGreaterThan(0.2);
  });
  it('bouche = bits du tour (temps source), même après une coupe', () => {
    const env = { pas: 0.02, db: new Float32Array(500).fill(-60).fill(-20, 125, 150) }; // voix de 2,5 à 3 s
    const r = recette({ paroles: [{ ts: 2, fin: 4, p: 'p1', b: bitsBouche(env, 2, 4, -40) }], plans: [{ de: 2.4, a: 4 }] });
    expect(voir(r, 0.05)[0]!.bouche).toBe(false); // ts 2,45
    expect(voir(r, 0.2)[0]!.bouche).toBe(true); // ts 2,6
    expect(voir(r, 0.7)[0]!.bouche).toBe(false); // ts 3,1
  });
  it('rebond : demi-sinus de 6 % sur 0,25 s au début, + 1,5 % bouche ouverte ; sans rebond : 0', () => {
    const r = recette({ paroles: [{ ts: 2, fin: 4, p: 'p1', b: 'AAAAAAAAAAAA' }] });
    expect(voir(r, 2.125)[0]!.saut).toBeCloseTo(0.06, 3);
    expect(voir(r, 2.3)[0]!.saut).toBe(0);
    expect(voir(activerAvatars(r, { rebond: false }), 2.125)[0]!.saut).toBe(0);
  });
  it('mode « tout le temps » : reste là quand la personne se tait (parle, bouche fermée)', () => {
    const r = recette({ avatars: { mode: 'toujours' } });
    expect(voir(r, 30)[0]).toMatchObject({ p: 'p1', emo: 'parle', bouche: false, echelle: 1 });
    expect(voir(r, 1)).toHaveLength(0);
  });
  it('la tenue réglée (0 à 2 s) est respectée', () => {
    const r = recette({ avatars: { tenue: 1.5 } });
    expect(voir(r, 5.3)).toHaveLength(1);
    expect(voir(r, 5.6)).toHaveLength(0);
  });
});

describe('crochet du rendu et dessin', () => {
  it('neutre sans avatars, sans personnes ou sans tours', () => {
    const r = recette();
    expect(preparerAvatars(activerAvatars(r, null), compiler(r))).toBeNull();
    const sans = recette({ paroles: undefined });
    expect(preparerAvatars(sans, compiler(sans))).toBeNull();
  });
  it('dessine le chibi à sa place (en bas à gauche), retourné à droite ; coût par image mesuré', () => {
    viderCacheChibis();
    const r = recette({ paroles: [{ ts: 2, fin: 4, p: 'p1' }, { ts: 3, fin: 5, p: 'p2' }] });
    const c = preparerAvatars(r, compiler(r))!;
    const f = new FauxContexte();
    c.dessiner(f.ctx, 3.5, { l: 1920, h: 1080, echelle: 1 });
    const fills = f.traces.filter((t) => t.op === 'fill');
    const gauche = fills.filter((t) => t.boite!.x1 < 960);
    const droite = fills.filter((t) => t.boite!.x0 > 960);
    expect(gauche.length).toBeGreaterThan(20);
    expect(droite.length).toBeGreaterThan(20);
    // Perso tout prêt en buste (papier découpé) : son bord déchiré posé sur le bas de l'image.
    expect(Math.max(...gauche.map((t) => t.boite!.y1))).toBeGreaterThan(1075);
    expect(Math.max(...gauche.map((t) => t.boite!.y1))).toBeLessThan(1092);
    // Coût : 100 images de 2 avatars (dessin complet au trait : Node n'a pas de canevas, donc pas de cache).
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) c.dessiner(new FauxContexte().ctx, 3 + i * 0.01, { l: 1920, h: 1080, echelle: 1 });
    const ms = (performance.now() - t0) / 100;
    console.log(`Avatars : ${ms.toFixed(2)} ms par image (2 avatars, sans cache, faux contexte)`);
    expect(ms).toBeLessThan(40);
  });
});

describe('opérations des avatars (un seul Annuler, recette d\'origine si sans effet)', () => {
  it('activerAvatars, donnerChibi (copie), placerAvatar, montrerAvatar', () => {
    const r = recette({ avatars: undefined });
    expect(r.avatars).toBeUndefined();
    const a = activerAvatars(r, { mode: 'parle' });
    expect(a.avatars).toEqual({ mode: 'parle' });
    expect(activerAvatars(a, { mode: 'parle' })).toBe(a);
    const def = { style: 'paint' as const, graine: 3, peau: '#FFE0C7', coiffure: 'afro' as const, cheveux: '#1E1A18', tenue: 'pyjama' as const, accessoire: 'bonnet' as const, couleur: '#3498DB' };
    const b = donnerChibi(a, 'p2', def, 'c1');
    expect(b.personnes![1]).toMatchObject({ chibi: def, bib: 'c1' });
    expect(b.personnes![1]!.chibi).not.toBe(def);
    expect(donnerChibi(b, 'p2', null).personnes![1]!.chibi).toBeUndefined();
    const c = placerAvatar(b, 'p1', { x: 0.3, y: 0.8, taille: 0.9 });
    expect(c.personnes![0]!.place).toEqual({ x: 0.3, y: 0.8, taille: 0.6 });
    expect(placerAvatar(c, 'p1', null).personnes![0]!.place).toBeUndefined();
    expect(montrerAvatar(c, 'p1', false).personnes![0]!.avatar).toBe(false);
    expect(donnerChibi(c, 'inconnu', def)).toBe(c);
    expect(activerAvatars(recette({ personnes: undefined, paroles: undefined }), {})).toEqual(recette({ personnes: undefined, paroles: undefined }));
  });
});
