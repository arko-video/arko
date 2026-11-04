// Calque des sous-titres (phase 2) : une ligne de mots à la fois, en 3 styles.
//  - karaoké : blanc avec contour, le mot en cours en citron et agrandi × 1,1
//  - pop : un seul mot à la fois, en gros et en majuscules
//  - boîte : texte blanc sur fond noir à 80 %
// Les mots forts sont en citron et un peu plus gros. Mise en page en px de RÉFÉRENCE (1080 px de large),
// puis ctx.scale(env.echelle) : même rendu dans l'aperçu et dans l'export.

import { TIKTOK, type Gabarit } from '../../recette/destination';
import type { Ctx2D, Env } from '../canevas';
import type { SousTitreActif } from '../etat-image';
import { memo, mesurer, rectArrondi, retirerEmojis, sortieDouce } from './mesure';
import { MOT_FORT, police, styleSousTitres, type StyleSousTitres } from './styles-texte';

/** Largeur maximale d'une ligne de sous-titres en TikTok (les autres : gabarit), et nombre de rangées avant de rétrécir. */
export const LARGEUR_MAX_ST = TIKTOK.largeurSousTitres;
const RANGEES_MAX = 2;
const REDUCTION = 0.9;
const TAILLE_MIN = 0.6;
/** Ligne de base sous le centre de la rangée (× taille). */
const BASE = 0.36;
/** Espace ajouté entre les mots (× taille), pour que le mot en cours agrandi ne touche pas ses voisins. */
const ESPACE_EN_PLUS = 0.08;
/** Marge en haut et en bas de l'image (px de référence). */
const MARGE_IMAGE = 20;

/** Un mot à dessiner : position de son centre (x) et de sa ligne de base (y), relatives au centre du bloc. */
export interface MotDispose {
  txt: string;
  /** Indice du mot dans la ligne de sous-titres. */
  j: number;
  x: number;
  y: number;
  l: number;
  police: string;
  fort: boolean;
}

export interface LigneDisposee {
  mots: MotDispose[];
  taille: number;
  /** Taille du bloc (fond compris), px de référence. */
  l: number;
  h: number;
}

interface MotBrut {
  txt: string;
  j: number;
  fort: boolean;
}

/** Dispose une ligne de mots (null si rien à dessiner). Rétrécit si elle dépasse 2 rangées de 900 px. */
export function disposerLigne(mots: MotBrut[], st: StyleSousTitres, largeurLigne = LARGEUR_MAX_ST): LigneDisposee | null {
  const propres = mots
    .map((m) => ({ ...m, txt: st.unMot ? retirerEmojis(m.txt).toUpperCase() : retirerEmojis(m.txt) }))
    .filter((m) => m.txt.length > 0);
  if (propres.length === 0) return null;
  const [mx, my] = st.fond?.marge ?? [0, 0];
  const bord = st.contour?.epaisseur ?? 0;
  const largeurMax = largeurLigne - 2 * (mx + bord);
  for (let taille = st.taille; ; taille *= REDUCTION) {
    const normale = police(st.poids, taille, st.famille);
    const forte = police(st.poids, taille * MOT_FORT.echelle, st.famille);
    // Espace entre deux mots : l'espace de la police + les deux contours + de la place pour le mot agrandi.
    const espace = mesurer(' ', normale) + 2 * bord + ESPACE_EN_PLUS * taille;
    const mesures = propres.map((m) => {
      const p = m.fort ? forte : normale;
      return { ...m, police: p, l: mesurer(m.txt, p) };
    });
    // Rangées gloutonnes.
    const rangees: (typeof mesures)[] = [[]];
    let largeur = 0;
    for (const m of mesures) {
      const rangee = rangees[rangees.length - 1]!;
      if (rangee.length > 0 && largeur + espace + m.l > largeurMax) {
        rangees.push([m]);
        largeur = m.l;
      } else {
        largeur += (rangee.length > 0 ? espace : 0) + m.l;
        rangee.push(m);
      }
    }
    const largeurs = rangees.map((r) => r.reduce((s, m) => s + m.l, 0) + espace * (r.length - 1));
    const plusLarge = Math.max(...largeurs);
    const tient = rangees.length <= RANGEES_MAX && plusLarge <= largeurMax;
    if (tient || taille * REDUCTION < st.taille * TAILLE_MIN) {
      const hLigne = taille * st.interligne;
      const h = rangees.length * hLigne + 2 * (my + bord);
      const res: MotDispose[] = [];
      rangees.forEach((r, k) => {
        let x = -largeurs[k]! / 2;
        const y = -h / 2 + my + bord + hLigne * (k + 0.5) + BASE * taille;
        for (const m of r) {
          res.push({ txt: m.txt, j: m.j, x: x + m.l / 2, y, l: m.l, police: m.police, fort: m.fort });
          x += m.l + espace;
        }
      });
      return { mots: res, taille, l: plusLarge + 2 * (mx + bord), h };
    }
  }
}

