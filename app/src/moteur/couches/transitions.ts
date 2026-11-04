// Transitions entre plans (phase 3). Les plans ne se chevauchent jamais : la transition se joue
// à la fin du plan précédent (avancement −1 → 0) puis au début du nouveau plan (0 → 1). La coupe est à 0.
// Deux familles :
//  - MOUVEMENT (zoom, glisse, secousse) : l'image mise en page bouge, les textes et sous-titres restent fixes.
//    zoom et secousse = transformation posée AVANT la mise en page. La glisse, elle, décale la mise en page
//    déjà dessinée (une copie, qui boucle) : redessiner la mise en page 2 fois coûtait +33 ms par image ;
//  - CALQUE (flash, noir, glitch) : dessiné APRÈS la mise en page, par-dessus l'image.
// Jamais de getImageData (trop lent) : seulement drawImage, fillRect, globalAlpha et les modes de fusion.

import type { Canevas, Ctx2D, Env } from '../canevas';
import { contexte2D, creerCanevas } from '../canevas';
import type { TransitionActive } from '../etat-image';

/** Déplacement maximal de la glisse à la coupe (part de la largeur). */
const GLISSE_MAX = 0.5;
/** Agrandissement de la transition « zoom » à la coupe (1 → 1,4 puis 1,4 → 1). */
const ZOOM_MAX = 0.4;
/** Amplitude de la secousse (part de la largeur) et rotation maximale (degrés). */
const SECOUSSE_MAX = 0.07;
const SECOUSSE_ROTATION = 3;

/** Transformation de l'image pour un dessin de la mise en page. */
export interface Mouvement {
  /** Décalage en pixels de la destination. */
  dx: number;
  dy: number;
  /** Agrandissement autour du centre de l'image. */
  echelle: number;
  /** Rotation en degrés autour du centre. */
  rotation: number;
}

const IDENTITE: Mouvement = { dx: 0, dy: 0, echelle: 1, rotation: 0 };

/** Intensité de 0 à 1, maximale à la coupe (avancement 0). */
export function intensite(avancement: number): number {
  return 1 - Math.min(1, Math.abs(avancement));
}

