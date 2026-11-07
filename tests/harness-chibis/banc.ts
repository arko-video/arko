// Banc des chibis : fabrique des planches (toutes les variantes de 2 personnages dans les 3 styles, et le catalogue
// des traits) pour juger le dessin à l'œil. Appelé par planches.mjs (Playwright).

import { ACCESSOIRES, COIFFURES, EMOTIONS, PEAUX, STYLES_ATELIER, STYLES_CHIBI, STYLES_PERSO, TENUES, YEUX, type Emotion } from '../../src/chibis/catalogue';
import { TEXTES_CHIBIS } from '../../src/ui/auto/chibis/textes';
import './banc-papier';
import { PERSOS_PRETS } from '../../src/chibis/persos/prets';
import { DEF_SITUATIONS } from '../../src/chibis/persos/situations';
import type { Situation } from '../../src/chibis/catalogue';
import { dessinerChibiCache } from '../../src/chibis/cache';
import { dessinerChibi, type PoseChibi } from '../../src/chibis/dessin';
import { variantes } from '../../src/chibis/variantes';
import type { DefinitionChibi, StyleChibi } from '../../src/recette/types';

export const PERSOS: DefinitionChibi[] = [
  { style: 'feutre', graine: 12345, peau: '#F6C9A0', coiffure: 'herisses', cheveux: '#1E1A18', tenue: 'sweat', accessoire: 'casqueAudio', couleur: '#E74C3C', yeux: 'ronds' },
  { style: 'feutre', graine: 777, peau: '#A0663D', coiffure: 'longs', cheveux: '#D9A441', tenue: 'cowboy', accessoire: 'lunettes', couleur: '#3498DB', yeux: 'grands' },
];

function canevas(l: number, h: number, fond = '#EFE9DD') {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, l, h);
  return { c, ctx };
}

function etiquette(ctx: CanvasRenderingContext2D, txt: string, x: number, y: number) {
  ctx.fillStyle = '#333';
  ctx.font = '600 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(txt, x, y);
}

/** 48 variantes d'un personnage dans un style : 8 colonnes (4 émotions × fermée / ouverte) × 6 lignes. */
function planche(perso: number, style: StyleChibi, h = 140, t = 0.4): string {
  const cl = 170;
  const ch = h * 1.62 + 22;
  const { c, ctx } = canevas(cl * 8, ch * 6 + 40);
  etiquette(ctx, `Personnage ${perso + 1} — style ${style} — 24 émotions × bouche fermée / ouverte`, cl * 4, 26);
  variantes().forEach((p, i) => {
    const col = i % 8;
    const lig = Math.floor(i / 8);
    const x = col * cl + cl / 2;
    const y = 40 + lig * ch + h * 1.45;
    dessinerChibi(ctx, { ...PERSOS[perso]!, style }, { ...p, t }, { x, y, h });
    etiquette(ctx, `${p.emo}${p.bouche ? ' (o)' : ''}`, x, y + 18);
  });
  return c.toDataURL('image/png');
}

/** Catalogue : 10 tenues, 10 coiffures, 10 accessoires, 4 yeux + peaux (émotion « parle »). */
function catalogue(style: StyleChibi, h = 120): string {
  const cl = 140;
  const ch = h * 1.62 + 22;
  const { c, ctx } = canevas(cl * 10, ch * 4 + 40);
  etiquette(ctx, `Catalogue — style ${style}`, cl * 5, 26);
  const base = PERSOS[0]!;
  const lignes: [string, Partial<DefinitionChibi>][][] = [
    TENUES.map((t) => [t, { tenue: t, accessoire: 'aucun' }]),
    COIFFURES.map((co, i) => [co, { coiffure: co, tenue: 'tshirt', accessoire: 'aucun', cheveux: ['#1E1A18', '#4A2C1A', '#D9A441', '#C0392B', '#8E44AD'][i % 5]! }]),
    ACCESSOIRES.map((a) => [a, { accessoire: a, tenue: 'tshirt', coiffure: 'courts', couleur: '#2ECC71' }]),
    [...YEUX.map((y) => [y, { yeux: y, accessoire: 'aucun' as const }] as [string, Partial<DefinitionChibi>]), ...PEAUX.slice(0, 6).map((p) => [p, { peau: p, accessoire: 'aucun' as const, coiffure: 'queue' as const }] as [string, Partial<DefinitionChibi>])],
  ];
  lignes.forEach((ligne, lig) =>
    ligne.forEach(([nom, d], col) => {
      const x = col * cl + cl / 2;
      const y = 40 + lig * ch + h * 1.45;
      dessinerChibi(ctx, { ...base, ...d, style, graine: 1000 + col * 31 + lig * 7 }, { emo: 'parle', bouche: col % 2 === 1 }, { x, y, h });
      etiquette(ctx, nom, x, y + 18);
    }),
  );
  return c.toDataURL('image/png');
}