/** Mots de la ligne à afficher (pop : seulement le mot en cours). */
function motsAffiches(actif: SousTitreActif, st: StyleSousTitres): MotBrut[] {
  const tous = actif.ligne.mots.map((m, j) => ({ txt: m.mot[0], j, fort: m.mot[3] === 1 }));
  return st.unMot ? tous.slice(actif.actif, actif.actif + 1) : tous;
}

/** Mise en page de la ligne visible et centre du bloc (px de référence). */
export function placerSousTitre(actif: SousTitreActif, gab: Gabarit = TIKTOK): { dl: LigneDisposee; cx: number; cy: number } | null {
  const st = styleSousTitres(actif.style);
  const mots = motsAffiches(actif, st);
  const cle = `st|${gab.largeurSousTitres}|${actif.style}|${mots.map((m) => `${m.j}:${m.fort ? 1 : 0}:${m.txt}`).join('\u0001')}`;
  const dl = memo(cle, () => disposerLigne(mots, st, gab.largeurSousTitres));
  if (!dl) return null;
  const cy = Math.min(Math.max(actif.y * gab.h, dl.h / 2 + MARGE_IMAGE), gab.h - dl.h / 2 - MARGE_IMAGE);
  return { dl, cx: gab.l / 2, cy };
}

/** Dessine la ligne de sous-titres visible. */
export function dessinerSousTitres(ctx: Ctx2D, actif: SousTitreActif | null, env: Env, gab: Gabarit = TIKTOK): void {
  if (!actif) return;
  const st = styleSousTitres(actif.style);
  const place = placerSousTitre(actif, gab);
  if (!place) return;
  const { dl, cx, cy } = place;
  ctx.save();
  ctx.translate((cx * env.l) / gab.l, (cy * env.h) / gab.h);
  ctx.scale(env.echelle, env.echelle);
  // Pop : chaque mot arrive avec un petit rebond.
  if (st.unMot && actif.ageMot < 0.1) {
    const e = 0.8 + 0.2 * sortieDouce(actif.ageMot / 0.1);
    ctx.scale(e, e);
  }
  if (st.fond) {
    ctx.fillStyle = st.fond.couleur;
    rectArrondi(ctx, -dl.l / 2, -dl.h / 2, dl.l, dl.h, st.fond.rayon);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (st.contour) {
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = st.contour.epaisseur * 2;
    ctx.strokeStyle = st.contour.couleur;
  }
  // Le mot en cours est dessiné en dernier, par-dessus ses voisins.
  const ordre = [...dl.mots].sort((a, b) => Number(a.j === actif.actif) - Number(b.j === actif.actif));
  for (const m of ordre) {
    const enCours = m.j === actif.actif && st.actif !== undefined;
    ctx.save();
    ctx.font = m.police;
    ctx.fillStyle = enCours ? st.actif!.couleur : m.fort ? MOT_FORT.couleur : st.couleur;
    // Agrandissement du mot en cours autour de son centre (sans déplacer les autres mots).
    const centreY = m.y - BASE * dl.taille;
    ctx.translate(m.x, centreY);
    if (enCours) {
      const e = 1 + (st.actif!.echelle - 1) * Math.min(1, actif.ageMot / 0.06);
      ctx.scale(e, e);
    }
    if (st.contour) ctx.strokeText(m.txt, 0, BASE * dl.taille);
    ctx.fillText(m.txt, 0, BASE * dl.taille);
    ctx.restore();
  }
  ctx.restore();
}
