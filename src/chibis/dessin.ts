// D. Dessin d'un chibi (dev 3) en Canvas 2D (marche dans la page ET dans le Worker d'export : pas de SVG, pas de DOM).
// Style « dessin volontairement un peu raté » : grosse tête (≈ 60 % de la hauteur), petit corps, trait noir épais
// un peu tremblé (bruit tiré de la graine), couleurs plates, formes inégales ; yeux et bouche selon l'émotion.
// Même entrée → mêmes pixels (aucun Math.random, aucune horloge). Ce sont NOS personnages (CC0), rien n'est copié.
// Les styles « Persos » (papier découpé en buste, situations de jeu ; BD, dessin animé, raté, mascotte, pixel) sont
// dessinés par persos/dessin-perso.ts ; un style inconnu est dessiné comme le feutre.
// Contrat : conception/contrat-wankil.md §5.

import { creerCanevas, type Canevas, type Ctx2D } from '../moteur/canevas';
import type { DefinitionChibi, Emotion } from '../recette/types';
import { autourDuCou, bulle, sousLesYeux, surLaTete, surLesYeux } from './chapeaux';
import { cheveuxArriere, cheveuxAvant } from './coiffures';
import { estStylePerso, type Situation, type StyleChibi } from './catalogue';
import { bras, jambes, posesBras, torse } from './corps';
import { EXPRESSIONS, phaseSignes, type Expression } from './expressions';
import { COU, HANCHES, HAUT_CHEVEUX, TETE } from './geometrie';
import { dessinerPerso } from './persos/dessin-perso';
import { estBuste } from './persos/fiches';
import { Pinceau } from './pinceau';
import { signesAutour, signesDerriere, signesVisage, teintes } from './signes';
import { tenueArriere, tenueDevant } from './tenues';
import { bouche, sourcils, yeux } from './visage';

/** Pose d'une image : émotion, bouche ouverte ou fermée, et `t` (s) pour les petits mouvements (larmes, zzz…). */
export interface PoseChibi {
  emo: Emotion;
  bouche: boolean;
  t?: number;
  /** Dessiné retourné (il regarde vers la gauche) : avatar placé à droite de l'image. */
  retourne?: boolean;
  /** Situation de jeu (styles « Persos ») : objet en main, décor, pose des bras. Ignorée par les chibis. */
  sit?: Situation;
}

/** Où dessiner : (x, y) = milieu du BAS du chibi (pieds), `h` = hauteur totale en pixels. */
export interface CadreChibi {
  x: number;
  y: number;
  h: number;
}

/** Largeur d'un chibi = 0,8 × sa hauteur (pour placer et pour la boîte d'un PNG). */
export const PROPORTIONS_CHIBI = { largeur: 0.8, tete: 0.6 } as const;

/**
 * Boîte de tout ce qui peut être dessiné autour du chibi (chapeaux, signes), en part de sa hauteur `h`, depuis ses
 * pieds : x de −gauche à +droite, y de −haut à +bas. Sert au PNG, au cache et au style Paint.
 */
export const DEBORD_CHIBI = { cote: 0.55, haut: 1.42, bas: 0.03 } as const;
/** Pour un buste (papier découpé) : 100 unités = le buste seul, bras écartés et objets plus loin sur les côtés. */
export const DEBORD_BUSTE = { cote: 0.72, haut: 1.5, bas: 0.04 } as const;

/** Boîte de ce qui peut être dessiné, selon le style. */
export function debordDe(style: StyleChibi | string): { cote: number; haut: number; bas: number } {
  return estBuste(style) ? DEBORD_BUSTE : DEBORD_CHIBI;
}

/** Style Paint : dessiné sur un petit canevas de h / 6 pixels de haut, puis agrandi sans lissage. */
export const PAINT_REDUCTION = 6;
/** …mais jamais moins de 48 pixels de haut : en dessous, les visages ne se lisent plus. */
export const PAINT_MIN = 48;

let prevenu = false;

/** Dessine le chibi. Jamais d'erreur (appelé par le rendu) : en cas de souci, rien n'est dessiné (un avertissement). */
export function dessinerChibi(ctx: Ctx2D, def: DefinitionChibi, pose: PoseChibi, cadre: CadreChibi): void {
  if (!(cadre.h > 0) || !Number.isFinite(cadre.x) || !Number.isFinite(cadre.y)) return;
  try {
    if (estStylePerso(def.style)) return dessinerPerso(ctx, def.style, def, pose, cadre);
    if (def.style === 'paint') {
      const petit = imagePaint(def, pose, cadre.h);
      if (petit) {
        const k = cadre.h / petit.hp;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(petit.c, cadre.x - petit.piedX * k, cadre.y - petit.piedY * k, petit.c.width * k, petit.c.height * k);
        ctx.restore();
        return;
      }
    }
    dessinerTraits(ctx, def, pose, cadre);
  } catch (e) {
    if (!prevenu) {
      prevenu = true;
      console.warn('[Arko] Chibi : dessin impossible.', e);
    }
  }
}

