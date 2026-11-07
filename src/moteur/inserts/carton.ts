// B. Dessin d'un carton texte et d'un chibi plein écran (dev 2), en coordonnées de l'image finale (l × h, échelle
// = petit côté / 1080). Le chibi est dessiné par dessinerChibi (dev 3, chibis/dessin.ts). Contrat : contrat-wankil.md §4.1.
// Le texte reprend la mise en page des textes (mêmes styles, mêmes retours à la ligne, mesurés à la taille de
// référence) : aperçu = export.

import { estPasEncoreFait } from '../../auto/pas-encore-fait';
import { dessinerChibi, type PoseChibi } from '../../chibis/dessin';
import { estBuste } from '../../chibis/persos/fiches';
import { chibiDe } from '../couches/avatars';
import { TIKTOK, YOUTUBE, type Gabarit } from '../../recette/destination';
import type { ElementInsere, Personne } from '../../recette/types';
import type { Ctx2D } from '../canevas';
import { mettreEnPageTexte } from '../couches/textes';
import { styleTexte } from '../couches/styles-texte';

/** Couleurs par défaut, et place des éléments (en part de la hauteur). */
export const CARTON = {
  fond: '#000000',
  couleur: '#FFFFFF',
  style: 'accroche',
  /** Le texte d'un carton est un peu plus grand que celui d'un texte posé. */
  agrandi: 1.5,
  /** Chibi : bas des pieds à 92 %, 62 % de la hauteur ; texte centré à 20 % (sous la zone cachée de TikTok). */
  chibi: { fond: '#FFFFFF', hauteur: 0.62, bas: 0.92, texteY: 0.2 },
  /** Perso en buste (papier découpé) : posé sur le bas de l'image, plus grand. */
  buste: { hauteur: 0.66, bas: 1 },
} as const;

const BASE = 0.36; // ligne de base sous le centre de la ligne (× taille), comme les textes

function gabaritPour(l: number, h: number): Gabarit {
  return l > h ? YOUTUBE : TIKTOK;
}

/** Texte centré en (cx, cy), au style `styleId`, couleur des lettres `couleur` (sinon celle du style). */
export function dessinerTexteCentre(
  ctx: Ctx2D,
  txt: string,
  styleId: string | undefined,
  couleur: string | undefined,
  cx: number,
  cy: number,
  l: number,
  h: number,
  echelle: number,
) {
  const gab = gabaritPour(l, h);
  const mp = mettreEnPageTexte(txt, styleId, gab);
  if (!mp) return;
  const st = styleTexte(styleId);
  const agrandi = Math.min(CARTON.agrandi, (gab.l * 0.92) / Math.max(1, mp.l));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(echelle * agrandi, echelle * agrandi);
  if (st.rotation) ctx.rotate((st.rotation * Math.PI) / 180);
  if (st.fond) {
    ctx.fillStyle = st.fond.couleur;
    ctx.beginPath();
    ctx.rect(-mp.l / 2, -mp.h / 2, mp.l, mp.h);
    ctx.fill();
  }
  const haut = -mp.h / 2 + (st.fond?.marge[1] ?? 0) + (st.contour?.epaisseur ?? 0);
  ctx.font = mp.police;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (st.contour) {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = st.contour.epaisseur * 2;
    ctx.strokeStyle = st.contour.couleur;
  }
  ctx.fillStyle = couleur ?? st.couleur;
  mp.lignes.forEach((ligne, i) => {
    const y = haut + mp.hLigne * (i + 0.5) + BASE * mp.taille;
    if (st.contour) ctx.strokeText(ligne, 0, y);
    ctx.fillText(ligne, 0, y);
  });
  ctx.restore();
}

/** Carton : fond uni (défaut noir), texte centré au style choisi (défaut « accroche »), retours à la ligne, zone sûre. */
export function dessinerCarton(
  ctx: Ctx2D,
  el: Extract<ElementInsere, { type: 'carton' }>,
  l: number,
  h: number,
  echelle: number,
): void {
  ctx.save();
  ctx.fillStyle = el.fond ?? CARTON.fond;
  ctx.fillRect(0, 0, l, h);
  ctx.restore();
  dessinerTexteCentre(
    ctx,
    el.txt,
    el.style ?? CARTON.style,
    el.couleur ?? CARTON.couleur,
    l / 2,
    h / 2,
    l,
    h,
    echelle,
  );
}

/** Bouche ouverte pour les émotions « bruyantes » (image fixe : pas d'animation de la bouche). */
const BOUCHE_FERMEE = new Set([
  'parle',
  'content',
  'dort',
  'reflechit',
  'gene',
  'triste',
  'malade',
  'frime',
  'moqueur',
  'amoureux',
  'determine',
]);

/**
 * Chibi plein écran : fond uni, chibi centré (62 % de la hauteur), texte facultatif en haut.
 * Sans chibi connu (ni le sien, ni celui de la personne), ou si le dessin n'est pas prêt : un carton avec le nom.
 */
export function dessinerChibiPleinEcran(
  ctx: Ctx2D,
  el: Extract<ElementInsere, { type: 'chibi' }>,
  personnes: readonly Personne[],
  l: number,
  h: number,
  echelle: number,
): void {
  const personne = el.p ? personnes.find((p) => p.id === el.p) : undefined;
  // Personne sans chibi : celui de son avatar (tiré de son id), pour que le plein écran ressemble à l'avatar.
  const def = el.chibi ?? (personne ? chibiDe(personne) : undefined);
  const repli = () =>
    dessinerCarton(
      ctx,
      { type: 'carton', txt: el.txt ?? personne?.nom ?? 'Perso', fond: el.fond ?? CARTON.fond },
      l,
      h,
      echelle,
    );
  if (!def) return repli();
  ctx.save();
  ctx.fillStyle = el.fond ?? CARTON.chibi.fond;
  ctx.fillRect(0, 0, l, h);
  ctx.restore();
  try {
    ctx.save();
    const pose: PoseChibi = { emo: el.emo, bouche: !BOUCHE_FERMEE.has(el.emo) };
    if (el.sit) pose.sit = el.sit;
    const m = estBuste(def.style) ? CARTON.buste : CARTON.chibi;
    dessinerChibi(ctx, def, pose, { x: l / 2, y: h * m.bas, h: h * m.hauteur });
    ctx.restore();
  } catch (e) {
    ctx.restore();
    if (!estPasEncoreFait(e)) console.warn('[Arko] Chibi plein écran :', e);
    return repli();
  }
  if (el.txt)
    dessinerTexteCentre(ctx, el.txt, CARTON.style, undefined, l / 2, h * CARTON.chibi.texteY, l, h, echelle);
}
