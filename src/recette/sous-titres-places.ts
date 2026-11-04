// Sous-titres placés sur la vidéo finale (fonctions pures).
// 1. Chaque mot est en TEMPS SOURCE : on le convertit en temps de SORTIE pour chaque plan qui le contient
//    (un passage réutilisé fait réapparaître ses mots ; un mot coupé hors des plans disparaît).
// 2. Les mots sont regroupés en lignes de `parLigne` mots. Une ligne s'arrête aussi sur un trou de plus
//    de 0,6 s (dans la vidéo finale ou dans la source), à la fin d'une phrase (. ! ? …) ou si le mot
//    suivant ne suit pas dans la liste.
// Le dessin (moteur/couches/sous-titres.ts) et la liste de l'interface (lignesSousTitres) lisent ces MÊMES lignes.

import type { PlanPlace } from './chronologie';
import { SOUS_TITRES, ySousTitres } from './defauts';
import type { MiseEnPage, Mot, Sec, SousTitres } from './types';

/** Un trou plus long que ça entre deux mots coupe la ligne. */
export const TROU_MAX: Sec = 0.6;

/** Un mot posé sur la vidéo finale. */
export interface MotPlace {
  /** Indice du mot dans sousTitres.mots. */
  k: number;
  mot: Mot;
  /** Temps de SORTIE du début et de la fin du mot. */
  t0: Sec;
  t1: Sec;
}

/** Une ligne affichée de t0 (début de son 1er mot) à t1 (fin de son dernier mot). */
export interface LignePlacee {
  /** Indices [k0, k1[ des mots dans sousTitres.mots. */
  k0: number;
  k1: number;
  t0: Sec;
  t1: Sec;
  mots: MotPlace[];
}

export interface SousTitresPlaces {
  style: string;
  /** Centre vertical du bloc (0 = haut, 1 = bas). */
  y: number;
  lignes: LignePlacee[];
}

/** Mots visibles dans la vidéo finale, dans l'ordre de la vidéo. Un mot appartient au plan qui contient son milieu. */
export function placerMots(plans: PlanPlace[], mots: Mot[], src: string): MotPlace[] {
  const res: MotPlace[] = [];
  for (const p of plans) {
    if (p.src !== src) continue;
    mots.forEach((mot, k) => {
      const milieu = (mot[1] + mot[2]) / 2;
      if (milieu < p.de || milieu >= p.a) return;
      const t0 = p.t0 + (Math.max(mot[1], p.de) - p.de) / p.vit;
      const t1 = p.t0 + (Math.min(mot[2], p.a) - p.de) / p.vit;
      res.push({ k, mot, t0, t1 });
    });
  }
  return res;
}

const FIN_DE_PHRASE = /[.!?…]$/;

/** Regroupe les mots placés en lignes. */
export function decouperLignes(mots: MotPlace[], parLigne: number): LignePlacee[] {
  const lignes: LignePlacee[] = [];
  let courante: MotPlace[] = [];
  const fermer = () => {
    const premier = courante[0];
    const dernier = courante[courante.length - 1];
    if (premier && dernier) lignes.push({ k0: premier.k, k1: dernier.k + 1, t0: premier.t0, t1: dernier.t1, mots: courante });
    courante = [];
  };
  for (const m of mots) {
    const prec = courante[courante.length - 1];
    const couper =
      prec !== undefined &&
      (courante.length >= parLigne ||
        m.k !== prec.k + 1 ||
        m.t0 - prec.t1 > TROU_MAX || // trou dans la vidéo finale
        m.mot[1] - prec.mot[2] > TROU_MAX || // saut dans la source (une coupe a retiré un passage)
        FIN_DE_PHRASE.test(prec.mot[0]));
    if (couper) fermer();
    courante.push(m);
  }
  fermer();
  return lignes;
}

/** Sous-titres de la vidéo finale (null s'il n'y en a pas, ou s'ils sont encore à transcrire). */
export function placerSousTitres(st: SousTitres | null, plans: PlanPlace[], mise: MiseEnPage, premiere: string): SousTitresPlaces | null {
  if (!st || st.mots === 'auto') return null;
  const parLigne = Math.max(1, st.parLigne ?? SOUS_TITRES.parLigne);
  const mots = placerMots(plans, st.mots, st.src ?? premiere);
  return {
    style: st.style ?? SOUS_TITRES.style,
    y: st.y ?? ySousTitres(mise),
    lignes: decouperLignes(mots, parLigne),
  };
}