/** Le dessin lui-même, au trait (le style Paint passe ici sur son petit canevas, avec un trait d'un pixel). */
export function dessinerTraits(ctx: Ctx2D, def: DefinitionChibi, pose: PoseChibi, cadre: CadreChibi) {
  const ex = EXPRESSIONS[pose.emo] ?? EXPRESSIONS.parle;
  const ph = phaseSignes(pose.emo, pose.t);
  // Un style inconnu (montage venu d'une version plus récente) est dessiné comme le feutre.
  const style = def.style === 'crayon' || def.style === 'paint' ? def.style : 'feutre';
  const pi = new Pinceau(ctx, style, def.graine, cadre.x, cadre.y, cadre.h / 100, pose.retourne ? -1 : 1);
  const haut = HAUT_CHEVEUX[def.coiffure] ?? -98;
  const [droit, gauche] = posesBras(ex.bras);
  signesDerriere(pi, ex.signes, ph);
  jambes(pi, def);
  pi.tourner(ex.corps ?? 0, HANCHES[0], HANCHES[1], () => {
    tenueArriere(pi, def);
    pi.tourner(ex.tete, COU[0], COU[1], () => cheveuxArriere(pi, def));
    torse(pi, def);
    tenueDevant(pi, def);
    autourDuCou(pi, def);
    if (!gauche.devant) bras(pi, def, gauche, -1);
    if (!droit.devant) bras(pi, def, droit, 1);
    pi.tourner(ex.tete, COU[0], COU[1], () => tete(pi, def, ex, pose, ph));
    if (gauche.devant) bras(pi, def, gauche, -1);
    if (droit.devant) bras(pi, def, droit, 1);
    signesAutour(pi, ex.signes, ph, haut);
  });
}

function tete(pi: Pinceau, def: DefinitionChibi, ex: Expression, pose: PoseChibi, ph: number) {
  for (const s of [-1, 1]) pi.forme(`oreille${s}`, pi.ovale(`oreille${s}`, s * (TETE.rx - 1), TETE.cy + 2, 5, 6.5, 7), def.peau, { epais: 0.85 });
  pi.forme('tete', pi.ovale('tete', TETE.cx, TETE.cy, TETE.rx, TETE.ry, 12), def.peau);
  teintes(pi, ex.signes);
  sousLesYeux(pi, def);
  yeux(pi, def, ex);
  surLesYeux(pi, def, pose.emo);
  bouche(pi, ex.bouche[pose.bouche ? 1 : 0]);
  cheveuxAvant(pi, def);
  surLaTete(pi, def, pose.emo);
  sourcils(pi, ex.sourcils);
  signesVisage(pi, ex.signes, ph);
  bulle(pi, def);
}

/* ------------------------------------------------------------------ Style Paint (petit canevas net) */

interface ImagePaint {
  c: Canevas;
  /** Hauteur du chibi sur le petit canevas et place de ses pieds. */
  hp: number;
  piedX: number;
  piedY: number;
}

/** Peut-on fabriquer un canevas ici (page ou Worker) ? Non dans les tests Node : on dessine alors au trait. */
export function canevasPossible(): boolean {
  return typeof OffscreenCanvas !== 'undefined' || typeof document !== 'undefined';
}

/** Dessin Paint sur un petit canevas (h / 6), contour d'un pixel, bords nets (pas de demi-transparence). */
function imagePaint(def: DefinitionChibi, pose: PoseChibi, h: number): ImagePaint | null {
  if (!canevasPossible()) return null;
  const hp = Math.min(Math.round(h), Math.max(PAINT_MIN, Math.round(h / PAINT_REDUCTION)));
  const l = Math.ceil(hp * DEBORD_CHIBI.cote * 2);
  const ht = Math.ceil(hp * (DEBORD_CHIBI.haut + DEBORD_CHIBI.bas));
  const c = creerCanevas(l, ht);
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) return null;
  const piedX = l / 2;
  const piedY = Math.round(hp * DEBORD_CHIBI.haut);
  dessinerTraits(ctx, def, pose, { x: piedX, y: piedY, h: hp });
  netteter(ctx, l, ht);
  return { c, hp, piedX, piedY };
}

/** Bords nets « logiciel de dessin » : chaque pixel est plein ou vide. */
function netteter(ctx: Ctx2D, l: number, h: number) {
  const img = ctx.getImageData(0, 0, l, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i]!;
    if (a === 0 || a === 255) continue;
    d[i] = a < 70 ? 0 : 255; // les couleurs lues ne sont pas prémultipliées : rien d'autre à changer
  }
  ctx.putImageData(img, 0, 0);
}