/** Une variante en grand, pour regarder le détail. */
function zoom(perso: number | Partial<DefinitionChibi>, style: StyleChibi, poses: PoseChibi[], h = 300): string {
  const def = typeof perso === 'number' ? PERSOS[perso]! : { ...PERSOS[0]!, ...perso };
  const cl = h * 1.15;
  const { c, ctx } = canevas(cl * poses.length, h * 1.55);
  poses.forEach((p, i) => dessinerChibi(ctx, { ...def, style }, p, { x: i * cl + cl / 2, y: h * 1.48, h }));
  return c.toDataURL('image/png');
}

/** Temps de dessin d'un chibi de 300 px (sans cache), en ms. */
function mesurer(style: StyleChibi, n = 200): number {
  const { ctx } = canevas(400, 500);
  const v = variantes();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) dessinerChibi(ctx, { ...PERSOS[i % 2]!, style }, v[i % v.length]!, { x: 200, y: 480, h: 300 });
  return (performance.now() - t0) / n;
}

/** Temps par image d'un avatar de 324 px (1080p, taille moyenne) PAR LE CACHE : 2 personnes, bouche qui bat. */
function mesurerCache(style: StyleChibi, n = 600): { premier: number; suivants: number } {
  const { ctx } = canevas(1920, 1080);
  const t0 = performance.now();
  dessinerChibiCache(ctx, { ...PERSOS[0]!, style }, { emo: 'rit', bouche: false }, { x: 230, y: 1048, h: 324 });
  const premier = performance.now() - t0;
  const t1 = performance.now();
  for (let i = 0; i < n; i++) {
    dessinerChibiCache(ctx, { ...PERSOS[0]!, style }, { emo: 'rit', bouche: i % 2 === 0 }, { x: 230, y: 1048, h: 324 }, 1 + (i % 5) * 0.01);
    dessinerChibiCache(ctx, { ...PERSOS[1]!, style }, { emo: 'parle', bouche: i % 3 === 0, retourne: true }, { x: 1690, y: 1048, h: 324 });
  }
  return { premier, suivants: (performance.now() - t1) / n };
}

/** Aperçu rapide : le même perso dans les 6 styles « Persos » côte à côte (une émotion), nom dessous, fond blanc. */
function apercu(perso = 0, emo: Emotion = 'rit', bouche = true, h = 340): string {
  const cl = 300;
  const { c, ctx } = canevas(cl * STYLES_PERSO.length, 500, '#FFFFFF');
  STYLES_PERSO.forEach((style, i) => {
    const x = i * cl + cl / 2;
    dessinerChibi(ctx, { ...PERSOS[perso]!, style }, { emo, bouche, t: 0.4 }, { x, y: 430, h });
    ctx.fillStyle = '#222';
    ctx.font = '700 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(TEXTES_CHIBIS.styles[style], x, 480);
  });
  return c.toDataURL('image/png');
}

/** Aperçu du papier goofy : les 6 persos tout prêts en buste, chacun dans une situation (fond blanc). */
function apercuPapier(): string {
  const sits: [Situation, string][] = [['epee', 'Épée'], ['pioche', 'Pioche'], ['bombe', 'Bombe'], ['feu', 'En feu'], ['trophee', 'Trophée'], ['manette', 'Rage manette']];
  const cl = 300;
  const { c, ctx } = canevas(cl * 6, 520, '#FFFFFF');
  sits.forEach(([sit, nom], i) => {
    const x = i * cl + cl / 2;
    dessinerChibi(ctx, PERSOS_PRETS[i]!, { emo: DEF_SITUATIONS[sit].emo, bouche: i % 2 === 0, sit, t: 0.3 }, { x, y: 455, h: 260 });
    ctx.fillStyle = '#222';
    ctx.font = '700 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Perso ${i + 1} · ${nom}`, x, 500);
  });
  return c.toDataURL('image/png');
}

/** Comparatif : le même perso dans les 9 styles (colonnes), quelques émotions (lignes). */
function comparatif(perso = 0, emos: Emotion[] = ['parle', 'rit', 'rage', 'panique', 'triste', 'victoire'], h = 150): string {
  const cl = 190;
  const ch = h * 1.5 + 30;
  const { c, ctx } = canevas(cl * STYLES_ATELIER.length, ch * emos.length + 60, '#FFFFFF');
  STYLES_ATELIER.forEach((style, col) => {
    etiquette(ctx, TEXTES_CHIBIS.styles[style], col * cl + cl / 2, 34);
    emos.forEach((emo, lig) => {
      const x = col * cl + cl / 2;
      const y = 60 + lig * ch + h * 1.4;
      dessinerChibi(ctx, { ...PERSOS[perso]!, style }, { emo, bouche: lig % 2 === 1, t: 0.4 }, { x, y, h });
      if (col === 0) etiquette(ctx, emo, x, y + 20);
    });
  });
  return c.toDataURL('image/png');
}

Object.assign(window, { apercuPapier, mesurerCache, planche, catalogue, zoom, mesurer, apercu, comparatif, STYLES_CHIBI, STYLES_ATELIER, EMOTIONS });
document.getElementById('etat')!.textContent = 'prêt';
