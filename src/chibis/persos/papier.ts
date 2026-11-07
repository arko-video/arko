// D. « Papier découpé » goofy (7/11/2026, style choisi par Romain) : buste coupé net par un bord de papier DÉCHIRÉ
// (une bande blanche de fibres sous la ceinture), yeux de tailles un peu différentes (14 %, à peine de travers), bouche
// agrandie, tête penchée (côté tiré de la graine) qui se balance en rythme, expressions exagérées : yeux en spirale
// pour « mort de rire », langue qui sort pour « moqueur » (le troll), larmes en jets pour « pleure ».

import type { DefinitionChibi, Emotion } from '../../recette/types';
import { surLesYeux, sousLesYeux } from '../chapeaux';
import type { Pt } from '../courbes';
import type { Expression, FormeBouche } from '../expressions';
import { VISAGE } from '../geometrie';
import type { Pinceau } from '../pinceau';
import { habits } from '../tenues';
import { bouche, unOeil } from '../visage';
import { ruban } from './corps-perso';
import type { Fiche } from './fiches';

/**
 * Réglages chiffrés du goofy (unités de la tête des chibis, degrés).
 * Yeux (retour de Romain, 7/11 : « un œil plus petit que l'autre oui, mais là c'est trop ») : avant 1,26 / 0,82
 * (le gros 54 % plus grand que le petit), petit œil tourné de 11° et décalé de 1,6 ; maintenant 1,07 / 0,94
 * (14 % de différence), tourné de 4° et décalé de 0,5 : juste un soupçon de goofy.
 */
export const GOOFY = {
  gros: 1.07, petit: 0.94, travers: 4, decale: 0.5, bouche: 1.5, boucheCri: 1.75, penche: [3, 6], balance: 3.5,
} as const;

const BOUCHES_CRI: ReadonlySet<FormeBouche> = new Set(['cri', 'hurlement', 'fouRire', 'pleurs', 'o', 'rire']);

/** Tête penchée d'office : de 3 à 6 degrés, à gauche ou à droite selon la graine. */
export function penche(pi: Pinceau): number {
  const h = pi.hasard('penche');
  const a = GOOFY.penche[0] + h() * (GOOFY.penche[1] - GOOFY.penche[0]);
  return h() < 0.5 ? -a : a;
}

/** Balancement de la tête (6 images par seconde, aller-retour en une seconde) ; 0 sans temps (PNG). */
export function balancement(t: number | undefined): number {
  if (!t) return 0;
  const i = ((Math.floor(t * 6 + 1e-6) % 6) + 6) % 6;
  return GOOFY.balance * Math.sin((i / 6) * Math.PI * 2);
}

/** Phase du balancement pour la clé du cache (0 à 5). */
export function phaseBalancement(t: number | undefined): number {
  return t ? ((Math.floor(t * 6 + 1e-6) % 6) + 6) % 6 : 0;
}

/** Expression exagérée du papier goofy. */
export function exagerer(emo: Emotion, ex: Expression): Expression {
  if (emo === 'mortDeRire') return { ...ex, yeux: 'spirales' };
  if (emo === 'pleure') return { ...ex, signes: ex.signes.filter((s) => s !== 'larmesQuiCoulent') };
  return ex;
}

/** Yeux dépareillés : un gros, un petit un peu de travers et pas à la même hauteur. */
function yeuxGoofy(v: Pinceau, def: DefinitionChibi, ex: Expression) {
  const h = v.hasard('yeuxGoofy');
  const gros = h() < 0.5 ? 1 : -1;
  for (const s of [-1, 1] as const) {
    const k = s === gros ? GOOFY.gros : GOOFY.petit;
    const x = s * VISAGE.yeuxX;
    const y = VISAGE.yeuxY + (s === gros ? -GOOFY.decale : GOOFY.decale);
    const r = v.repere(x * (1 - k), y * (1 - k), k, k);
    r.tourner(s === gros ? 0 : s * GOOFY.travers, x, y, () => unOeil(r, def, ex.yeux, s, x, y));
  }
}

/** Larmes en jets, qui giclent des deux yeux. */
function jets(v: Pinceau, ph: number) {
  for (const s of [-1, 1] as const) {
    const p: Pt[] = [[s * 15, -62], [s * 30, -72], [s * 44, -66], [s * 52, -50]];
    v.forme(`jet${s}`, ruban(p, [2.6, 3.4, 3, 2.2]), '#7FD3F7', { epais: 0.5 });
    for (const i of [0, 1]) {
      const t = (ph + i / 2) % 1;
      v.forme(`goutteJet${s}${i}`, v.ovale(`goutteJet${s}${i}`, s * (50 + t * 6), -46 + t * 14, 2.4, 3, 6), '#7FD3F7', { epais: 0.4 });
    }
  }
}

/** Langue qui pend (le troll). */
function langue(b: Pinceau) {
  const y = VISAGE.boucheY;
  b.forme('langueTroll', [[-4.5, y + 2], [4.5, y + 2], [5, y + 10], [0, y + 13], [-5, y + 10]], '#F06C7E', { epais: 0.7 });
  b.ligne('langueMilieu', [[0, y + 4], [0, y + 10]], { epais: 0.4, encre: '#B8404F' });
}

/**
 * Le visage goofy (dans le repère du visage `v`) : sous les yeux, yeux, lunettes, bouche agrandie et ses extras.
 * `lunettes` = lunettes de soleil imposées (situation « frime ») ; `apresBarbe` = dessiné juste après la barbe (teintes).
 */
export function visageGoofy(v: Pinceau, def: DefinitionChibi, ex: Expression, emo: Emotion, ouverte: boolean, ph: number, lunettes: boolean, apresBarbe?: () => void) {
  const forme = ex.bouche[ouverte ? 1 : 0];
  const cri = BOUCHES_CRI.has(forme);
  // Le trou de la barbe suit la taille de la bouche (grand pour les cris, les rires et « hurle »).
  sousLesYeux(v, def, cri && ouverte ? 'grande' : 'normale');
  apresBarbe?.();
  yeuxGoofy(v, def, ex);
  surLesYeux(v, lunettes ? { ...def, accessoire: 'lunettesSoleil' } : def, lunettes ? 'frime' : emo);
  const k = cri ? GOOFY.boucheCri : GOOFY.bouche;
  const y = VISAGE.boucheY;
  const b = v.repere(0, y * (1 - k) - 1.5, k, k);
  bouche(b, forme);
  if (emo === 'moqueur' && ouverte) langue(b);
  if (emo === 'pleure') jets(v, ph);
}

/** Bas du buste : une bande (pantalon ou ceinture) au bord déchiré, avec la fibre blanche du papier dessous. */
export function bordDechire(pi: Pinceau, f: Fiche, def: DefinitionChibi) {
  const h = pi.hasard('dechire');
  const l = f.torse.lb + 1.5;
  const zig: Pt[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) zig.push([l - (2 * l * i) / n, (i % 2 === 0 ? -1.2 : 0.9) + (h() - 0.5) * 1.4]);
  const haut = f.torse.bas - 3;
  pi.forme('fibre', [[-l - 0.6, haut + 2], [l + 0.6, haut + 2], ...zig.map(([x, y]) => [x * 1.02, y + 1.4] as Pt)], '#FBF7EC', { lisse: false });
  pi.forme('bassin', [[-l, haut], [l, haut], ...zig], habits(def).jambes, { lisse: false });
}
