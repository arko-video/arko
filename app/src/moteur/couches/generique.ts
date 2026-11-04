// Calque « générique » : les 3 modèles animés d'intro / outro, dessinés par le code (aucune image copiée).
//  - abonne : nom de la chaîne + grand texte + bouton « S'ABONNER » qui se fait « cliquer », puis une cloche
//  - neon : nom de la chaîne en citron, deux traits lumineux qui balaient l'écran
//  - ecranFin : la mise en page d'un écran de fin YouTube (2 cadres vidéo + un rond pour l'abonnement)
// Même dessin dans l'aperçu (outil Intro / outro) et dans l'export : c'est rendre() qui l'appelle.

import type { Generique } from '../../recette/types';
import type { Ctx2D, Env } from '../canevas';
import { rectArrondi, sortieDouce } from './mesure';
import { CITRON } from './styles-texte';
import { GROTESK, INTER } from '../polices';

const FOND = '#0F1115';
const ROUGE = '#FF3B30';

/** Petit côté de l'image (1080 en référence) : toutes les tailles en dépendent. */
function unite(env: Env): number {
  return Math.min(env.l, env.h) / 1080;
}

/** Texte centré, réduit s'il dépasse `largeurMax` (px de l'image). Contour noir épais si demandé. */
function texteCentre(ctx: Ctx2D, txt: string, x: number, y: number, taille: number, largeurMax: number, o: { famille?: string; couleur?: string; contour?: number } = {}) {
  if (!txt) return;
  let t = taille;
  const famille = o.famille ?? GROTESK;
  ctx.font = `700 ${t}px ${famille}`;
  const l = ctx.measureText(txt).width;
  if (l > largeurMax) {
    t = Math.max(8, (t * largeurMax) / l);
    ctx.font = `700 ${t}px ${famille}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (o.contour) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.contour * 2;
    ctx.strokeStyle = '#000';
    ctx.strokeText(txt, x, y);
  }
  ctx.fillStyle = o.couleur ?? '#FFF';
  ctx.fillText(txt, x, y);
}

/** Fond commun : nuit d'Arko avec un léger dégradé qui respire. */
function fond(ctx: Ctx2D, env: Env, t: number) {
  ctx.fillStyle = FOND;
  ctx.fillRect(0, 0, env.l, env.h);
  const g = ctx.createRadialGradient(env.l / 2, env.h / 2, 0, env.l / 2, env.h / 2, Math.max(env.l, env.h) * 0.7);
  g.addColorStop(0, `rgba(200, 255, 77, ${0.1 + 0.04 * Math.sin(t * 2)})`);
  g.addColorStop(1, 'rgba(200, 255, 77, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, env.l, env.h);
}

/** Cloche simple (pour « active la cloche »). */
function cloche(ctx: Ctx2D, x: number, y: number, r: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, r * 0.55);
  ctx.quadraticCurveTo(-r * 0.75, -r * 0.9, 0, -r);
  ctx.quadraticCurveTo(r * 0.75, -r * 0.9, r * 0.9, r * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, r * 0.75, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function dessinerAbonne(ctx: Ctx2D, g: Generique, env: Env, t: number, texte: string) {
  const u = unite(env);
  const cx = env.l / 2;
  const entree = sortieDouce(t / 0.5);
  texteCentre(ctx, g.chaine ?? '', cx, env.h * 0.3, 70 * u, env.l * 0.85, { famille: INTER, couleur: CITRON });
  ctx.save();
  ctx.translate(cx, env.h * 0.46);
  ctx.scale(0.7 + 0.3 * entree, 0.7 + 0.3 * entree);
  ctx.globalAlpha = entree;
  texteCentre(ctx, texte, 0, 0, 130 * u, env.l * 0.9, { contour: 12 * u });
  ctx.restore();
  // Bouton : apparaît à 0,6 s, « cliqué » à 1,4 s (il devient gris « ABONNÉ »).
  const vu = sortieDouce((t - 0.6) / 0.3);
  if (vu <= 0) return;
  const clic = t >= 1.4;
  const enfonce = t >= 1.3 && t < 1.5 ? 0.92 : 1;
  const l = 520 * u;
  const h = 120 * u;
  ctx.save();
  ctx.translate(cx, env.h * 0.68);
  ctx.scale(enfonce * vu, enfonce * vu);
  ctx.fillStyle = clic ? '#3A3F4B' : ROUGE;
  rectArrondi(ctx, -l / 2, -h / 2, l, h, h / 2);
  ctx.fill();
  texteCentre(ctx, clic ? 'ABONNÉ ✓' : 'S\'ABONNER', 0, 0, 56 * u, l * 0.8, { famille: INTER });
  ctx.restore();
  if (clic) cloche(ctx, cx + l / 2 + 90 * u, env.h * 0.68, 46 * u, Math.sin(t * 18) * 0.35 * Math.max(0, 1 - (t - 1.4) / 1.2));
}

function dessinerNeon(ctx: Ctx2D, g: Generique, env: Env, t: number, texte: string) {
  const u = unite(env);
  // Deux traits lumineux qui balaient l'écran en sens inverse.
  for (let k = 0; k < 2; k++) {
    const p = ((t * 0.6 + k * 0.5) % 1) * 1.4 - 0.2;
    const y = env.h * (k === 0 ? 0.36 : 0.64);
    const x = k === 0 ? p * env.l : (1 - p) * env.l;
    const grad = ctx.createLinearGradient(x - 300 * u, 0, x + 300 * u, 0);
    grad.addColorStop(0, 'rgba(200, 255, 77, 0)');
    grad.addColorStop(0.5, CITRON);
    grad.addColorStop(1, 'rgba(200, 255, 77, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 4 * u, env.l, 8 * u);
  }
  const a = sortieDouce(t / 0.6);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.shadowColor = CITRON;
  ctx.shadowBlur = 40 * u;
  texteCentre(ctx, g.chaine || texte, env.l / 2, env.h * 0.5, 150 * u, env.l * 0.85, { couleur: CITRON });
  ctx.restore();
  if (g.chaine) texteCentre(ctx, texte, env.l / 2, env.h * 0.76, 64 * u, env.l * 0.85, { famille: INTER });
}

function dessinerEcranFin(ctx: Ctx2D, g: Generique, env: Env, t: number, texte: string) {
  const u = unite(env);
  const paysage = env.l > env.h;
  texteCentre(ctx, texte, env.l / 2, env.h * (paysage ? 0.14 : 0.2), 96 * u, env.l * 0.9, { contour: 10 * u });
  // Emplacements des éléments de l'écran de fin (à remplir dans YouTube Studio).
  const lc = paysage ? env.l * 0.3 : env.l * 0.7;
  const hc = (lc * 9) / 16;
  const centres = paysage ? [[env.l * 0.28, env.h * 0.52], [env.l * 0.72, env.h * 0.52]] : [[env.l / 2, env.h * 0.4], [env.l / 2, env.h * 0.62]];
  centres.forEach(([x, y], i) => {
    const a = sortieDouce((t - 0.2 - i * 0.2) / 0.4);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = CITRON;
    ctx.lineWidth = 6 * u;
    ctx.setLineDash([24 * u, 16 * u]);
    ctx.lineDashOffset = -t * 60 * u;
    rectArrondi(ctx, x! - lc / 2, y! - hc / 2, lc, hc, 18 * u);
    ctx.stroke();
    ctx.restore();
  });
  const r = 90 * u;
  const yRond = paysage ? env.h * 0.84 : env.h * 0.82;
  ctx.fillStyle = ROUGE;
  ctx.beginPath();
  ctx.arc(env.l / 2, yRond, r * (0.95 + 0.05 * Math.sin(t * 4)), 0, Math.PI * 2);
  ctx.fill();
  texteCentre(ctx, (g.chaine ?? '').slice(0, 2).toUpperCase() || '▶', env.l / 2, yRond, 70 * u, r * 1.6, { famille: INTER });
}

/** Dessine l'image t (secondes depuis le début du générique) d'un modèle. `texte` = texte principal. */
export function dessinerGenerique(ctx: Ctx2D, g: Generique, env: Env, t: number, texte: string) {
  ctx.save();
  fond(ctx, env, t);
  if (g.modele === 'neon') dessinerNeon(ctx, g, env, t, texte);
  else if (g.modele === 'ecranFin') dessinerEcranFin(ctx, g, env, t, texte);
  else dessinerAbonne(ctx, g, env, t, texte);
  // Fondu au noir sur les 0,3 dernières secondes.
  const fin = (g.dur - t) / 0.3;
  if (fin < 1) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, 1 - fin))})`;
    ctx.fillRect(0, 0, env.l, env.h);
  }
  ctx.restore();
}
