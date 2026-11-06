// Calque des textes (phase 2) : 5 styles, retour à la ligne, réduction automatique, entrée animée, fondu de sortie.
// La mise en page est calculée en px de RÉFÉRENCE (1080 × 1920 en vertical, 1920 × 1080 en YouTube 16:9 : c'est
// le gabarit de la destination), puis dessinée avec ctx.scale(env.echelle) : les retours à la ligne sont les mêmes
// dans l'aperçu et dans l'export.
// boitesTextes() (pour toucher un texte dans l'interface) utilise EXACTEMENT la même mise en page que le dessin.

import { gabaritDe, TIKTOK, type Gabarit } from '../../recette/destination';
import type { Recette } from '../../recette/types';
import type { BoiteTexte } from '../api';
import type { Ctx2D, Env } from '../canevas';
import { textesActifs, type TexteActif } from '../etat-image';
import { couperEnLignes, memo, mesurer, rectArrondi, retirerEmojis, sortieDouce } from './mesure';
import { police, styleTexte, type StyleTexte } from './styles-texte';

/** Largeur maximale d'un texte en TikTok : 1080 − 2 × 120 px (zone sûre des côtés). Les autres : gabarit. */
export const LARGEUR_MAX = TIKTOK.largeurTexte;
export const LIGNES_MAX = 3;
/** Réduction à chaque essai, et taille minimale (× la taille du style). */
const REDUCTION = 0.92;
const TAILLE_MIN = 0.4;
/** Durées des animations (s). */
export const DUREE_POP = 0.25;
export const FONDU_SORTIE = 0.15;
/** Position de la ligne de base sous le centre de la ligne (× taille) : centre les majuscules. */
const BASE = 0.36;

/** Un texte mis en page, en px de référence. */
export interface TexteMisEnPage {
  lignes: string[];
  police: string;
  taille: number;
  hLigne: number;
  /** Taille de la boîte (fond et contour compris). */
  l: number;
  h: number;
}

/** CONTRAT (phase 2) : true si le texte contient des émojis. */
export function contientEmoji(txt: string): boolean {
  return /\p{Extended_Pictographic}/u.test(txt);
}

/** Met un texte en page (null s'il ne reste rien à dessiner, par exemple un texte fait seulement d'émojis). */
export function mettreEnPageTexte(txt: string, styleId?: string, gab: Gabarit = TIKTOK): TexteMisEnPage | null {
  return memo(`texte|${gab.largeurTexte}|${styleId ?? ''}|${txt}`, () => calculer(txt, styleTexte(styleId), gab.largeurTexte));
}

function calculer(txt: string, st: StyleTexte, largeurTexte: number): TexteMisEnPage | null {
  const propre = st.majuscules ? retirerEmojis(txt).toUpperCase() : retirerEmojis(txt);
  if (!propre) return null;
  const [mx, my] = st.fond?.marge ?? [0, 0];
  const bord = st.contour?.epaisseur ?? 0;
  const largeurMax = largeurTexte - 2 * (mx + bord);
  for (let taille = st.taille; ; taille *= REDUCTION) {
    const p = police(st.poids, taille, st.famille);
    const largeur = (s: string) => mesurer(s, p);
    const lignes = propre.split('\n').flatMap((par) => couperEnLignes(par.split(' '), largeurMax, largeur));
    const plusLarge = Math.max(...lignes.map(largeur));
    const tient = lignes.length <= LIGNES_MAX && plusLarge <= largeurMax;
    if (tient || taille * REDUCTION < st.taille * TAILLE_MIN) {
      const hLigne = taille * st.interligne;
      return { lignes, police: p, taille, hLigne, l: plusLarge + 2 * (mx + bord), h: lignes.length * hLigne + 2 * (my + bord) };
    }
  }
}

/**
 * Centre de la boîte (px de référence) : x, y de la recette, ramené pour que la boîte ENTIÈRE reste dans
 * la zone sûre du gabarit (TikTok : côtés à 120 px, haut ≥ 12,5 %, bas ≤ 65,6 %).
 * `deplace` = 'remonte' ou 'descendu' si y a été changé.
 */
export function centreTexte(
  mp: TexteMisEnPage,
  x = 0.5,
  y = 0.2,
  gab: Gabarit = TIKTOK,
): { cx: number; cy: number; deplace: 'remonte' | 'descendu' | null } {
  const ZONE = { haut: gab.zone.haut * gab.h, bas: (1 - gab.zone.bas) * gab.h };
  const marge = (gab.l - gab.largeurTexte) / 2;
  const demi = mp.l / 2;
  const cx = demi <= gab.largeurTexte / 2 ? Math.min(Math.max(x * gab.l, marge + demi), gab.l - marge - demi) : gab.l / 2;
  const voulu = y * gab.h;
  // Boîte plus haute que la zone (cas extrême) : centrée dans la zone.
  const cy = mp.h >= ZONE.bas - ZONE.haut ? (ZONE.haut + ZONE.bas) / 2 : Math.min(Math.max(voulu, ZONE.haut + mp.h / 2), ZONE.bas - mp.h / 2);
  const deplace = cy < voulu - 0.5 ? 'remonte' : cy > voulu + 0.5 ? 'descendu' : null;
  return { cx, cy, deplace };
}

