// Fond vert et mèmes « Incrustation » dans LE chemin de rendu (rendre.ts) : aperçu = export.
// À chaque image : pour chaque incrustation visible, l'image du clip est décodée (curseur du cache de décodage),
// réduite à sa taille d'affichage, détourée (carte graphique, sinon processeur : même calcul) dans SON canevas ;
// puis le compositeur pose ces canevas par-dessus la vidéo, sous les textes et les sous-titres.
// Le son des clips est lu par morceaux, comme les sons importés.

import type { VideoSample } from 'mediabunny';
import { INCRUSTATION } from '../../recette/normaliser-bibliotheque';
import type { Incrustation, Recette, Sec } from '../../recette/types';
import type { SonPose } from '../audio/mixeur';
import type { CacheDecodage } from '../cache-decodage';
import type { Ctx2D, Env, ImageSource } from '../canevas';
import type { Rect } from '../mises-en-page/flou';
import { chromaCpu, type ReglagesChroma } from './chroma';
import { MoteurChroma, type CanevasGl } from './gpu-chroma';

type Canevas2D = OffscreenCanvas | HTMLCanvasElement;
type ImageDecodee = (s: VideoSample) => ImageSource;

/** Plus grand côté traité (au-delà, l'image est réduite avant le détourage). */
const COTE_MAX = 1920;
const PRECHAUFFE_S: Sec = 0.5;
const DANS_LA_PAGE = typeof document !== 'undefined';

let moteur: MoteurChroma | null | undefined;
let panne = false;
let forcerProcesseur = false;

/** Le moteur WebGL2 de ce fil (null : pas de WebGL2, panne, ou processeur demandé). */
export function moteurChroma(): MoteurChroma | null {
  if (forcerProcesseur || panne) return null;
  if (moteur === undefined) moteur = MoteurChroma.creer();
  return moteur && !moteur.perdu ? moteur : null;
}

/** Banc d'essai : force le calcul sur le processeur (repli sans WebGL2). */
export function definirProcesseurSeul(oui: boolean) {
  forcerProcesseur = oui;
}

/** Durée d'une incrustation dans la vidéo finale. */
export const dureeIncrustation = (x: Incrustation): Sec => x.a - x.de;

/** Incrustations visibles au temps de sortie t, avec leur indice. */
export function visibles(liste: readonly Incrustation[], t: Sec): number[] {
  const res: number[] = [];
  liste.forEach((x, i) => {
    if (t >= x.t && t < x.t + dureeIncrustation(x)) res.push(i);
  });
  return res;
}

/** Rectangle du clip (srcL × srcH) dans l'image finale : plein écran (recouvre, centré) ou taille et centre réglés. */
export function rectIncrustation(x: Incrustation, srcL: number, srcH: number, env: Pick<Env, 'l' | 'h'>): Rect {
  if (x.plein) {
    const e = Math.max(env.l / srcL, env.h / srcH);
    return { x: (env.l - srcL * e) / 2, y: (env.h - srcH * e) / 2, l: srcL * e, h: srcH * e };
  }
  const l = (x.taille ?? INCRUSTATION.taille.defaut) * env.l;
  const h = (l * srcH) / srcL;
  return { x: (x.x ?? 0.5) * env.l - l / 2, y: (x.y ?? 0.5) * env.h - h / 2, l, h };
}

/** Taille de travail : celle de l'affichage, jamais plus grande que le clip ni que 1920 px de côté. */
export function tailleTravail(rect: Rect, srcL: number, srcH: number): { l: number; h: number } {
  const e = Math.min(1, rect.l / srcL, COTE_MAX / Math.max(srcL, srcH));
  return { l: Math.max(2, Math.round(srcL * e)), h: Math.max(2, Math.round(srcH * e)) };
}

function canevas(l: number, h: number, alpha: boolean): { c: Canevas2D; ctx: Ctx2D } | null {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(l, h) : DANS_LA_PAGE ? Object.assign(document.createElement('canvas'), { width: l, height: h }) : null;
  const ctx = c?.getContext('2d', { alpha, willReadFrequently: !alpha }) as Ctx2D | null | undefined;
  return c && ctx ? { c, ctx } : null;
}

/** Un clip détouré prêt à poser : son canevas (l × h utiles) et son rectangle dans l'image finale. */
export interface CalqueClip {
  c: Canevas2D;
  l: number;
  h: number;
  rect: Rect;
}

/** Pose les calques (dans l'ordre : le dernier posé est au-dessus). */
export function poserCalques(ctx: Ctx2D, calques: readonly CalqueClip[]) {
  for (const k of calques) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(k.c, 0, 0, k.l, k.h, k.rect.x, k.rect.y, k.rect.l, k.rect.h);
    ctx.restore();
  }
}

/** Détoure l'image du canevas de travail (l × h) dans `sortie`. Carte graphique, sinon processeur. */
export function detourerDans(travail: { c: Canevas2D; ctx: Ctx2D }, l: number, h: number, reg: ReglagesChroma, sortie: { c: Canevas2D; ctx: Ctx2D }) {
  const m = moteurChroma();
  sortie.ctx.clearRect(0, 0, l, h);
  if (m) {
    try {
      m.detourer(travail.c as TexImageSource, l, h, reg);
      sortie.ctx.drawImage(m.canevas as CanevasGl, 0, 0);
      return;
    } catch (e) {
      console.warn('[Arko] Fond vert : la carte graphique a échoué, calcul sur le processeur.', e);
      panne = true;
    }
  }
  const px = travail.ctx.getImageData(0, 0, l, h);
  const res = chromaCpu(px.data, l, h, reg);
  sortie.ctx.putImageData(new ImageData(res as Uint8ClampedArray<ArrayBuffer>, l, h), 0, 0);
}

