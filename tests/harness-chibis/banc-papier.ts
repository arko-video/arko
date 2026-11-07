// Banc du « Papier découpé » (7/11/2026) : planches des 6 persos tout prêts, des situations de jeu, des 24 émotions
// (2 persos, bouche fermée / ouverte) et des persos à la taille d'un avatar 1080p (0,30 de la hauteur).

import { EMOTIONS, SITUATIONS, type Emotion, type Situation } from '../../src/chibis/catalogue';
import { dessinerChibi } from '../../src/chibis/dessin';
import { PERSOS_PRETS } from '../../src/chibis/persos/prets';
import { DEF_SITUATIONS } from '../../src/chibis/persos/situations';
import { TEXTES_SITUATIONS } from '../../src/ui/auto/chibis/textes-situations';

function canevas(l: number, h: number, fond = '#F3EEE4') {
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, l, h);
  return { c, ctx };
}

function texte(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, taille = 16) {
  ctx.fillStyle = '#2A2A2A';
  ctx.font = `700 ${taille}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(t, x, y);
}

/** Les 6 persos tout prêts, émotion « parle » (bouche fermée puis ouverte). */
function persos6(h = 230): string {
  const cl = 300;
  const { c, ctx } = canevas(cl * 6, h * 1.62 + 70);
  texte(ctx, 'Les 6 persos tout prêts — papier découpé, émotion « parle »', cl * 3, 30, 20);
  PERSOS_PRETS.forEach((def, i) => {
    const x = cl * i + cl / 2;
    dessinerChibi(ctx, def, { emo: 'parle', bouche: i % 2 === 1, t: 0.2 }, { x, y: 50 + h * 1.5, h });
    texte(ctx, `Perso ${i + 1}`, x, 50 + h * 1.5 + 24);
  });
  return c.toDataURL('image/png');
}

/** Toutes les situations sur un perso (émotion par défaut de chaque situation). */
function situations(perso = 0, h = 170): string {
  const liste = SITUATIONS.filter((s) => s !== 'aucune');
  const col = 6;
  const cl = 250;
  const ch = h * 1.55 + 40;
  const { c, ctx } = canevas(cl * col, ch * Math.ceil(liste.length / col) + 50);
  texte(ctx, `${liste.length} situations de jeu — perso ${perso + 1}`, (cl * col) / 2, 30, 20);
  liste.forEach((sit: Situation, i) => {
    const x = (i % col) * cl + cl / 2;
    const y = 50 + Math.floor(i / col) * ch + h * 1.45;
    dessinerChibi(ctx, PERSOS_PRETS[perso]!, { emo: DEF_SITUATIONS[sit].emo, bouche: i % 2 === 0, sit, t: 0.3 }, { x, y, h });
    texte(ctx, TEXTES_SITUATIONS.noms[sit], x, y + 28);
  });
  return c.toDataURL('image/png');
}

/** Les 24 émotions × bouche fermée / ouverte, pour 2 persos (un bloc par perso). */
function emotions(persos: [number, number] = [1, 4], h = 120): string {
  const cl = 150;
  const ch = h * 1.5 + 26;
  const lignes = 6;
  const { c, ctx } = canevas(cl * 16, ch * lignes + 60);
  texte(ctx, `24 émotions × bouche fermée / ouverte — perso ${persos[0] + 1} (à gauche) et perso ${persos[1] + 1} (à droite)`, cl * 8, 30, 20);
  persos.forEach((n, bloc) => {
    EMOTIONS.forEach((emo: Emotion, i) => {
      for (const bouche of [false, true]) {
        const col = bloc * 8 + (i % 4) * 2 + (bouche ? 1 : 0);
        const x = col * cl + cl / 2;
        const y = 50 + Math.floor(i / 4) * ch + h * 1.4;
        dessinerChibi(ctx, PERSOS_PRETS[n]!, { emo, bouche, t: 0.4 }, { x, y, h });
        if (!bouche) texte(ctx, emo, x + cl / 2, y + 20, 13);
      }
    });
  });
  return c.toDataURL('image/png');
}

/** À la taille d'un avatar 1080p (324 px de haut), sur un fond de jeu sombre puis clair. */
function tailleAvatar(): string {
  const h = 324;
  const cl = 330;
  const { c, ctx } = canevas(cl * 6, h * 2 * 1.05 + 20, '#3A4A5C');
  ctx.fillStyle = '#C9D7C2';
  ctx.fillRect(0, h * 1.05 + 10, cl * 6, h * 1.05 + 10);
  const emos: Emotion[] = ['rit', 'crie', 'moqueur', 'panique', 'choque', 'pleure'];
  PERSOS_PRETS.forEach((def, i) => {
    for (const k of [0, 1]) dessinerChibi(ctx, def, { emo: emos[(i + k * 3) % 6]!, bouche: k === 1, t: 0.2 }, { x: cl * i + cl / 2, y: (k + 1) * (h * 1.05 + 10), h });
  });
  return c.toDataURL('image/png');
}

/** Les 6 persos × 8 situations clés (émotion par défaut de chaque situation, bouche ouverte une fois sur deux). */
function situations6(h = 150): string {
  const sits: Situation[] = ['epee', 'pioche', 'bombe', 'feu', 'trophee', 'manette', 'mort', 'coffre'];
  const cl = 215;
  const ch = h * 1.6 + 34;
  const { c, ctx } = canevas(cl * sits.length + 90, ch * 6 + 70);
  texte(ctx, '6 persos × 8 situations clés — papier découpé', (cl * sits.length) / 2 + 45, 30, 20);
  sits.forEach((sit, j) => texte(ctx, TEXTES_SITUATIONS.noms[sit], 90 + j * cl + cl / 2, 58, 15));
  PERSOS_PRETS.forEach((def, i) => {
    const y = 70 + i * ch + h * 1.5;
    texte(ctx, `Perso ${i + 1}`, 45, y - h * 0.6, 15);
    sits.forEach((sit, j) => dessinerChibi(ctx, def, { emo: DEF_SITUATIONS[sit].emo, bouche: (i + j) % 2 === 0, sit, t: 0.3 }, { x: 90 + j * cl + cl / 2, y, h }));
  });
  return c.toDataURL('image/png');
}

/** Les 24 émotions (bouche ouverte une fois sur deux) sur les 6 persos : une rangée par perso. */
function emotions6(h = 92): string {
  const cl = 100;
  const ch = h * 1.5 + 24;
  const { c, ctx } = canevas(cl * 24 + 80, ch * 6 + 80);
  texte(ctx, '24 émotions × 6 persos — papier découpé (bouche ouverte une fois sur deux)', (cl * 24) / 2 + 40, 30, 20);
  EMOTIONS.forEach((emo, j) => texte(ctx, emo, 80 + j * cl + cl / 2, 58, 11));
  PERSOS_PRETS.forEach((def, i) => {
    const y = 70 + i * ch + h * 1.45;
    texte(ctx, `${i + 1}`, 40, y - h * 0.6, 18);
    EMOTIONS.forEach((emo: Emotion, j) => dessinerChibi(ctx, def, { emo, bouche: j % 2 === 1, t: 0.4 }, { x: 80 + j * cl + cl / 2, y, h }));
  });
  return c.toDataURL('image/png');
}

Object.assign(window, { persos6, situations, emotions, tailleAvatar, situations6, emotions6 });
