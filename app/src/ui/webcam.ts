// Jeu + webcam : calculs purs du cadre webcam et de la zone de jeu, et mémoire du dernier cadre (arko.cam).

import { JEU_CAM } from '../recette/defauts';
import type { Cadre, MiseEnPage } from '../recette/types';
import { auCentieme } from './format';

export type MiseJeuCam = Extract<MiseEnPage, { type: 'jeuCam' }>;
export type Coin = 'hg' | 'hd' | 'bg' | 'bd';
export const COINS: Coin[] = ['hg', 'hd', 'bg', 'bd'];

const CLE = 'arko.cam';
const borne = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Réglage mémorisé d'un montage à l'autre (un streamer garde la même scène OBS). */
export interface CamMemorisee {
  cam: Cadre;
  camEnHaut: boolean;
  partCam: number;
}

function cadreValide(c: unknown): c is Cadre {
  const o = c as Partial<Cadre> | null;
  return !!o && [o.x, o.y, o.l, o.h].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1);
}

export function lireCamMemorisee(): CamMemorisee | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const o = JSON.parse(brut) as Partial<CamMemorisee>;
    if (!cadreValide(o.cam)) return null;
    return {
      cam: o.cam,
      camEnHaut: o.camEnHaut !== false,
      partCam: typeof o.partCam === 'number' ? borne(o.partCam, JEU_CAM.partCamMin, JEU_CAM.partCamMax) : JEU_CAM.partCam,
    };
  } catch {
    return null;
  }
}

export function memoriserCam(m: MiseJeuCam) {
  try {
    const v: CamMemorisee = { cam: m.cam, camEnHaut: m.camEnHaut !== false, partCam: m.partCam ?? JEU_CAM.partCam };
    localStorage.setItem(CLE, JSON.stringify(v));
  } catch {
    /* stockage indisponible (navigation privée…) : tant pis */
  }
}

/** Mise en page Jeu + webcam de départ : le dernier cadre mémorisé, sinon les valeurs par défaut. */
export function miseJeuCamDepart(mem: CamMemorisee | null): MiseJeuCam {
  return {
    type: 'jeuCam',
    cam: { ...(mem?.cam ?? JEU_CAM.cam) },
    camEnHaut: mem?.camEnHaut ?? true,
    partCam: mem?.partCam ?? JEU_CAM.partCam,
    x: 0.5,
  };
}

/**
 * Part de la largeur source montrée dans la bande de jeu (1080 × (1 − partCam) × 1920), recadrée au centre x.
 * `aspect` = largeur / hauteur de la source.
 */
export function partJeuVisible(aspect: number, partCam: number): number {
  const aspectBande = 1080 / Math.max(1, (1 - partCam) * 1920);
  return Math.min(1, aspectBande / Math.max(0.01, aspect));
}

/** Centre x de la zone de jeu, gardé dans l'image. */
export function bornerXJeu(x: number, part: number): number {
  return auCentieme(borne(x, part / 2, 1 - part / 2));
}

/** Déplace le cadre de (dx, dy) en restant dans l'image. */
export function deplacerCadre(c: Cadre, dx: number, dy: number): Cadre {
  return { ...c, x: auCentieme(borne(c.x + dx, 0, 1 - c.l)), y: auCentieme(borne(c.y + dy, 0, 1 - c.h)) };
}

/** Redimensionne le cadre en tirant un coin ; le coin opposé reste fixe. Taille minimale JEU_CAM.cadreMin. */
export function redimensionnerCadre(c: Cadre, coin: Coin, dx: number, dy: number): Cadre {
  const min = JEU_CAM.cadreMin;
  let { x, y, l, h } = c;
  if (coin === 'hg' || coin === 'bg') {
    const droite = x + l;
    x = borne(x + dx, 0, droite - min);
    l = droite - x;
  } else l = borne(l + dx, min, 1 - x);
  if (coin === 'hg' || coin === 'hd') {
    const bas = y + h;
    y = borne(y + dy, 0, bas - min);
    h = bas - y;
  } else h = borne(h + dy, min, 1 - y);
  return { x: auCentieme(x), y: auCentieme(y), l: auCentieme(l), h: auCentieme(h) };
}