/** Incrustations d'un rendu : calques d'une image, clés des curseurs à garder, son. null s'il n'y en a pas. */
export interface IncrustationsRendu {
  /** Clés des curseurs des incrustations visibles (ou qui commencent bientôt) au temps t. */
  cles(t: Sec): string[];
  calques(t: Sec, env: Env, cache: CacheDecodage, envelopper: ImageDecodee): Promise<CalqueClip[]>;
  sons(t0: Sec, t1: Sec, cache: CacheDecodage): Promise<SonPose[]>;
}

export function preparerIncrustations(recette: Recette): IncrustationsRendu | null {
  const liste = recette.incrustations ?? [];
  if (liste.length === 0) return null;
  const cleDe = (i: number) => {
    const x = liste[i]!;
    return `inc|${i}|${x.src}|${x.de}|${x.a}`;
  };
  const sorties = new Map<number, { c: Canevas2D; ctx: Ctx2D }>();
  let travail: { c: Canevas2D; ctx: Ctx2D } | null = null;

  function zone(i: number, l: number, h: number) {
    let s = sorties.get(i);
    if (!s || s.c.width < l || s.c.height < h) {
      s = canevas(Math.max(l, s?.c.width ?? 0), Math.max(h, s?.c.height ?? 0), true) ?? undefined;
      if (!s) return null;
      sorties.set(i, s);
    }
    return s;
  }

  function cles(t: Sec): string[] {
    const res = visibles(liste, t).map(cleDe);
    liste.forEach((x, i) => {
      if (x.t > t && x.t - t < PRECHAUFFE_S) res.push(cleDe(i));
    });
    return res;
  }

  async function calques(t: Sec, env: Env, cache: CacheDecodage, envelopper: ImageDecodee): Promise<CalqueClip[]> {
    const res: CalqueClip[] = [];
    liste.forEach((x, i) => {
      if (x.t > t && x.t - t < PRECHAUFFE_S) cache.curseur(cleDe(i), { src: x.src, a: x.a })?.prechauffer(x.de);
    });
    for (const i of visibles(liste, t)) {
      const x = liste[i]!;
      const curseur = cache.curseur(cleDe(i), { src: x.src, a: x.a });
      if (!curseur) continue;
      const ts = Math.min(x.a - 0.001, x.de + (t - x.t));
      const calque = await curseur.avecImage(ts, (sample) => {
        if (!sample) return null;
        const img = envelopper(sample);
        if (img.largeur <= 0 || img.hauteur <= 0) return null;
        const rect = rectIncrustation(x, img.largeur, img.hauteur, env);
        const { l, h } = tailleTravail(rect, img.largeur, img.hauteur);
        const sortie = zone(i, l, h);
        if (!sortie) return null;
        if (!x.cle) {
          sortie.ctx.clearRect(0, 0, l, h);
          img.dessiner(sortie.ctx, 0, 0, img.largeur, img.hauteur, 0, 0, l, h);
          return { c: sortie.c, l, h, rect };
        }
        if (!travail || travail.c.width < l || travail.c.height < h) travail = canevas(Math.max(l, travail?.c.width ?? 0), Math.max(h, travail?.c.height ?? 0), false);
        if (!travail) return null;
        // Le canevas de travail doit avoir EXACTEMENT la taille l × h (la texture lit tout le canevas).
        if (travail.c.width !== l || travail.c.height !== h) {
          travail.c.width = l;
          travail.c.height = h;
        }
        img.dessiner(travail.ctx, 0, 0, img.largeur, img.hauteur, 0, 0, l, h);
        detourerDans(travail, l, h, x.cle, sortie);
        return { c: sortie.c, l, h, rect };
      });
      if (calque) res.push(calque);
    }
    return res;
  }

  async function sons(t0: Sec, t1: Sec, cache: CacheDecodage): Promise<SonPose[]> {
    const res: SonPose[] = [];
    for (const x of liste) {
      const dur = dureeIncrustation(x);
      const vol = x.vol ?? INCRUSTATION.vol.defaut;
      if (x.son === false || vol <= 0 || x.t >= t1 || x.t + dur <= t0) continue;
      const lecteur = cache.lecteurAudio(x.src);
      if (!lecteur) continue;
      const pcm = await lecteur.lire(x.de + Math.max(0, t0 - x.t), x.de + Math.min(dur, t1 - x.t)).catch(() => null);
      if (!pcm) continue;
      // Jamais au-delà de la fin gardée du clip (a).
      const n = Math.max(0, Math.min(pcm.canaux[0]?.length ?? 0, Math.round((x.a - pcm.debut) * pcm.frequence)));
      const canaux = pcm.canaux.map((c) => c.subarray(0, n));
      if (n > 0) res.push({ t: x.t + (pcm.debut - x.de), vol, pcm: { ...pcm, canaux } });
    }
    return res;
  }

  return { cles, calques, sons };
}