/** Petit hasard DÉTERMINISTE (même image → mêmes valeurs, en aperçu comme en export). Renvoie [0, 1[. */
export function hasard(graine: number): () => number {
  let a = (Math.imul(graine | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Numéro de l'image (30 i/s) : sert de graine au hasard. */
function numeroImage(t: number): number {
  return Math.round(t * 30);
}

/** Décalage de la glisse (part de la largeur) : l'ancien plan file vers la gauche, le nouveau arrive de la droite. */
export function decalageGlisse(avancement: number): number {
  if (avancement < 0) return -GLISSE_MAX * (1 + avancement) ** 2; // accélère jusqu'à la coupe
  return GLISSE_MAX * (1 - avancement) ** 2; // puis ralentit
}

/** Mouvements à appliquer avant la mise en page (zoom, secousse ; la glisse est faite après, voir glisserImage). */
export function mouvementsTransition(tr: TransitionActive | null, env: Env, t: number): Mouvement[] {
  if (!tr) return [IDENTITE];
  const i = intensite(tr.avancement);
  if (tr.type === 'zoom') {
    const u = tr.avancement < 0 ? 1 + tr.avancement : 1 - tr.avancement;
    return [{ ...IDENTITE, echelle: 1 + ZOOM_MAX * u * u }];
  }
  if (tr.type === 'secousse') {
    const r = hasard(numeroImage(t) * 7 + 1);
    const a = SECOUSSE_MAX * env.l * i;
    return [{ dx: (r() * 2 - 1) * a, dy: (r() * 2 - 1) * a, rotation: (r() * 2 - 1) * SECOUSSE_ROTATION * i, echelle: 1 + 0.1 * i }];
  }
  return [IDENTITE];
}

/** Pose un mouvement sur le contexte (autour du centre de l'image). */
export function appliquerMouvement(ctx: Ctx2D, m: Mouvement, env: Env) {
  if (m === IDENTITE || (m.dx === 0 && m.dy === 0 && m.echelle === 1 && m.rotation === 0)) return;
  ctx.translate(env.l / 2 + m.dx, env.h / 2 + m.dy);
  if (m.rotation !== 0) ctx.rotate((m.rotation * Math.PI) / 180);
  ctx.scale(m.echelle, m.echelle);
  ctx.translate(-env.l / 2, -env.h / 2);
}

/** Canevas de travail réutilisé d'une image à l'autre (une copie de l'image en cours). */
export class TamponImage {
  private canevas: Canevas | null = null;
  private ctx: Ctx2D | null = null;

  /** Copie l'image actuelle de `ctx` et renvoie le contexte de la copie (null si impossible, ex. faux contexte). */
  copier(ctx: Ctx2D, env: Env): Ctx2D | null {
    const source = (ctx as { canvas?: Canevas }).canvas;
    if (!source || typeof source.width !== 'number') return null;
    if (!this.canevas || this.canevas.width !== env.l || this.canevas.height !== env.h) {
      this.canevas = creerCanevas(env.l, env.h);
      this.ctx = contexte2D(this.canevas);
    }
    const c = this.ctx!;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.drawImage(source, 0, 0, env.l, env.h);
    return c;
  }
}

/**
 * Dessine `copie` décalée de dx en bouclant (la partie qui sort à droite revient à gauche).
 * Décalage arrondi au pixel et lissage coupé : copie directe, sans rééchantillonnage (bien plus rapide sans GPU).
 */
function dessinerBouclee(ctx: Ctx2D, copie: Canevas, dx: number, env: Env) {
  ctx.imageSmoothingEnabled = false;
  const d = ((Math.round(dx) % env.l) + env.l) % env.l;
  ctx.drawImage(copie, d, 0, env.l, env.h);
  if (d > 0) ctx.drawImage(copie, d - env.l, 0, env.l, env.h);
}

/**
 * Glisse : l'image mise en page est décalée (en bouclant : jamais de bord noir), avec un flou de mouvement
 * = 5 dessins de la copie, le 1er opaque puis 4 décalés avec un globalAlpha qui fait la moyenne (1/2, 1/3, 1/4, 1/5).
 * L'étalement du flou suit la vitesse du mouvement.
 */
export function glisserImage(ctx: Ctx2D, tr: TransitionActive | null, env: Env, tampon?: TamponImage) {
  if (!tr || tr.type !== 'glisse' || !tampon) return;
  const dx = decalageGlisse(tr.avancement) * env.l;
  // Vitesse (part de largeur par seconde) ≈ dérivée du décalage ; étalement = chemin parcouru en 1/30 s.
  const pas = 0.02;
  const vitesse = Math.abs(decalageGlisse(Math.min(1, tr.avancement + pas)) - decalageGlisse(Math.max(-1, tr.avancement - pas))) / (2 * pas);
  const etalement = Math.min(0.25, vitesse * 0.35) * env.l;
  if (Math.abs(dx) < 0.5 && etalement < 2) return;
  const copie = tampon.copier(ctx, env);
  if (!copie) return;
  const image = copie.canvas as Canevas;
  ctx.save();
  ctx.globalAlpha = 1;
  dessinerBouclee(ctx, image, dx, env);
  if (etalement >= 2) {
    [-0.5, 0.5, -0.25, 0.25].forEach((f, j) => {
      ctx.globalAlpha = 1 / (j + 2);
      dessinerBouclee(ctx, image, dx + f * etalement, env);
    });
  }
  ctx.restore();
}

/** Calques dessinés APRÈS la mise en page : flash blanc, passage au noir, glitch. */
export function dessinerTransition(ctx: Ctx2D, tr: TransitionActive | null, env: Env, t = 0, tampon?: TamponImage): void {
  if (!tr) return;
  const a = tr.avancement;
  if (tr.type === 'flash') {
    // Monte vite juste avant la coupe, blanc pur à la coupe, puis s'efface.
    voile(ctx, '#ffffff', a < 0 ? (1 + a) ** 3 : (1 - a) ** 1.5, env);
  } else if (tr.type === 'noir') {
    voile(ctx, '#000000', intensite(a), env);
  } else if (tr.type === 'glitch') {
    dessinerGlitch(ctx, intensite(a), env, numeroImage(t), tampon);
  }
}

function voile(ctx: Ctx2D, couleur: string, alpha: number, env: Env) {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, env.l, env.h);
  ctx.restore();
}

/** Glitch : tranches horizontales décalées, puis décalage du rouge (le rouge part d'un côté, le cyan de l'autre). */
function dessinerGlitch(ctx: Ctx2D, i: number, env: Env, image: number, tampon?: TamponImage) {
  if (i < 0.08 || !tampon) return;
  const r = hasard(image * 13 + 5);
  ctx.save();
  // 1. Tranches.
  const copie = tampon.copier(ctx, env);
  if (!copie) {
    ctx.restore();
    return;
  }
  const nb = 3 + Math.floor(r() * 5 * i);
  for (let k = 0; k < nb; k++) {
    const y = Math.floor(r() * env.h);
    const h = Math.max(2, Math.floor((0.015 + r() * 0.08) * env.h * i));
    const dx = (r() * 2 - 1) * 0.12 * env.l * i;
    ctx.drawImage(copie.canvas as Canevas, 0, y, env.l, h, dx, y, env.l, h);
  }
  // 2. Décalage du rouge : on garde vert + bleu ici, et on rajoute le rouge (seul) décalé.
  const d = Math.round((0.012 + 0.03 * r()) * env.l * i) * (r() < 0.5 ? -1 : 1);
  const rouge = tampon.copier(ctx, env);
  if (rouge && d !== 0) {
    rouge.globalCompositeOperation = 'multiply';
    rouge.fillStyle = '#ff0000';
    rouge.fillRect(0, 0, env.l, env.h);
    rouge.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(0, 0, env.l, env.h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(rouge.canvas as Canevas, d, 0, env.l, env.h);
  }
  ctx.restore();
}