export interface AnimationTexte {
  echelle: number;
  opacite: number;
  /** Décalage (px de référence) et rotation (degrés). */
  dx: number;
  dy: number;
  rotation: number;
}

/** Animation d'un texte : entrée (sauf s'il commence à 0 s : il est entier dès la 1re image) et fondu de sortie. */
export function animationTexte(ta: TexteActif, st: StyleTexte): AnimationTexte {
  const sortie = Math.min(1, ta.reste / FONDU_SORTIE);
  const anim: AnimationTexte = { echelle: 1, opacite: sortie, dx: 0, dy: 0, rotation: st.rotation ?? 0 };
  const a = ta.age;
  if (ta.texte.t <= 0 || a >= 0.4) return anim;
  if (st.entree === 'fondu') {
    anim.opacite = Math.min(sortie, a / 0.2);
    anim.dy = (1 - sortieDouce(a / 0.25)) * 18;
    return anim;
  }
  // « pop » : 0,6 → 1,08 → 1 en 0,25 s.
  if (a < 0.15) anim.echelle = 0.6 + 0.48 * sortieDouce(a / 0.15);
  else if (a < DUREE_POP) anim.echelle = 1.08 - 0.08 * ((a - 0.15) / (DUREE_POP - 0.15));
  if (st.entree === 'secousse') {
    const amorti = 1 - a / 0.4;
    anim.dx = Math.sin(a * Math.PI * 2 * 14) * 12 * amorti;
    anim.rotation += Math.sin(a * Math.PI * 2 * 10) * 2 * amorti;
  }
  return anim;
}

/** Dessine les textes visibles (le dernier de la liste par-dessus). */
export function dessinerTextes(ctx: Ctx2D, textes: TexteActif[], env: Env, gab: Gabarit = TIKTOK): void {
  for (const ta of textes) {
    const st = styleTexte(ta.texte.style);
    const mp = mettreEnPageTexte(ta.texte.txt, ta.texte.style, gab);
    if (!mp) continue;
    const anim = animationTexte(ta, st);
    if (anim.opacite <= 0) continue;
    const { cx, cy } = centreTexte(mp, ta.texte.x, ta.texte.y, gab);
    ctx.save();
    ctx.translate((cx * env.l) / gab.l, (cy * env.h) / gab.h);
    ctx.scale(env.echelle, env.echelle);
    ctx.translate(anim.dx, anim.dy);
    if (anim.rotation) ctx.rotate((anim.rotation * Math.PI) / 180);
    if (anim.echelle !== 1) ctx.scale(anim.echelle, anim.echelle);
    ctx.globalAlpha = anim.opacite;
    dessinerBloc(ctx, mp, st, env.echelle);
    ctx.restore();
  }
}

/** Dessine un texte mis en page, centré sur (0, 0). */
function dessinerBloc(ctx: Ctx2D, mp: TexteMisEnPage, st: StyleTexte, echelle: number) {
  if (st.fond) {
    ctx.fillStyle = st.fond.couleur;
    rectArrondi(ctx, -mp.l / 2, -mp.h / 2, mp.l, mp.h, st.fond.rayon);
    ctx.fill();
  }
  const haut = -mp.h / 2 + (st.fond?.marge[1] ?? 0) + (st.contour?.epaisseur ?? 0);
  ctx.font = mp.police;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (st.ombre) {
    // L'ombre ne suit pas ctx.scale : on la met à l'échelle à la main.
    ctx.shadowColor = st.ombre.couleur;
    ctx.shadowBlur = st.ombre.flou * echelle;
    ctx.shadowOffsetY = st.ombre.dy * echelle;
  }
  if (st.contour) {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = st.contour.epaisseur * 2; // la moitié du trait est cachée sous les lettres
    ctx.strokeStyle = st.contour.couleur;
  }
  ctx.fillStyle = st.couleur;
  mp.lignes.forEach((ligne, i) => {
    const y = haut + mp.hLigne * (i + 0.5) + BASE * mp.taille;
    if (st.contour) ctx.strokeText(ligne, 0, y);
    ctx.fillText(ligne, 0, y);
  });
}

/** CONTRAT (phase 2) : boîtes des textes visibles au temps de sortie t (coordonnées 0–1, sans animation). */
export function boitesTextes(recette: Recette, t: number): BoiteTexte[] {
  const res: BoiteTexte[] = [];
  const gab = gabaritDe(recette);
  for (const ta of textesActifs(recette, t)) {
    const mp = mettreEnPageTexte(ta.texte.txt, ta.texte.style, gab);
    if (!mp) continue;
    const { cx, cy } = centreTexte(mp, ta.texte.x, ta.texte.y, gab);
    res.push({ i: ta.i, x: (cx - mp.l / 2) / gab.l, y: (cy - mp.h / 2) / gab.h, l: mp.l / gab.l, h: mp.h / gab.h });
  }
  return res;
}
