// D. Cache d'images des chibis (dev 3) : un chibi est dessiné UNE fois par (définition, émotion, bouche, hauteur
// arrondie, retourné, image des signes animés), puis recopié (drawImage). 64 images au plus (les plus anciennes
// partent). Identique dans l'aperçu et dans l'export (même code, même clé). Contrat : contrat-wankil.md §5.

import { creerCanevas, type Canevas, type Ctx2D } from '../moteur/canevas';
import type { DefinitionChibi } from '../recette/types';
import { canevasPossible, debordDe, dessinerChibi, type CadreChibi, type PoseChibi } from './dessin';
import { phaseSignes } from './expressions';
import { estBuste } from './persos/fiches';
import { phaseBalancement } from './persos/papier';

export const CACHE_CHIBIS_MAX = 64;

interface Entree {
  c: Canevas;
  /** Pieds du chibi dans le canevas, et sa hauteur. */
  x: number;
  y: number;
  h: number;
}

const cache = new Map<string, Entree>();

/** Clé du cache (la hauteur est arrondie au pixel). */
export function cleChibi(def: DefinitionChibi, pose: PoseChibi, h: number): string {
  const d = [def.style, def.graine, def.peau, def.coiffure, def.cheveux, def.tenue, def.accessoire, def.couleur, def.yeux ?? ''].join('|');
  const base = `${d}|${pose.emo}|${pose.bouche ? 1 : 0}|${pose.retourne ? 1 : 0}|${Math.round(phaseSignes(pose.emo, pose.t) * 6)}|${Math.round(h)}`;
  // Persos en buste : la situation, et le balancement de la tête (6 images par seconde) puis l'animation des objets.
  if (!estBuste(def.style)) return pose.sit && pose.sit !== 'aucune' ? `${base}|${pose.sit}|${phaseBalancement(pose.t)}` : base;
  return `${base}|${pose.sit ?? 'aucune'}|${phaseBalancement(pose.t)}`;
}

/** Nombre d'images gardées (pour les tests). */
export function tailleCacheChibis(): number {
  return cache.size;
}

export function viderCacheChibis() {
  cache.clear();
}

/** Image du chibi (fabriquée si besoin) ; null si on ne peut pas fabriquer de canevas (tests Node). */
function image(def: DefinitionChibi, pose: PoseChibi, h: number): Entree | null {
  const cle = cleChibi(def, pose, h);
  const deja = cache.get(cle);
  if (deja) {
    cache.delete(cle);
    cache.set(cle, deja); // la plus récente en dernier
    return deja;
  }
  if (!canevasPossible()) return null;
  const hr = Math.max(4, Math.round(h));
  const D = debordDe(def.style);
  const l = Math.ceil(hr * D.cote * 2);
  const ht = Math.ceil(hr * (D.haut + D.bas));
  const c = creerCanevas(l, ht);
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) return null;
  const e: Entree = { c, x: l / 2, y: Math.round(hr * D.haut), h: hr };
  dessinerChibi(ctx, def, pose, { x: e.x, y: e.y, h: hr });
  cache.set(cle, e);
  while (cache.size > CACHE_CHIBIS_MAX) cache.delete(cache.keys().next().value!);
  return e;
}

/**
 * Dessine le chibi en passant par le cache (avatars, chibi plein écran). `echelle` agrandit autour des pieds sans
 * redessiner (apparition « pop ») ; `alpha` = opacité.
 */
export function dessinerChibiCache(ctx: Ctx2D, def: DefinitionChibi, pose: PoseChibi, cadre: CadreChibi, echelle = 1, alpha = 1) {
  if (!(cadre.h > 0) || !(echelle > 0) || !(alpha > 0)) return;
  const e = image(def, pose, cadre.h);
  ctx.save();
  if (alpha < 1) ctx.globalAlpha *= alpha;
  if (!e) {
    ctx.translate(cadre.x, cadre.y);
    ctx.scale(echelle, echelle);
    dessinerChibi(ctx, def, pose, { x: 0, y: 0, h: cadre.h });
  } else {
    const k = (cadre.h / e.h) * echelle;
    ctx.drawImage(e.c, cadre.x - e.x * k, cadre.y - e.y * k, e.c.width * k, e.c.height * k);
  }
  ctx.restore();
}
